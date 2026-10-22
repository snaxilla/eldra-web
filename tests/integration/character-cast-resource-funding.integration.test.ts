// Real PostgreSQL integration test -- CHARACTER MECHANICS PHASE A5, Phase 3
// (Resource-Funded Spellcasting).
//
// Proves the REAL end-to-end authority -- castSpellUtility -> resolveCastFunding ->
// checkResourceCastAvailability (character-cast.ts) -> expendResourceAuthoritatively
// (character-resources.ts) -> expendCharacterResourcesAtomic (character-resource-atomic.ts) --
// against a disposable Postgres instance with the real `json` column type and the real
// least-privilege `eldra_resource_writer` role, exactly like this suite's sibling integration
// tests. Directus (`directusServiceRequest`/`getWorldContentCatalogue`) is mocked -- the one
// boundary with no Postgres counterpart -- and the Rules runtime is the REAL, shipped
// `eldra-dnd5e-2024` package (`createWorldRuntime`), never a hand-typed fixture, so Archfey
// Patron's/Warrior of Shadow's own real authored facets (dnd5e-2024.ts) drive this test exactly
// as they would drive a real character.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { __closePoolForTesting, reduceCharacterResourcesAtomic } from '../../server/utils/character-resource-atomic'

const DATABASE_URL = process.env.ELDRA_RESOURCE_DB_URL
const ADMIN_DATABASE_URL = process.env.ELDRA_RESOURCE_TEST_ADMIN_DB_URL ?? DATABASE_URL

if (!DATABASE_URL) {
  throw new Error(
    'ELDRA_RESOURCE_DB_URL is not set -- see character-resource-atomic.integration.test.ts\'s own header.'
  )
}

const { getWorldContentCatalogueMock, directusServiceRequestMock, getWorldRuntimeMock } = vi.hoisted(() => ({
  getWorldContentCatalogueMock: vi.fn(),
  directusServiceRequestMock: vi.fn(),
  getWorldRuntimeMock: vi.fn()
}))

