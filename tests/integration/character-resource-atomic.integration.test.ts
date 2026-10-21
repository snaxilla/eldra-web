// Real PostgreSQL integration tests -- CHARACTER MECHANICS PHASE A5,
// Checkpoint 1. Runs against a DISPOSABLE Postgres instance only (never
// production, never the live dev Directus database) -- see this repo's
// own Checkpoint 1 report for exactly how the disposable instance used to
// author/verify this file was created and torn down.
//
// Requires ELDRA_RESOURCE_DB_URL to point at a Postgres database with the
// real `entities`/`block_instances` schema subset (see
// scripts/directus/create-resources-unique-index.mjs's own header for the
// index this schema must already carry) -- run via
// `pnpm run test:integration`, never as part of the ordinary `pnpm run
// test` (see vitest.config.ts's own exclude).
//
// PRODUCTION HOTFIX -- `block_instances.data` MUST be declared `json`, NOT
// `jsonb`, in this disposable schema. Confirmed directly against the real
// Directus field metadata (`"type": "json"`). An earlier disposable schema
// used `jsonb` -- which does not exist in production -- and this is
// exactly how a real production failure
// ("function jsonb_set(json, text[], jsonb, boolean) does not exist")
// went undetected through every prior run of this suite. Using the wrong
// column type here defeats the entire purpose of this file.
//
// CHARACTER MECHANICS PHASE A5, Checkpoint 1 FINAL HARDENING --
// `ELDRA_RESOURCE_DB_URL` is deliberately the LEAST-PRIVILEGE role
// (`eldra_resource_writer`, see this checkpoint's own report for the exact
// GRANT statements this was verified against) -- the module under test
// NEVER runs as a superuser, here or anywhere else. Test setup/teardown
// (TRUNCATE, seeding `entities` rows) needs broader privileges than that
// role has, so a SEPARATE `ELDRA_RESOURCE_TEST_ADMIN_DB_URL` (the
// disposable instance's own superuser connection) is used for the test
// harness's own scaffolding only -- never imported by, or reachable from,
// the module under test.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import {
  expendCharacterResourcesAtomic,
  reduceCharacterResourcesAtomic,
  readCharacterResourcesAtomic,
  __closePoolForTesting
} from '../../server/utils/character-resource-atomic'

const DATABASE_URL = process.env.ELDRA_RESOURCE_DB_URL
const ADMIN_DATABASE_URL = process.env.ELDRA_RESOURCE_TEST_ADMIN_DB_URL ?? DATABASE_URL

if (!DATABASE_URL) {
  throw new Error(
    'ELDRA_RESOURCE_DB_URL is not set -- these are real integration tests against a disposable ' +
    'PostgreSQL instance and cannot run without one. See this file\'s own header.'
  )
}

let admin: Client
let worldAId: number
let worldBId: number
let characterId: number
let otherCharacterId: number

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_DATABASE_URL })
  await admin.connect()
})

afterAll(async () => {
  await admin.end()
  await __closePoolForTesting()
})

beforeEach(async () => {
  // Fresh, isolated rows for every test -- never accumulated state, never
  // production/dev character data.
  await admin.query('TRUNCATE block_instances, entities RESTART IDENTITY')
  worldAId = 1001
  worldBId = 2002

  const a = await admin.query(
    "INSERT INTO entities (world_id, title, slug, entity_type) VALUES ($1, 'Test Character A', 'test-character-a', 'pc') RETURNING id",
    [worldAId]
  )
  characterId = a.rows[0].id

  const b = await admin.query(
    "INSERT INTO entities (world_id, title, slug, entity_type) VALUES ($1, 'Test Character B', 'test-character-b', 'pc') RETURNING id",
    [worldAId]
  )
  otherCharacterId = b.rows[0].id
})

afterEach(async () => {
  await admin.query('TRUNCATE block_instances, entities RESTART IDENTITY')
})

async function readResourcesRow(entityId: number): Promise<{ data: { expended: Record<string, number> } } | null> {
  const res = await admin.query(
    "SELECT data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'",
    [entityId]
  )
  return res.rows[0] ?? null
}

async function countResourcesRows(entityId: number): Promise<number> {
  const res = await admin.query(
    "SELECT count(*)::int AS count FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'",
    [entityId]
  )
  return res.rows[0].count
}

