// Unit tests for server/utils/character-resource-actions.ts -- D&D 2024
// Character Rules Phase 2A.2, RESOURCE ACTION CONSUMPTION FOUNDATION.
//
// No Action Definition in the real shipped package declares a `costs` entry
// yet (this phase's own explicit scope: foundation only, not a class action
// catalogue) -- so, mirroring character-progression-plan.test.ts's own
// precedent for proving a generic mechanism against SYNTHETIC content, one
// synthetic `kind: 'action'` Definition with a real cost
// (`resource:rage`, the real shipped Resource) is appended to the
// REAL on-disk package's own definitions before building the runtime. Every
// NUMBER this test asserts on (Rage's own max) is still the real formula;
// only the Action itself is synthetic.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getDerivedCharacterMock, assembleCharacterMock, getWorldRuntimeMock,
  loadCharacterResourcesMock, expendCharacterResourcesAtomicMock
} = vi.hoisted(() => ({
  getDerivedCharacterMock: vi.fn(),
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  loadCharacterResourcesMock: vi.fn(),
  // CHARACTER MECHANICS PHASE A5, Checkpoint 1 -- the actual batch mutation
  // now goes through character-resource-atomic.ts (its own real behavior
  // is proven against a real PostgreSQL instance in
  // tests/integration/character-resource-atomic.integration.test.ts);
  // `loadCharacterResourcesMock` remains only for the pre-check this module
  // still performs for a precise, per-resource error message.
  expendCharacterResourcesAtomicMock: vi.fn()
}))

vi.mock('../../../server/utils/character-derived', () => ({
  getDerivedCharacter: getDerivedCharacterMock
}))
vi.mock('../../../server/utils/character-assembly', () => ({
  assembleCharacter: assembleCharacterMock
}))
vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))
vi.mock('../../../server/utils/character-resources', () => ({
  loadCharacterResources: loadCharacterResourcesMock
}))
vi.mock('../../../server/utils/character-resource-atomic', () => ({
  expendCharacterResourcesAtomic: expendCharacterResourcesAtomicMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { consumeActionResourceCosts } from '../../../server/utils/character-resource-actions'

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

function loadRuntimeWithSyntheticAction() {
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
    worldId: '5', characterId: '42', characterTitle: 'Rager',
    species: { status: 'resolved' as const, entry: baseEntry({ slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: { ...baseEntry({ slug: 'barbarian-xphb' }), rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined } },
    background: { status: 'resolved' as const, entry: baseEntry({ slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } },
    rulesChoices: null, inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'barbarian-xphb' }, level: 1 }] },
    resources: null, packs: []
  }
}

beforeEach(() => {
  getDerivedCharacterMock.mockReset()
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  loadCharacterResourcesMock.mockReset()
  expendCharacterResourcesAtomicMock.mockReset()

  const runtime = loadRuntimeWithSyntheticAction()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: barbarianBlueprint() })
  // Level-1 Barbarian: Rage max is 2 (real formula). `getDerivedCharacter`
  // is mocked directly here (its own correctness is proven exhaustively by
  // character-resources-vertical-slices.test.ts) -- this file's job is
  // only to prove the CONSUMPTION authority layered on top of it.
  getDerivedCharacterMock.mockResolvedValue({
    available: true,
    derived: { resources: [{ id: 'resource:rage', label: 'Rage', max: 2, expended: 0, remaining: 2, recovery: [], presentation: { style: 'pool' } }] }
  })
  loadCharacterResourcesMock.mockResolvedValue({ expended: {} })
  expendCharacterResourcesAtomicMock.mockResolvedValue({ ok: true, expended: { 'resource:rage': 1 } })
})

describe('consumeActionResourceCosts -- authority', () => {
  it('a known action with an available, acquired resource succeeds and consumes exactly the declared amount', async () => {
    const result = await consumeActionResourceCosts('5', '42', SYNTHETIC_ACTION_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.consumed).toEqual([{ resourceId: 'resource:rage', amount: 1, remaining: 1 }])
    expect(expendCharacterResourcesAtomicMock).toHaveBeenCalledWith({
      worldId: '5', characterId: '42', costs: [{ resourceId: 'resource:rage', amount: 1, max: 2 }]
    })
  })

  it('an unknown action is rejected, and nothing is persisted', async () => {
    const result = await consumeActionResourceCosts('5', '42', 'action:does-not-exist')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unknown-action')
    expect(expendCharacterResourcesAtomicMock).not.toHaveBeenCalled()
  })

  it('a resource this character has NOT acquired is rejected even if the Definition exists', async () => {
    getDerivedCharacterMock.mockResolvedValue({ available: true, derived: { resources: [] } })

    const result = await consumeActionResourceCosts('5', '42', SYNTHETIC_ACTION_ID)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('resource-not-acquired')
    expect(expendCharacterResourcesAtomicMock).not.toHaveBeenCalled()
  })

  it('insufficient remaining (per the pre-check) rejects the action and consumes NOTHING -- failure never partially applies', async () => {
    loadCharacterResourcesMock.mockResolvedValue({ expended: { 'resource:rage': 2 } })
    getDerivedCharacterMock.mockResolvedValue({
      available: true,
      derived: { resources: [{ id: 'resource:rage', label: 'Rage', max: 2, expended: 2, remaining: 0, recovery: [], presentation: { style: 'pool' } }] }
    })

    const result = await consumeActionResourceCosts('5', '42', SYNTHETIC_ACTION_ID)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('insufficient-resource')
    expect(expendCharacterResourcesAtomicMock).not.toHaveBeenCalled()
  })

  it('the atomic module is the SOLE authority: if it rejects (e.g. a last-moment race the pre-check could not see), nothing is treated as consumed', async () => {
    expendCharacterResourcesAtomicMock.mockResolvedValue({ ok: false, reason: 'insufficient-resource', message: 'raced' })

    const result = await consumeActionResourceCosts('5', '42', SYNTHETIC_ACTION_ID)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('insufficient-resource')
  })

  it('a persistence failure from the atomic module is reported as resource-persistence-failure, not silently swallowed', async () => {
    expendCharacterResourcesAtomicMock.mockResolvedValue({ ok: false, reason: 'persistence-unconfigured', message: 'not configured' })

    const result = await consumeActionResourceCosts('5', '42', SYNTHETIC_ACTION_ID)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('resource-persistence-failure')
  })

  it('a character-not-found derived result is reported honestly', async () => {
    getDerivedCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })

    const result = await consumeActionResourceCosts('5', '999', SYNTHETIC_ACTION_ID)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
  })
})
