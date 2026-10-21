// Real PostgreSQL integration test -- PRODUCTION CACHE-COHERENCY HOTFIX.
//
// Proves the actual character-assembly.ts boundary (not just the new SQL
// helper in isolation): the `resources` block is read through
// `readCharacterResourcesAtomic` (character-resource-atomic.ts), straight
// against Postgres, completely independent of Directus's own response
// cache. Every OTHER block still goes through Directus's REST API, mocked
// here exactly as tests/server/utils/character-assembly.test.ts's own unit
// suite already mocks it -- the one difference is that THIS mock is
// deliberately wired to return a STALE 'resources' row too, to prove
// assembleCharacter can no longer be fooled by one even if Directus's own
// cache (or a hand-rolled test double standing in for it) serves one.
//
// Requires ELDRA_RESOURCE_DB_URL (+ ELDRA_RESOURCE_TEST_ADMIN_DB_URL) --
// see character-resource-atomic.integration.test.ts's own header for the
// exact disposable-schema/role requirements this suite relies on
// identically. Never production, never the live dev Directus database.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'
import { __closePoolForTesting } from '../../server/utils/character-resource-atomic'

const DATABASE_URL = process.env.ELDRA_RESOURCE_DB_URL
const ADMIN_DATABASE_URL = process.env.ELDRA_RESOURCE_TEST_ADMIN_DB_URL ?? DATABASE_URL

if (!DATABASE_URL) {
  throw new Error(
    'ELDRA_RESOURCE_DB_URL is not set -- see character-resource-atomic.integration.test.ts\'s own header.'
  )
}