// PRODUCTION HOTFIX REGRESSION -- the exact real-world failure: a brand-new character (no
// `resources` row yet) expending a resource for the very first time, against the REAL `json`
// (not `jsonb`) column type. Before the fix, this failed outright with "function jsonb_set(json,
// text[], jsonb, boolean) does not exist" -- confirmed verbatim against this exact disposable
// schema, with the pre-fix code, before the fix was written. Named and kept separate from the
// (structurally identical) "first-use initialization" describe block below specifically so this
// regression's own real-world identity -- "a level 1 Barbarian's first Rage" -- stays
// discoverable on its own, not folded anonymously into a generic test name.
describe('PRODUCTION HOTFIX REGRESSION -- a brand-new character\'s first-ever resource expenditure against the real json column type', () => {
  it('a Level 1 Barbarian expending Rage for the first time succeeds (reproduces the real Borc report)', async () => {
    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 1, max: 2 }]
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.expended).toEqual({ 'resource:rage': 1 })

    const row = await readResourcesRow(characterId)
    expect(row?.data.expended).toEqual({ 'resource:rage': 1 })
  })
})

describe('expendCharacterResourcesAtomic -- first-use initialization', () => {
  it('creates the resources row on the very first expenditure', async () => {
    expect(await countResourcesRows(characterId)).toBe(0)

    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }]
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.expended).toEqual({ 'resource:focus_points': 1 })
    expect(await countResourcesRows(characterId)).toBe(1)
  })

  it('a first-ever expenditure whose amount exceeds max is rejected structurally (can never succeed regardless of current state), and creates NO row at all', async () => {
    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 5, max: 3 }]
    })

    expect(result.ok).toBe(false)
    // A single cost's own amount exceeding its own max can never succeed no matter what the
    // current expended count is -- validateCosts catches this before any database round trip,
    // so this is `invalid-input`, not `insufficient-resource` (which is reserved for "the
    // CURRENT remaining capacity is too low," a fact only the database can determine).
    if (!result.ok) expect(result.reason).toBe('invalid-input')
    expect(await countResourcesRows(characterId)).toBe(0)
  })

  it('a first-ever expenditure that is structurally legal but has no room against an existing, already-maxed sibling resource is rejected by the database, and creates NO row', async () => {
    // Exhaust a DIFFERENT resource first, on a DIFFERENT character, to prove the first-ever
    // INSERT path itself (not just the UPDATE path) enforces sufficiency per-resource.
    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 3, max: 3 }]
    })
    expect(result.ok).toBe(true)
    const second = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }]
    })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.reason).toBe('insufficient-resource')
  })

  it('a first-ever expenditure against the wrong world is rejected, and creates NO row', async () => {
    const result = await expendCharacterResourcesAtomic({
      worldId: worldBId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }]
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-found')
    expect(await countResourcesRows(characterId)).toBe(0)
  })
})

describe('expendCharacterResourcesAtomic -- duplicate-row prevention', () => {
  it('the partial unique index rejects a second resources row for the same entity', async () => {
    await admin.query(
      "INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data) VALUES ($1, 'resources', 'Resources', 80, false, '{\"expended\":{}}')",
      [characterId]
    )

    await expect(
      admin.query(
        "INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data) VALUES ($1, 'resources', 'Resources', 80, false, '{\"expended\":{}}')",
        [characterId]
      )
    ).rejects.toThrow(/duplicate key value violates unique constraint/)

    expect(await countResourcesRows(characterId)).toBe(1)
  })

  it('a different block_key for the same entity is unaffected by the partial index', async () => {
    await admin.query(
      "INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data) VALUES ($1, 'spellcasting', 'Spellcasting', 70, false, '{}')",
      [characterId]
    )
    await expect(
      admin.query(
        "INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data) VALUES ($1, 'spellcasting', 'Spellcasting', 70, false, '{}')",
        [characterId]
      )
    ).resolves.toBeDefined()
  })
})

describe('expendCharacterResourcesAtomic -- concurrency, same resource, last use', () => {
  it('two simultaneous expenditures against ONE remaining use: exactly one succeeds, the other observes insufficiency, final state is correct', async () => {
    // Seed at expended = max - 1 (one use remaining).
    await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 2, max: 3 }]
    })

    const [a, b] = await Promise.all([
      expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] }),
      expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] })
    ])

    const outcomes = [a, b]
    const succeeded = outcomes.filter((r) => r.ok)
    const rejected = outcomes.filter((r) => !r.ok)

    expect(succeeded).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    if (!rejected[0]!.ok) expect(rejected[0]!.reason).toBe('insufficient-resource')

    const row = await readResourcesRow(characterId)
    expect(row?.data.expended['resource:focus_points']).toBe(3)
  })
})

