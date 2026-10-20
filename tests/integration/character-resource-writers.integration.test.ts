// Real PostgreSQL integration tests, APPLICATION AUTHORITY LAYER --
// CHARACTER MECHANICS PHASE A5, Checkpoint 1 FINAL HARDENING.
//
// Unlike tests/integration/character-resource-atomic.integration.test.ts
// (which exercises `character-resource-atomic.ts` directly), these tests
// call the ACTUAL application functions a real request reaches --
// `expendResourceAuthoritatively`/`restoreResourceAuthoritatively`
// (server/utils/character-resources.ts, the manual Sheet button's own
// authority), `consumeActionResourceCosts`
// (server/utils/character-resource-actions.ts, the multi-resource batch
// authority), and `applyRecoveryAction`'s own resource-recovery slice
// (server/utils/character-recovery.ts) -- with `character-resource-atomic.ts`
// and PostgreSQL itself NEVER mocked.
//
// WHAT REMAINS MOCKED, STATED HONESTLY: `assembleCharacter`, `getDerivedCharacter`,
// `getWorldRuntime`'s OWN Directus-backed reads (species/class/background/ability
// scores -- Directus itself, not this phase's concern) are mocked to return a
// real-shaped blueprint, exactly as character-resource-actions.test.ts's and
// character-recovery.test.ts's own existing unit tests already do -- this
// phase is about the RESOURCE WRITE boundary specifically, not re-proving the
// whole Rules Engine pipeline against a real database. The Rules RUNTIME
// itself (`createWorldRuntime`) is REAL, built from the actual
// eldra-dnd5e-2024 package on disk, so the resource ids/maxima/recovery
// rules these tests exercise are the real, authored ones (Rage), never a
// hand-faked number.
//
// Requires ELDRA_RESOURCE_DB_URL (least-privilege role) and, for the test
// harness's own setup/teardown only, ELDRA_RESOURCE_TEST_ADMIN_DB_URL (a
// superuser connection on the SAME disposable instance) -- see this
// checkpoint's own report for the exact schema/grants this was verified
// against. Never production, never the live dev Directus database.

import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'

const DATABASE_URL = process.env.ELDRA_RESOURCE_DB_URL
const ADMIN_DATABASE_URL = process.env.ELDRA_RESOURCE_TEST_ADMIN_DB_URL ?? DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('ELDRA_RESOURCE_DB_URL is not set -- see this file\'s own header.')
}

const { assembleCharacterMock, getWorldRuntimeMock, getDerivedCharacterMock, loadCharacterResourcesMock } = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  getDerivedCharacterMock: vi.fn(),
  // character-resource-actions.ts's own pre-check read -- non-authoritative
  // (see that module's own header); mocked here the same way the rest of
  // the Directus-backed read surface is, since this suite's job is the
  // WRITE boundary, not this pre-check's own message quality.
  loadCharacterResourcesMock: vi.fn()
}))

vi.mock('../../server/utils/character-assembly', () => ({ assembleCharacter: assembleCharacterMock }))
vi.mock('../../server/utils/world-runtime-service', () => ({ getWorldRuntime: getWorldRuntimeMock }))
vi.mock('../../server/utils/character-derived', () => ({ getDerivedCharacter: getDerivedCharacterMock }))
vi.mock('../../server/utils/character-resources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/utils/character-resources')>()),
  loadCharacterResources: loadCharacterResourcesMock
}))
vi.mock('../../server/utils/character-health', () => ({
  loadCharacterHealth: vi.fn().mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } }),
  saveCharacterHealth: vi.fn().mockImplementation(async (_id: unknown, stored: unknown) => stored)
}))
vi.mock('../../server/utils/character-spellcasting', () => ({
  loadCharacterSpellcasting: vi.fn().mockResolvedValue({ spells: [], expendedSlots: {} }),
  saveCharacterSpellcasting: vi.fn().mockImplementation(async (_id: unknown, stored: unknown) => stored)
}))
vi.mock('../../server/utils/roll-events', () => ({ createHitDieRollEvent: vi.fn() }))
vi.mock('../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: vi.fn().mockResolvedValue({ worldId: '5', packs: [], species: [], classes: [], backgrounds: [], feats: [], items: [], spells: [], monsters: [], subclasses: [] })
}))

