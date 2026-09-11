// Unit tests for POST /api/content-packs/refresh (Developer Workflow:
// Refresh Content Package). Mirrors publish.post.test.ts's own fixture and
// mocking style exactly -- the real srd51Provider, the real registry, the
// real publishing pipeline, real validation, real integrity hashing. Only
// `node:fs/promises` (the on-disk 5etools dataset) and
// `directusServiceRequest` (the Directus HTTP boundary) are mocked.
//
// This suite exercises server/utils/content-sources/refresh.ts through the
// route, exactly as publish.post.test.ts exercises publish.ts through its
// own route -- refresh.ts has no dedicated unit test of its own because
// nothing in it is reachable except through this orchestration.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<any>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event.__body)
  }
})

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

// Mutable per-test so a refresh can prove it re-derives from CURRENT
// source/importer output rather than copying the previously published
// candidate objects verbatim -- see the "re-derives fresh content" test.
let fixtureFiles: Record<string, string>

function resetFixtures() {
  fixtureFiles = {
    [`${DATA_ROOT}/spells/spells-phb.json`]: JSON.stringify({
      spell: [
        { name: 'Fire Bolt', source: 'PHB', srd: true, level: 0, entries: ['A mote of fire.'] },
        { name: 'Mage Hand', source: 'PHB', srd: true, level: 0, entries: ['A spectral hand.'] }
      ]
    }),
    [`${DATA_ROOT}/feats.json`]: JSON.stringify({
      feat: [{ name: 'Grappler', source: 'PHB', srd: true, entries: ['You have advantage on grapple checks.'] }]
    }),
    [`${DATA_ROOT}/backgrounds.json`]: JSON.stringify({
      background: [{ name: 'Acolyte', source: 'PHB', srd: true, entries: ['You served in a temple.'] }]
    }),
    [`${DATA_ROOT}/races.json`]: JSON.stringify({
      race: [{ name: 'Human', source: 'PHB', srd: true, entries: ['Versatile.'] }]
    }),
    [`${DATA_ROOT}/items.json`]: JSON.stringify({
      item: [{ name: 'Potion of Healing', source: 'PHB', srd: true, entries: ['Restores hit points.'] }]
    }),
    [`${DATA_ROOT}/class/class-fighter.json`]: JSON.stringify({
      class: [{ name: 'Fighter', source: 'PHB', srd: true, hd: { faces: 10 } }]
    })
  }
}

const FIXTURE_DIRS: Record<string, string[]> = {
  [DATA_ROOT]: ['spells', 'feats.json', 'backgrounds.json', 'races.json', 'items.json', 'class'],
  [`${DATA_ROOT}/spells`]: ['spells-phb.json'],
  [`${DATA_ROOT}/class`]: ['class-fighter.json']
}

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(async (dirPath: string) => {
    const names = FIXTURE_DIRS[dirPath] ?? []
    return names.map((name) => {
      const full = `${dirPath}/${name}`
      const isDir = Object.prototype.hasOwnProperty.call(FIXTURE_DIRS, full)
      return { name, isDirectory: () => isDir, isFile: () => !isDir }
    })
  }),
  readFile: vi.fn(async (filePath: string) => {
    const content = fixtureFiles[filePath]
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' })
    }
    return content
  })
}))

import publishHandler from '../../../../server/api/content-packs/publish.post'
import refreshHandler from '../../../../server/api/content-packs/refresh.post'
import { clearContentPackCache } from '../../../../server/utils/content-packs'
import type { Principal } from '../../../../server/utils/authorization'

type PackRow = {
  package_id: string
  version: string
  status: string
  content_schema_version: number
  title: string
  integrity_hash: string
  license_id: string | null
  created_at: string
  manifest: any
  content: any[]
}

let packStore: PackRow[]

function publisherPrincipal(): Principal {
  return {
    accountId: 'admin-1',
    platformCapabilities: new Set(['platform.contentpack.publish']),
    worldCapabilities: new Map(),
    temporarySingleUserMode: false
  }
}

function fakeEvent(body: any, principal: Principal | null = publisherPrincipal()) {
  return { context: { principal }, __body: body } as any
}