const { getWorldContentCatalogueMock, directusServiceRequestMock } = vi.hoisted(() => ({
  getWorldContentCatalogueMock: vi.fn(),
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))

vi.mock('../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

const { assembleCharacter } = await import('../../server/utils/character-assembly')

function catalogueEntry(overrides: Partial<{ packageId: string; slug: string; title: string }> = {}) {
  return {
    packageId: 'eldra.content.srd-5.1',
    packageVersion: '1.0.0',
    systemKey: 'dnd5e',
    title: 'Human',
    slug: 'human',
    externalId: 'Human__PHB',
    provider: '5etools-json',
    sourceBook: 'PHB',
    sourcePage: '31',
    ...overrides
  }
}

function fullCatalogue() {
  return {
    worldId: '1001',
    packs: [{ ok: true, packageId: 'eldra.content.srd-5.1', version: '1.0.0', title: 'SRD 5.1', entryCount: 3 }],
    species: [catalogueEntry({ title: 'Human', slug: 'human' })],
    classes: [catalogueEntry({ title: 'Fighter', slug: 'fighter' })],
    backgrounds: [catalogueEntry({ title: 'Acolyte', slug: 'acolyte' })],
    feats: [],
    items: [],
    spells: [],
    monsters: [],
    subclasses: []
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
    "INSERT INTO entities (world_id, title, slug, entity_type) VALUES ($1, 'Test Character', 'test-character', 'pc') RETURNING id",
    [worldId]
  )
  characterId = e.rows[0].id

  getWorldContentCatalogueMock.mockReset()
  directusServiceRequestMock.mockReset()
})

afterEach(async () => {
  await admin.query('TRUNCATE block_instances, entities RESTART IDENTITY')
})

// The Directus mock: entity lookup + the OTHER nine blocks, PLUS a
// deliberately STALE 'resources' row (simulating what Directus's own
// response cache could still be serving) -- the point of this test is
// that assembleCharacter must never even ask Directus for 'resources' at
// all, let alone use this value if it somehow arrived anyway.
function mockDirectus(catalogue: ReturnType<typeof fullCatalogue>, staleResourcesData: unknown) {
  directusServiceRequestMock.mockImplementation(async (path: string, options?: any) => {
    if (path === `/items/entities/${characterId}`) {
      return { data: { id: characterId, world_id: worldId, title: 'Test Character' } }
    }
    if (path === '/items/block_instances') {
      const requestedKeys: string[] = options?.query?.filter?._and?.[1]?.block_key?._in ?? []
      const rows: any[] = [
        {
          block_key: 'catalogue_selection',
          data: {
            species: { ...catalogue.species[0] },
            class: { ...catalogue.classes[0] },
            background: { ...catalogue.backgrounds[0] }
          }
        }
      ]
      // Only included if the (deliberately poisoned) test mock were ever
      // actually asked for it -- assembleCharacter's own `_in` list no
      // longer names 'resources', so this branch should never fire.
      if (requestedKeys.includes('resources')) {
        rows.push({ block_key: 'resources', data: staleResourcesData })
      }
      return { data: rows }
    }
    throw new Error(`Unexpected Directus path in test: ${path}`)
  })
}

describe('character-assembly.ts resources boundary -- real Postgres, stale-Directus-immune', () => {
  it('reads expended=0 from Postgres on first load, even though a poisoned Directus mock would answer differently if asked', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    mockDirectus(fullCatalogue(), { expended: { 'resource:rage': 99 } })

    const result = await assembleCharacter(String(worldId), String(characterId))
    if (!result.available) throw new Error('expected available: ' + JSON.stringify(result))

    expect(result.blueprint.resources).toEqual({ expended: {} })

    // Prove the mechanism, not just the outcome: Directus was never even
    // ASKED for 'resources'.
    const blockCall = directusServiceRequestMock.mock.calls.find(([path]) => path === '/items/block_instances')
    expect(blockCall?.[1].query.filter._and[1].block_key._in).not.toContain('resources')
  })

  it('reflects a real atomic expenditure IMMEDIATELY on the next assembly, with the poisoned Directus mock still wired to answer differently', async () => {
    // Seed the resources row directly, exactly as character-resource-
    // atomic.ts's own expend statement would leave it -- a real, durable
    // Postgres fact, deliberately NOT mirrored into the Directus mock
    // (simulating Directus's cache still holding the PRE-expenditure
    // response, i.e. the stale-cache production bug itself).
    await admin.query(
      "INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data) VALUES ($1, 'resources', 'Resources', 80, false, $2)",
      [characterId, JSON.stringify({ expended: { 'resource:rage': 1 } })]
    )

    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    // The Directus mock, if it were ever consulted for resources, would
    // WRONGLY say nothing has been spent -- exactly what a stale cached
    // response looks like.
    mockDirectus(fullCatalogue(), { expended: {} })

    const result = await assembleCharacter(String(worldId), String(characterId))
    if (!result.available) throw new Error('expected available: ' + JSON.stringify(result))

    expect(result.blueprint.resources).toEqual({ expended: { 'resource:rage': 1 } })
  })

  it('a second real expenditure is visible on the very next assembly too', async () => {
    await admin.query(
      "INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data) VALUES ($1, 'resources', 'Resources', 80, false, $2)",
      [characterId, JSON.stringify({ expended: { 'resource:rage': 1 } })]
    )

    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    mockDirectus(fullCatalogue(), { expended: {} })

    const first = await assembleCharacter(String(worldId), String(characterId))
    if (!first.available) throw new Error('expected available')
    expect(first.blueprint.resources).toEqual({ expended: { 'resource:rage': 1 } })

    // A second expenditure lands directly in Postgres (mirroring what the
    // atomic module's own UPDATE does), with no Directus write at all.
    await admin.query(
      "UPDATE block_instances SET data = $1 WHERE entity_id = $2 AND block_key = 'resources'",
      [JSON.stringify({ expended: { 'resource:rage': 2 } }), characterId]
    )

    const second = await assembleCharacter(String(worldId), String(characterId))
    if (!second.available) throw new Error('expected available')
    expect(second.blueprint.resources).toEqual({ expended: { 'resource:rage': 2 } })
  })

  it('restoration (key deleted at zero) is visible on the next assembly', async () => {
    await admin.query(
      "INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data) VALUES ($1, 'resources', 'Resources', 80, false, $2)",
      [characterId, JSON.stringify({ expended: { 'resource:rage': 1 } })]
    )
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    mockDirectus(fullCatalogue(), { expended: { 'resource:rage': 1 } })

    // Restoration to zero deletes the key entirely, matching
    // app/lib/characters/resources.ts's own restoreResource convention.
    await admin.query(
      "UPDATE block_instances SET data = $1 WHERE entity_id = $2 AND block_key = 'resources'",
      [JSON.stringify({ expended: {} }), characterId]
    )

    const result = await assembleCharacter(String(worldId), String(characterId))
    if (!result.available) throw new Error('expected available')
    expect(result.blueprint.resources).toEqual({ expended: {} })
  })

  it('a missing resources block (never expended) reads as expended={}, not an error, and does not fail assembly', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    mockDirectus(fullCatalogue(), { expended: { 'resource:rage': 1 } })

    const result = await assembleCharacter(String(worldId), String(characterId))
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.resources).toEqual({ expended: {} })
  })

  it('every OTHER block still reads through Directus, untouched by this hotfix', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    mockDirectus(fullCatalogue(), { expended: {} })

    const result = await assembleCharacter(String(worldId), String(characterId))
    if (!result.available) throw new Error('expected available')

    expect(result.blueprint.species).toEqual({ status: 'resolved', entry: fullCatalogue().species[0] })
    expect(result.blueprint.class).toEqual({ status: 'resolved', entry: fullCatalogue().classes[0] })
  })

  it('a wrong-world read fails closed as character-not-found, never leaking another world\'s resources', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === `/items/entities/${characterId}`) {
        // Directus (correctly) reports this entity belongs to world 1001.
        return { data: { id: characterId, world_id: worldId, title: 'Test Character' } }
      }
      throw new Error(`Unexpected Directus path in test: ${path}`)
    })

    // Assembly is asked for a DIFFERENT world than the one this character
    // actually belongs to.
    const result = await assembleCharacter('9999', String(characterId))
    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toBe('character-not-found')
  })
})