import { createWorldRuntime } from '../../app/lib/rules/world-runtime'
import { parseExpression } from '../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../app/lib/rules/types'
import { findRulesFacet } from '../../app/lib/content-rules'
import {
  expendResourceAuthoritatively,
  restoreResourceAuthoritatively
} from '../../server/utils/character-resources'
import { consumeActionResourceCosts } from '../../server/utils/character-resource-actions'
import { applyRecoveryAction } from '../../server/utils/character-recovery'
import { __closePoolForTesting } from '../../server/utils/character-resource-atomic'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const SYNTHETIC_ACTION_ID = 'action:test.spend-rage'

function hydrate(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(hydrate)
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string' && !record.ast) {
      const parsed = parseExpression(record.text)
      if (!parsed.ok) throw new Error(`Failed to parse: ${record.text}`)
      return { text: record.text, ast: parsed.ast }
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, hydrate(v)]))
  }
  return node
}

function loadRealRuntime() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  const amountExpr = parseExpression('1')
  if (!amountExpr.ok) throw new Error('failed to parse synthetic cost amount')
  const synthetic: Definition = {
    id: SYNTHETIC_ACTION_ID,
    kind: 'action',
    label: 'Test: Spend One Rage',
    costs: [{ resource: 'resource:rage', amount: { text: '1', ast: amountExpr.ast } }]
  } as Definition
  const result = createWorldRuntime(manifest, [...definitions, synthetic], '5', null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

function barbarianBlueprint() {
  return {
    worldId: '5', characterId: String(characterId), characterTitle: 'Rager',
    species: { status: 'resolved' as const, entry: baseEntry({ slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: { ...baseEntry({ slug: 'barbarian-xphb' }), rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined } },
    background: { status: 'resolved' as const, entry: baseEntry({ slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } },
    rulesChoices: null, inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'barbarian-xphb' }, level: 1 }] },
    resources: null, packs: []
  }
}

let admin: Client
let worldAId: number
let worldBId: number
let characterId: number

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_DATABASE_URL })
  await admin.connect()
})

afterAll(async () => {
  await admin.end()
  await __closePoolForTesting()
})

beforeEach(async () => {
  vi.clearAllMocks()
  await admin.query('TRUNCATE block_instances, entities RESTART IDENTITY')
  worldAId = 1001
  worldBId = 2002
  const row = await admin.query(
    "INSERT INTO entities (world_id, title, slug, entity_type) VALUES ($1, 'Rager', 'rager', 'pc') RETURNING id",
    [worldAId]
  )
  characterId = row.rows[0].id

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({ configured: true, ok: true, runtime, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: barbarianBlueprint() })
  getDerivedCharacterMock.mockResolvedValue({
    available: true,
    derived: {
      byCategory: {
        spellcasting: [],
        progression: [{ id: 'value:level', value: 1 }],
        // Needed only by applyRecoveryAction's own loadRecoveryNumbers (HP/Hit-Dice numbers this
        // suite's own resource-recovery test transitively needs, even though it asserts nothing
        // about HP itself) -- harmless, legal level-1 Barbarian numbers.
        hit_points: [
          { id: 'value:hit_points.max', value: 13 },
          { id: 'value:hit_points.hit_dice_max', value: 1 },
          { id: 'value:hit_points.hit_die_average_roll', value: 7 },
          { id: 'value:hit_points.long_rest_hit_dice_recovery', value: 1 },
          { id: 'value:hit_points.hit_die_size', value: 12 }
        ],
        ability: [{ id: 'value:ability.con.mod', value: 2 }]
      },
      resources: [{ id: 'resource:rage', label: 'Rage', max: 2, expended: 0, remaining: 2, recovery: [{ trigger: 'long-rest', amount: 'full' }], presentation: { style: 'pool' } }],
      tables: []
    }
  })
  loadCharacterResourcesMock.mockResolvedValue({ expended: {} })
})

afterEach(async () => {
  await admin.query('TRUNCATE block_instances, entities RESTART IDENTITY')
})

async function readResourcesRow(entityId: number) {
  const res = await admin.query("SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'", [entityId])
  return res.rows[0] ?? null
}