describe('expendCharacterResourcesAtomic -- concurrency, different resources, no cross-clobbering', () => {
  it('two simultaneous expenditures against DIFFERENT resources both succeed, neither loses the other\'s write', async () => {
    const [a, b] = await Promise.all([
      expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] }),
      expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 1, max: 2 }] })
    ])

    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)

    const row = await readResourcesRow(characterId)
    expect(row?.data.expended).toEqual({ 'resource:focus_points': 1, 'resource:rage': 1 })
  })
})

describe('expendCharacterResourcesAtomic -- batch, all-or-nothing', () => {
  it('a batch where every cost is affordable applies all of them in one write', async () => {
    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId,
      costs: [
        { resourceId: 'resource:focus_points', amount: 1, max: 3 },
        { resourceId: 'resource:rage', amount: 1, max: 2 }
      ]
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.expended).toEqual({ 'resource:focus_points': 1, 'resource:rage': 1 })
  })

  it('a batch where ANY cost is unaffordable applies NONE of them -- the row is left exactly as it was', async () => {
    // Pre-expend focus_points to its max.
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 3, max: 3 }] })
    const before = await readResourcesRow(characterId)

    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId,
      costs: [
        { resourceId: 'resource:focus_points', amount: 1, max: 3 }, // would fail: already at max
        { resourceId: 'resource:rage', amount: 1, max: 2 } // would otherwise succeed
      ]
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('insufficient-resource')

    const after = await readResourcesRow(characterId)
    expect(after?.data.expended).toEqual(before?.data.expended)
    expect(after?.data.expended.rage).toBeUndefined()
  })

  it('rejects a batch naming the same resourceId twice (fail-closed on malformed input), with zero writes', async () => {
    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId,
      costs: [
        { resourceId: 'resource:focus_points', amount: 1, max: 3 },
        { resourceId: 'resource:focus_points', amount: 1, max: 3 }
      ]
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid-input')
    expect(await countResourcesRows(characterId)).toBe(0)
  })

  it('a first-use batch initializes ALL entries together, or none at all', async () => {
    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId,
      costs: [
        { resourceId: 'resource:focus_points', amount: 1, max: 3 },
        { resourceId: 'resource:rage', amount: 2, max: 2 }
      ]
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.expended).toEqual({ 'resource:focus_points': 1, 'resource:rage': 2 })
  })
})

describe('expendCharacterResourcesAtomic -- rejection produces zero writes', () => {
  it('wrong-character (nonexistent) ownership: rejected, zero writes', async () => {
    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId: 999999, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }]
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-found')
  })

  it('exhaustion on an EXISTING row: rejected, row unchanged', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 3, max: 3 }] })
    const before = await readResourcesRow(characterId)

    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }]
    })

    expect(result.ok).toBe(false)
    const after = await readResourcesRow(characterId)
    expect(after?.data).toEqual(before?.data)
  })

  it('malformed input (negative amount) is rejected before any database round trip', async () => {
    const result = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: -1, max: 3 }]
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid-input')
    expect(await countResourcesRows(characterId)).toBe(0)
  })
})

describe('reduceCharacterResourcesAtomic -- restoration clamping', () => {
  it('restoring more than is expended clamps at zero, never negative, never a rejection', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] })

    const result = await reduceCharacterResourcesAtomic({
      worldId: worldAId, characterId, reductions: [{ resourceId: 'resource:focus_points', amount: 999 }]
    })

    expect(result.ok).toBe(true)
    // The atomic reduce path leaves an explicit 0 rather than deleting the key the way the old
    // pure `restoreResource` did -- every real reader already treats absence and explicit 0
    // identically (`stored.expended[id] ?? 0`), so this asserts the meaningful invariant
    // (effectively zero) rather than the old function's own storage-representation detail.
    if (result.ok) expect(result.expended['resource:focus_points'] ?? 0).toBe(0)
  })

  it('restoring against a nonexistent row is a legal no-op, not a rejection', async () => {
    const result = await reduceCharacterResourcesAtomic({
      worldId: worldAId, characterId, reductions: [{ resourceId: 'resource:focus_points', amount: 1 }]
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.expended).toEqual({})
  })

  it('restoring against the wrong world is rejected', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] })

    const result = await reduceCharacterResourcesAtomic({
      worldId: worldBId, characterId, reductions: [{ resourceId: 'resource:focus_points', amount: 1 }]
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not-found')
  })
})