beforeEach(() => {
  resetFixtures()
  packStore = []
  clearContentPackCache()

  directusServiceRequestMock.mockReset()
  directusServiceRequestMock.mockImplementation(async (path: string, options: any = {}) => {
    const method = options.method || 'GET'

    if (path === '/items/content_packs') {
      if (method === 'GET') {
        const filter = options.query?.filter ?? {}
        // listPublishedContentPacks: { status: { _eq: 'published' } }
        // loadPublishedContentPack: { _and: [{ package_id }, { version }] }
        const clauses: any[] = filter._and ?? [filter]
        const packageId = clauses.find((c) => c.package_id)?.package_id?._eq
        const version = clauses.find((c) => c.version)?.version?._eq
        const status = filter.status?._eq

        const matches = packStore.filter(
          (row) =>
            (packageId === undefined || row.package_id === packageId) &&
            (version === undefined || row.version === version) &&
            (status === undefined || row.status === status)
        )
        return { data: matches }
      }
      if (method === 'POST') {
        const row: PackRow = { ...options.body }
        packStore.push(row)
        return { data: row }
      }
      throw new Error(`Unexpected content_packs method in test: ${method}`)
    }

    throw new Error(`Unexpected Directus path in test: ${path}`)
  })
})

async function callPublish(body: any, principal: Principal | null = publisherPrincipal()) {
  return publishHandler(fakeEvent(body, principal))
}

async function callRefresh(body: any, principal: Principal | null = publisherPrincipal()) {
  return refreshHandler(fakeEvent(body, principal))
}

const INITIAL_SELECTION = {
  species: ['Human__PHB'],
  classes: ['Fighter__PHB'],
  backgrounds: ['Acolyte__PHB'],
  feats: ['Grappler__PHB'],
  items: ['item__Potion of Healing__PHB'],
  spells: ['Fire Bolt__PHB']
  // Mage Hand deliberately excluded -- proves refresh respects the
  // ORIGINAL curation rather than "select everything currently offered".
}

async function publishInitialVersion(overrides: Record<string, any> = {}) {
  return callPublish({
    gameSystemKey: 'dnd5e',
    collectionKey: 'srd-5.1',
    packageId: 'eldra.content.srd-5.1-refresh-test',
    version: '1.0.0',
    selection: INITIAL_SELECTION,
    ...overrides
  })
}