vi.mock('../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))
vi.mock('../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))
vi.mock('../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

const { castSpellUtility } = await import('../../server/utils/character-cast')
const { getDerivedCharacter } = await import('../../server/utils/character-derived')
const { createWorldRuntime } = await import('../../app/lib/rules/world-runtime')
const { parseExpression } = await import('../../app/lib/rules/parser')
const { findRulesFacet } = await import('../../app/lib/content-rules')
const { resolveDnd5eSpellMechanics } = await import('../../app/lib/spell-mechanics/dnd5e')
const rows = JSON.parse(readFileSync('tests/lib/content-presentation/fixtures/5etools-real-rows.json', 'utf8')).xphb.spells
const MISTY_STEP_MECHANICS = resolveDnd5eSpellMechanics(rows['Misty Step'])

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'

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
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8'))
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as any[]
  const result = createWorldRuntime(manifest, definitions, '1001', null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function catalogueEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

let admin: Client
let worldId: number
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
  await admin.query('TRUNCATE block_instances, entities RESTART IDENTITY')
  worldId = 1001
  const e = await admin.query(
    "INSERT INTO entities (world_id, title, slug, entity_type) VALUES ($1, 'Test Warlock', 'test-warlock', 'pc') RETURNING id",
    [worldId]
  )
  characterId = e.rows[0].id

  getWorldContentCatalogueMock.mockReset()
  directusServiceRequestMock.mockReset()
  getWorldRuntimeMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
})

afterEach(async () => {
  await admin.query('TRUNCATE block_instances, entities RESTART IDENTITY')
})

// Archfey Warlock, Level 3, CHA 18 (+4 mod -> Steps of the Fey max 4), with Misty Step
// resolved via the real class/subclass facets -- the Expanded Spell List grant
// (archfey-patron-xphb's own `misty-step-xphb` FixedSpellGrant) is what makes it "prepared".
// `cha` is parameterized (CHARACTER MECHANICS PHASE A5, Phase 3 FINAL COMPLETION, section 4 --
// DYNAMIC RESOURCE MAXIMUM) so the same fixture can re-register this mock mid-test with a
// different Charisma score, proving `resource:steps_of_the_fey`'s own `max` expression
// (`if(@value:ability.cha.mod>=1,@value:ability.cha.mod,1)`, packages/eldra-dnd5e-2024/definitions.json)
// is re-evaluated fresh on every read -- never a persisted/cached number -- through the REAL Rules
// Engine, never a hand-asserted arithmetic shortcut in the test itself.
function mockArchfeyWarlock(cha = 18) {
  const catalogue = {
    worldId: String(worldId), packs: [], items: [], monsters: [],
    species: [catalogueEntry({ title: 'Human', slug: 'human-xphb' })],
    classes: [catalogueEntry({
      title: 'Warlock', slug: 'warlock-xphb',
      rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb') ?? undefined
    })],
    subclasses: [catalogueEntry({
      title: 'Archfey Patron', slug: 'archfey-patron-xphb', parentClassSlug: 'warlock-xphb',
      rulesFacet: findRulesFacet('dnd5e.2024', 'subclass', 'archfey-patron-xphb') ?? undefined
    })],
    backgrounds: [catalogueEntry({ title: 'Sage', slug: 'sage-xphb' })],
    feats: [],
    spells: [catalogueEntry({ title: 'Misty Step', slug: 'misty-step-xphb', spellMechanics: MISTY_STEP_MECHANICS })]
  }
  getWorldContentCatalogueMock.mockResolvedValue(catalogue)

  directusServiceRequestMock.mockImplementation(async (path: string, options?: any) => {
    if (path === `/items/entities/${characterId}`) {
      return { data: { id: characterId, world_id: worldId, title: 'Test Warlock', entity_type: 'pc' } }
    }
    if (path === '/items/block_instances') {
      const requestedKeys: string[] = options?.query?.filter?._and?.[1]?.block_key?._in ?? []
      expect(requestedKeys).not.toContain('resources') // the hotfix's own contract, re-verified here too
      return {
        data: [
          {
            block_key: 'catalogue_selection',
            data: {
              species: { packageId: 'eldra.content.xphb', slug: 'human-xphb' },
              class: { packageId: 'eldra.content.xphb', slug: 'warlock-xphb' },
              background: { packageId: 'eldra.content.xphb', slug: 'sage-xphb' }
            }
          },
          { block_key: 'ability_scores', data: { method: 'standard-array', scores: { str: 8, dex: 12, con: 12, int: 10, wis: 10, cha } } },
          {
            block_key: 'progression',
            data: {
              classes: [{
                classRef: { packageId: 'eldra.content.xphb', slug: 'warlock-xphb' },
                level: 3,
                subclassRef: { packageId: 'eldra.content.xphb', slug: 'archfey-patron-xphb' }
              }],
              feats: []
            }
          },
          // Simulates the one-time effect of a real progression Confirm having already run
          // `resolveFixedSpellGrants` for Archfey's own Expanded Spell List at some earlier
          // point -- that resolution is NOT re-derived live by assembleCharacter (it is a
          // persisted fact, like any other known/prepared spell), so it is seeded directly here,
          // exactly as it would already exist on a real character's own stored record.
          {
            block_key: 'spellcasting',
            data: {
              spells: [{ instanceId: 'spell-1', ref: { packageId: 'eldra.content.xphb', slug: 'misty-step-xphb' }, known: false, prepared: true }],
              expendedSlots: {}
            }
          }
        ]
      }
    }
    throw new Error(`Unexpected Directus path in test: ${path}`)
  })
}

const CAST_INPUT_BASE = { worldId: '1001', rollerUserId: 'account-1', visibility: 'private' as const }

describe('castSpellUtility -- resource-funded, real Postgres (CHARACTER MECHANICS PHASE A5, Phase 3)', () => {
  beforeEach(() => {
    mockArchfeyWarlock()
  })

  it('a real resource-funded cast persists through to a real row, and a fresh read reflects it', async () => {
    const result = await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resourceContext).toEqual({ resourceId: 'resource:steps_of_the_fey', max: 4, expended: 1, remaining: 3 })

    const row = await admin.query(
      "SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'",
      [characterId]
    )
    expect(row.rows[0].data).toEqual({ expended: { 'resource:steps_of_the_fey': 1 } })
  })

  it('four real expenditures exhaust the CHA-mod pool (max 4), the fifth is honestly rejected', async () => {
    for (let i = 0; i < 4; i++) {
      const result = await castSpellUtility({
        ...CAST_INPUT_BASE, characterId: String(characterId),
        actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
      })
      expect(result.ok).toBe(true)
    }

    const fifth = await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
    })
    expect(fifth.ok).toBe(false)
    if (fifth.ok) return
    expect(fifth.reason).toBe('resource-unavailable')
  })

  it('CONCURRENT last-use expenditure: two simultaneous casts against the final remaining use -- exactly one succeeds', async () => {
    // Spend 3 of the 4 free uses up front, leaving exactly 1 remaining.
    for (let i = 0; i < 3; i++) {
      await castSpellUtility({
        ...CAST_INPUT_BASE, characterId: String(characterId),
        actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
      })
    }

    const [a, b] = await Promise.all([
      castSpellUtility({ ...CAST_INPUT_BASE, characterId: String(characterId), actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey' }),
      castSpellUtility({ ...CAST_INPUT_BASE, characterId: String(characterId), actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey' })
    ])

    const outcomes = [a, b]
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1)
    expect(outcomes.filter((r) => !r.ok && r.reason === 'resource-unavailable')).toHaveLength(1)

    const row = await admin.query(
      "SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'",
      [characterId]
    )
    expect(row.rows[0].data).toEqual({ expended: { 'resource:steps_of_the_fey': 4 } })
  })

  it('a FRESH read (simulating a page reload) sees the real persisted expenditure, never a stale/cached value', async () => {
    await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
    })

    // A second, fully independent call -- re-derives everything from scratch, exactly like a
    // fresh page load would, proving the expenditure is durable and visible beyond the call that
    // made it.
    const second = await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.resourceContext).toEqual({ resourceId: 'resource:steps_of_the_fey', max: 4, expended: 2, remaining: 2 })
  })

  it('REJECTS a wrong-owner resource -- a real resource id, but not one this character\'s Misty Step can be funded with', async () => {
    const result = await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:rage'
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-choice')

    const row = await admin.query("SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'", [characterId])
    expect(row.rows).toHaveLength(0) // nothing was ever written
  })

  // "Ordinary slot casting remains available when fundingResourceId is omitted" is proven in the
  // UNIT suite instead (tests/server/utils/character-cast.test.ts's own "an ORDINARY slot-funded
  // cast remains available..." test) -- that path never touches Postgres at all (spell slots are
  // Directus-backed, via a DIFFERENT module/access pattern, `character-spellcasting.ts`'s own
  // `dxFetch`, not `directusServiceRequest`), so it adds no real coverage here and would need a
  // second, unrelated mock boundary this file does not otherwise need.
})