describe('expendResourceAuthoritatively / restoreResourceAuthoritatively -- the REAL manual Sheet-button authority, real Postgres', () => {
  it('manual expenditure persists through to a real row', async () => {
    const result = await expendResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage', 2)
    expect(result.ok).toBe(true)
    const row = await readResourcesRow(characterId)
    expect(row?.data.expended).toEqual({ 'resource:rage': 1 })
  })

  it('restoration persists through to a real row', async () => {
    await expendResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage', 2)
    const result = await restoreResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage')
    expect(result.ok).toBe(true)
    const row = await readResourcesRow(characterId)
    expect(row?.data.expended['resource:rage'] ?? 0).toBe(0)
  })

  it('first-use resource-block creation happens through the real authority, on a real row', async () => {
    expect(await readResourcesRow(characterId)).toBeNull()
    await expendResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage', 2)
    expect(await readResourcesRow(characterId)).not.toBeNull()
  })

  it('insufficient-resource rejection is real, not mocked', async () => {
    await expendResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage', 2)
    await expendResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage', 2)
    const result = await expendResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage', 2)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('insufficient-resource')
  })

  it('wrong-world rejection is real, not mocked', async () => {
    const result = await expendResourceAuthoritatively(String(worldBId), String(characterId), 'resource:rage', 2)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-found')
    expect(await readResourcesRow(characterId)).toBeNull()
  })

  it('wrong-character (nonexistent) rejection is real, not mocked', async () => {
    const result = await expendResourceAuthoritatively(String(worldAId), '999999', 'resource:rage', 2)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-found')
  })

  it('fresh persisted-state readback (a second, independent read) sees exactly what was written', async () => {
    await expendResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage', 2)
    const freshRead = await admin.query("SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'", [characterId])
    expect(freshRead.rows[0].data).toEqual({ expended: { 'resource:rage': 1 } })
  })

  it('SQL injection through a crafted resourceId is impossible -- parameterized queries throughout', async () => {
    const maliciousId = "resource:rage'; DROP TABLE block_instances; --"
    const result = await expendResourceAuthoritatively(String(worldAId), String(characterId), maliciousId, 5)
    // The malicious string is just an ordinary (if unusual) resourceId value to a parameterized
    // query -- it is treated as DATA, never SQL. It succeeds as an ordinary first-ever expenditure
    // under that literal key, and critically, block_instances still exists afterward.
    expect(result.ok).toBe(true)
    const tableStillExists = await admin.query("SELECT to_regclass('block_instances') IS NOT NULL AS exists")
    expect(tableStillExists.rows[0].exists).toBe(true)
    const row = await readResourcesRow(characterId)
    expect(row?.data.expended[maliciousId]).toBe(1)
  })
})

describe('consumeActionResourceCosts -- the REAL multi-resource batch authority, real Postgres', () => {
  it('a real action consumption persists through to a real row', async () => {
    const result = await consumeActionResourceCosts(String(worldAId), String(characterId), SYNTHETIC_ACTION_ID)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.consumed).toEqual([{ resourceId: 'resource:rage', amount: 1, remaining: 1 }])
    const row = await readResourcesRow(characterId)
    expect(row?.data.expended).toEqual({ 'resource:rage': 1 })
  })

  it('insufficient remaining rejects for real and writes nothing', async () => {
    await consumeActionResourceCosts(String(worldAId), String(characterId), SYNTHETIC_ACTION_ID)
    await consumeActionResourceCosts(String(worldAId), String(characterId), SYNTHETIC_ACTION_ID)
    const before = await readResourcesRow(characterId)

    getDerivedCharacterMock.mockResolvedValue({
      available: true,
      derived: {
        byCategory: { spellcasting: [], progression: [{ id: 'value:level', value: 1 }] },
        resources: [{ id: 'resource:rage', label: 'Rage', max: 2, expended: 2, remaining: 0, recovery: [], presentation: { style: 'pool' } }],
        tables: []
      }
    })
    loadCharacterResourcesMock.mockResolvedValue({ expended: { 'resource:rage': 2 } })

    const result = await consumeActionResourceCosts(String(worldAId), String(characterId), SYNTHETIC_ACTION_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('insufficient-resource')
    const after = await readResourcesRow(characterId)
    expect(after?.data).toEqual(before?.data)
  })
})

describe('applyRecoveryAction -- the REAL Long Rest resource-recovery authority, real Postgres', () => {
  it('a real Long Rest recovers Rage through to a real row', async () => {
    await expendResourceAuthoritatively(String(worldAId), String(characterId), 'resource:rage', 2)
    expect((await readResourcesRow(characterId))?.data.expended).toEqual({ 'resource:rage': 1 })

    const result = await applyRecoveryAction(String(worldAId), String(characterId), { type: 'long-rest' }, 'account-1')
    expect(result.ok).toBe(true)

    const row = await readResourcesRow(characterId)
    expect(row?.data.expended['resource:rage'] ?? 0).toBe(0)
  })
})