describe('POST /api/content-packs/refresh', () => {
  it('fails with 401 when no principal is present, and touches neither the dataset nor Directus', async () => {
    await publishInitialVersion()
    const before = packStore.length

    await expect(
      callRefresh({ gameSystemKey: 'dnd5e', collectionKey: 'srd-5.1', packageId: 'eldra.content.srd-5.1-refresh-test' }, null)
    ).rejects.toMatchObject({ statusCode: 401 })

    expect(packStore).toHaveLength(before)
  })

  it('fails with 403 for a principal lacking platform.contentpack.publish', async () => {
    await publishInitialVersion()
    const before = packStore.length

    const underprivileged: Principal = {
      accountId: 'someone-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: false
    }

    await expect(
      callRefresh(
        { gameSystemKey: 'dnd5e', collectionKey: 'srd-5.1', packageId: 'eldra.content.srd-5.1-refresh-test' },
        underprivileged
      )
    ).rejects.toMatchObject({ statusCode: 403 })

    expect(packStore).toHaveLength(before)
  })

  it('fails with 404 for an unknown gameSystemKey, before touching the dataset or Directus', async () => {
    await expect(
      callRefresh({ gameSystemKey: 'pathfinder', collectionKey: 'srd-5.1', packageId: 'eldra.content.srd-5.1-refresh-test' })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('fails with 404 when no published version of this packageId exists yet -- refresh is not a way to publish for the first time', async () => {
    await expect(
      callRefresh({ gameSystemKey: 'dnd5e', collectionKey: 'srd-5.1', packageId: 'eldra.content.never-published' })
    ).rejects.toMatchObject({ statusCode: 404 })

    expect(packStore).toHaveLength(0)
  })

  it('produces a NEW immutable version (patch bump) rather than overwriting the one it refreshed', async () => {
    await publishInitialVersion()
    expect(packStore).toHaveLength(1)
    expect(packStore[0].version).toBe('1.0.0')

    const result = await callRefresh({
      gameSystemKey: 'dnd5e',
      collectionKey: 'srd-5.1',
      packageId: 'eldra.content.srd-5.1-refresh-test'
    })

    expect(result.refreshed).toBe(true)
    expect(result.previousVersion).toBe('1.0.0')
    expect(result.version).toBe('1.0.1')

    // The original v1.0.0 row is untouched -- refresh inserted a sibling,
    // never patched/overwrote the existing row.
    expect(packStore).toHaveLength(2)
    expect(packStore.find((row) => row.version === '1.0.0')).toBeTruthy()
    expect(packStore.find((row) => row.version === '1.0.1')).toBeTruthy()
  })

  it('refreshing twice bumps the patch version again from the latest published version, not the original', async () => {
    await publishInitialVersion()
    await callRefresh({ gameSystemKey: 'dnd5e', collectionKey: 'srd-5.1', packageId: 'eldra.content.srd-5.1-refresh-test' })
    const second = await callRefresh({
      gameSystemKey: 'dnd5e',
      collectionKey: 'srd-5.1',
      packageId: 'eldra.content.srd-5.1-refresh-test'
    })

    expect(second.refreshed).toBe(true)
    expect(second.previousVersion).toBe('1.0.1')
    expect(second.version).toBe('1.0.2')
    expect(packStore).toHaveLength(3)
  })

  it('produces identical content when nothing in the source/importer changed -- same entries, same selection', async () => {
    await publishInitialVersion()
    const result = await callRefresh({
      gameSystemKey: 'dnd5e',
      collectionKey: 'srd-5.1',
      packageId: 'eldra.content.srd-5.1-refresh-test'
    })

    expect(result.refreshed).toBe(true)
    expect(result.counts).toEqual({ species: 1, classes: 1, backgrounds: 1, feats: 1, items: 1, spells: 1 })

    const before = packStore[0].content.map((entry: any) => entry.title).sort()
    const after = packStore[1].content.map((entry: any) => entry.title).sort()
    expect(after).toEqual(before)
    // Mage Hand was excluded from the original selection and stays excluded
    // -- refresh never expands the selection to "everything available now".
    expect(after).not.toContain('Mage Hand')
  })

  it('re-derives content from the CURRENT source rather than copying the previous version verbatim', async () => {
    await publishInitialVersion()

    // Change the underlying 5etools source between publish and refresh --
    // simulates an importer/source change with the entry itself unedited by
    // any human curation step.
    fixtureFiles[`${DATA_ROOT}/class/class-fighter.json`] = JSON.stringify({
      class: [{ name: 'Fighter', source: 'PHB', srd: true, hd: { faces: 12 } }]
    })

    const result = await callRefresh({
      gameSystemKey: 'dnd5e',
      collectionKey: 'srd-5.1',
      packageId: 'eldra.content.srd-5.1-refresh-test'
    })

    expect(result.refreshed).toBe(true)
    const refreshedFighter = packStore[1].content.find((entry: any) => entry.title === 'Fighter')
    expect(refreshedFighter.data.hd.faces).toBe(12)

    // The original v1.0.0 row is provably untouched by the source change.
    const originalFighter = packStore[0].content.find((entry: any) => entry.title === 'Fighter')
    expect(originalFighter.data.hd.faces).toBe(10)
  })

  it('defaults packageId to the registry\'s suggestedPackageId when omitted', async () => {
    await callPublish({
      gameSystemKey: 'dnd5e',
      collectionKey: 'srd-5.1',
      version: '1.0.0',
      selection: INITIAL_SELECTION
      // packageId omitted -- publish.post.ts defaults to eldra.content.srd-5.1
    })
    expect(packStore[0].package_id).toBe('eldra.content.srd-5.1')

    const result = await callRefresh({ gameSystemKey: 'dnd5e', collectionKey: 'srd-5.1' })
    expect(result.refreshed).toBe(true)
    expect(result.packageId).toBe('eldra.content.srd-5.1')
    expect(result.version).toBe('1.0.1')
  })
})