// ---------------------------------------------------------------------------
// DYNAMIC RESOURCE MAXIMUM -- CHARACTER MECHANICS PHASE A5, Phase 3 FINAL
// FUNCTIONAL COMPLETION, section 4.
// ---------------------------------------------------------------------------
// `resource:steps_of_the_fey`'s own `max` expression
// (`if(@value:ability.cha.mod>=1,@value:ability.cha.mod,1)`) is re-evaluated by the REAL Rules
// Engine on every `getDerivedCharacter`/`castSpellUtility` read -- never persisted, never cached --
// exactly like every other derived number in this codebase. These tests change ONLY the mocked
// Charisma score between calls (never the resource definition, never the persisted `expended`
// record directly) and observe the effect through the same authoritative read/write paths real
// gameplay uses, proving the GENERIC resource-maximum machinery (app/lib/characters/resources.ts's
// own `clampExpendedToMaximum`) handles this correctly with zero Archfey-specific code anywhere.
describe('Dynamic Resource Maximum -- resource:steps_of_the_fey tracks the current Charisma modifier (CHARACTER MECHANICS PHASE A5, Phase 3 FINAL COMPLETION)', () => {
  it('a HIGHER Charisma score increases the resource max (CHA 20, +5 mod -> max 5)', async () => {
    mockArchfeyWarlock(20)
    const result = await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resourceContext).toEqual({ resourceId: 'resource:steps_of_the_fey', max: 5, expended: 1, remaining: 4 })
  })

  it('a LOWER Charisma score decreases the resource max, floored at 1 (CHA 8, -1 mod -> max 1, never 0 or negative)', async () => {
    mockArchfeyWarlock(8)
    const result = await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resourceContext).toEqual({ resourceId: 'resource:steps_of_the_fey', max: 1, expended: 1, remaining: 0 })

    // The floor is a real limit, not just a smaller max -- a second Cast against the same
    // single-use pool is honestly rejected, exactly like any other exhausted resource.
    const second = await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
    })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.reason).toBe('resource-unavailable')
  })

  it('a Charisma DROP after expenditure clamps the EFFECTIVE remaining to the new, lower max -- persisted expended count is untouched', async () => {
    // Three uses at CHA 18 (max 4), leaving one PERSISTED count of 3.
    mockArchfeyWarlock(18)
    for (let i = 0; i < 3; i++) {
      const result = await castSpellUtility({
        ...CAST_INPUT_BASE, characterId: String(characterId),
        actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
      })
      expect(result.ok).toBe(true)
    }

    // The persisted row genuinely says 3 -- nothing re-derives or rewrites it just by reading.
    const beforeDrop = await admin.query(
      "SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'", [characterId]
    )
    expect(beforeDrop.rows[0].data).toEqual({ expended: { 'resource:steps_of_the_fey': 3 } })

    // Charisma drops (a respec, a curse, an ability-score-drain effect -- the mechanism is out of
    // scope; only the OBSERVABLE EFFECT, "max is now lower than persisted expended," matters here)
    // to 10 (+0 mod -> floor 1 -> max 1). PERSISTED `expended` is still 3 -- only the Rules Engine's
    // own live max changed.
    mockArchfeyWarlock(10)
    const derived = await getDerivedCharacter(worldId, characterId)
    expect(derived.available).toBe(true)
    if (!derived.available) return
    const resource = derived.derived.resources.find((r) => r.id === 'resource:steps_of_the_fey')
    // `clampExpendedToMaximum` (app/lib/characters/resources.ts) clamps the EFFECTIVE expended
    // value down to the new max -- never negative remaining, never a raw `expended - max` leak.
    expect(resource).toEqual(expect.objectContaining({ max: 1, expended: 1, remaining: 0 }))

    // A Cast is correctly rejected against the clamped state -- no fabricated availability from
    // the stale, higher persisted count.
    const rejected = await castSpellUtility({
      ...CAST_INPUT_BASE, characterId: String(characterId),
      actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
    })
    expect(rejected.ok).toBe(false)
    if (rejected.ok) return
    expect(rejected.reason).toBe('resource-unavailable')

    // PERSISTENCE COMPATIBILITY -- the raw stored record is completely unaffected by the max
    // change; clamping is a READ-time presentation, never a write, so Charisma recovering later
    // would correctly restore the original 3-used/1-remaining state at CHA 18 with no data loss.
    const afterDrop = await admin.query(
      "SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'", [characterId]
    )
    expect(afterDrop.rows[0].data).toEqual({ expended: { 'resource:steps_of_the_fey': 3 } })
  })

  it('Long Rest recovery remains correct at a CHANGED (lower) max -- a full recovery always reaches that max, never the old one', async () => {
    // Three uses at CHA 18 (max 4), leaving a persisted count of 3.
    mockArchfeyWarlock(18)
    for (let i = 0; i < 3; i++) {
      await castSpellUtility({
        ...CAST_INPUT_BASE, characterId: String(characterId),
        actionId: 'spell:spell-1', fundingResourceId: 'resource:steps_of_the_fey'
      })
    }

    // Charisma drops to 10 (+0 mod -> floor 1 -> max 1) before the Long Rest.
    mockArchfeyWarlock(10)

    // The SAME atomic primitive the real Long Rest orchestrator (character-recovery.ts's own
    // `applyRecoveryAction`) calls for every acquired resource with a matching 'long-rest' rule --
    // `resource:steps_of_the_fey`'s own declared recovery (packages/eldra-dnd5e-2024/definitions.json).
    // A 'full' recovery unconditionally clears the persisted key regardless of what it held, so this
    // is correct independent of which max was in effect when the uses were spent.
    const recovered = await reduceCharacterResourcesAtomic({
      worldId, characterId, reductions: [{ resourceId: 'resource:steps_of_the_fey', amount: 'full' }]
    })
    expect(recovered.ok).toBe(true)

    const derived = await getDerivedCharacter(worldId, characterId)
    expect(derived.available).toBe(true)
    if (!derived.available) return
    const resource = derived.derived.resources.find((r) => r.id === 'resource:steps_of_the_fey')
    // Recovers to the CURRENT (lower, post-drop) max, never the max that was in effect when the
    // uses were originally spent -- a Long Rest reads the Rules Engine fresh, exactly like every
    // other recovery number in this codebase.
    expect(resource).toEqual(expect.objectContaining({ max: 1, expended: 0, remaining: 1 }))

    const row = await admin.query(
      "SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'", [characterId]
    )
    expect(row.rows[0].data).toEqual({ expended: {} })
  })
})