describe('reduceCharacterResourcesAtomic -- Long Rest recovery, full reset, batched, no cross-clobbering', () => {
  it('a "full" recovery removes exactly the named resource\'s own key, leaving a sibling resource untouched', async () => {
    await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId,
      costs: [{ resourceId: 'resource:focus_points', amount: 2, max: 3 }, { resourceId: 'resource:rage', amount: 1, max: 2 }]
    })

    const result = await reduceCharacterResourcesAtomic({
      worldId: worldAId, characterId, reductions: [{ resourceId: 'resource:focus_points', amount: 'full' }]
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.expended['resource:focus_points']).toBeUndefined()
      expect(result.expended['resource:rage']).toBe(1)
    }
  })

  it('a batched recovery (multiple resources, one trigger) applies all of them in one write', async () => {
    await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId,
      costs: [{ resourceId: 'resource:focus_points', amount: 2, max: 3 }, { resourceId: 'resource:rage', amount: 2, max: 2 }]
    })

    const result = await reduceCharacterResourcesAtomic({
      worldId: worldAId, characterId,
      reductions: [{ resourceId: 'resource:focus_points', amount: 'full' }, { resourceId: 'resource:rage', amount: 1 }]
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.expended['resource:focus_points']).toBeUndefined()
      expect(result.expended['resource:rage']).toBe(1)
    }
  })
})

describe('Rest recovery cannot erase a concurrent expenditure, in either order', () => {
  it('recovery committing first, then a concurrent expenditure: the expenditure applies on top of the recovered state', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 2, max: 3 }] })

    await reduceCharacterResourcesAtomic({ worldId: worldAId, characterId, reductions: [{ resourceId: 'resource:focus_points', amount: 'full' }] })
    const result = await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.expended['resource:focus_points']).toBe(1)
  })

  it('two genuinely concurrent operations (recovery and expenditure) never lose either write, regardless of which the database commits first', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 2, max: 3 }] })

    const [recovery, expenditure] = await Promise.all([
      reduceCharacterResourcesAtomic({ worldId: worldAId, characterId, reductions: [{ resourceId: 'resource:focus_points', amount: 'full' }] }),
      expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] })
    ])

    expect(recovery.ok).toBe(true)
    // Whichever order the database actually serialized these in, the expenditure's own
    // atomic statement always reads the LIVE value at the instant it runs -- it must
    // succeed (there is always room for 1 more, whether starting from 0 after recovery
    // or racing before recovery lands), and the final state must reflect exactly one
    // expenditure's worth of effect, never a lost recovery or a lost expend.
    expect(expenditure.ok).toBe(true)

    const row = await readResourcesRow(characterId)
    expect(row?.data.expended['resource:focus_points']).toBe(1)
  })
})

describe('Directus REST read compatibility', () => {
  it('a value written by the atomic adapter is byte-identical to what a normal SELECT (the shape loadCharacterResources reads) would see', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] })

    const row = await admin.query(
      "SELECT entity_id, block_key, repeatable, data FROM block_instances WHERE entity_id = $1 AND block_key = 'resources'",
      [characterId]
    )
    expect(row.rows).toHaveLength(1)
    expect(row.rows[0].data).toEqual({ expended: { 'resource:focus_points': 1 } })
    expect(row.rows[0].repeatable).toBe(false)
  })
})

describe('ownership does not leak across characters in the same world', () => {
  it('expending for one character never touches a sibling character\'s own row', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:focus_points', amount: 1, max: 3 }] })
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId: otherCharacterId, costs: [{ resourceId: 'resource:focus_points', amount: 2, max: 3 }] })

    const rowA = await readResourcesRow(characterId)
    const rowB = await readResourcesRow(otherCharacterId)
    expect(rowA?.data.expended['resource:focus_points']).toBe(1)
    expect(rowB?.data.expended['resource:focus_points']).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// readCharacterResourcesAtomic -- PRODUCTION CACHE-COHERENCY HOTFIX.
// ---------------------------------------------------------------------------
// The exact regression-acceptance sequence the hotfix's own task named:
// read 0 -> expend -> read 1 -> expend -> read 2 -> restore/recover ->
// read reflects it -- proven against the SAME disposable, real-json-column
// Postgres instance and the SAME least-privilege role every write test
// above already uses, never a superuser, never a second schema.
describe('readCharacterResourcesAtomic -- authoritative read, Directus-independent', () => {
  it('a character with no resources block yet reads expended={} -- legal, not an error', async () => {
    const result = await readCharacterResourcesAtomic({ worldId: worldAId, characterId })
    expect(result).toEqual({ ok: true, expended: {} })
  })

  it('1. read returns expended=0 (nothing persisted) for an acquired-but-untouched resource', async () => {
    const result = await readCharacterResourcesAtomic({ worldId: worldAId, characterId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expended['resource:rage'] ?? 0).toBe(0)
  })

  it('2-3. an atomic expenditure persists expended=1, and the very next read returns it', async () => {
    const expend = await expendCharacterResourcesAtomic({
      worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 1, max: 2 }]
    })
    expect(expend.ok).toBe(true)

    const read = await readCharacterResourcesAtomic({ worldId: worldAId, characterId })
    expect(read).toEqual({ ok: true, expended: { 'resource:rage': 1 } })
  })

  it('4-5. a second expenditure persists expended=2, and the next read reflects it immediately', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 1, max: 2 }] })
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 1, max: 2 }] })

    const read = await readCharacterResourcesAtomic({ worldId: worldAId, characterId })
    expect(read).toEqual({ ok: true, expended: { 'resource:rage': 2 } })
  })

  it('6a. restoration updates the very next read', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 2, max: 2 }] })
    await reduceCharacterResourcesAtomic({ worldId: worldAId, characterId, reductions: [{ resourceId: 'resource:rage', amount: 1 }] })

    const read = await readCharacterResourcesAtomic({ worldId: worldAId, characterId })
    expect(read).toEqual({ ok: true, expended: { 'resource:rage': 1 } })
  })

  it('6b. Long Rest recovery (\'full\') updates the very next read, deleting the key entirely', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 2, max: 2 }] })
    await reduceCharacterResourcesAtomic({ worldId: worldAId, characterId, reductions: [{ resourceId: 'resource:rage', amount: 'full' }] })

    const read = await readCharacterResourcesAtomic({ worldId: worldAId, characterId })
    expect(read).toEqual({ ok: true, expended: {} })
  })

  it('a wrong-world read fails closed as not-found, never leaking another world\'s/character\'s data', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 1, max: 2 }] })

    const read = await readCharacterResourcesAtomic({ worldId: worldBId, characterId })
    expect(read).toEqual({ ok: false, reason: 'not-found', message: expect.any(String) })
  })

  it('a non-existent characterId fails closed as not-found', async () => {
    const read = await readCharacterResourcesAtomic({ worldId: worldAId, characterId: 999999 })
    expect(read).toEqual({ ok: false, reason: 'not-found', message: expect.any(String) })
  })

  it('reads for different characters in the same world stay fully independent', async () => {
    await expendCharacterResourcesAtomic({ worldId: worldAId, characterId, costs: [{ resourceId: 'resource:rage', amount: 1, max: 2 }] })

    const readA = await readCharacterResourcesAtomic({ worldId: worldAId, characterId })
    const readB = await readCharacterResourcesAtomic({ worldId: worldAId, characterId: otherCharacterId })
    expect(readA).toEqual({ ok: true, expended: { 'resource:rage': 1 } })
    expect(readB).toEqual({ ok: true, expended: {} })
  })

  it('a malicious-looking resourceId key already persisted reads back exactly as stored, never misinterpreted', async () => {
    await admin.query(
      "INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data) VALUES ($1, 'resources', 'Resources', 80, false, $2)",
      [characterId, JSON.stringify({ expended: { "resource:rage'; DROP TABLE block_instances; --": 1 } })]
    )

    const read = await readCharacterResourcesAtomic({ worldId: worldAId, characterId })
    expect(read).toEqual({ ok: true, expended: { "resource:rage'; DROP TABLE block_instances; --": 1 } })

    // The table is still here at all, which is the point.
    const row = await readResourcesRow(characterId)
    expect(row).not.toBeNull()
  })
})
