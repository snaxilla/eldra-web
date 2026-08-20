// Unit tests for POST /api/content-packs/publish (the generic Content
// Source publish route -- Step 5 of
// .github/docs/architecture/content-source-architecture.md's Implementation
// Sequence). Everything except the two I/O boundaries is exercised for
// REAL: the real srd51Provider (and through it, the real preview5eTools*
// parsers and the real content-pack-5etools-adapter), the real registry
// (app/lib/content-sources/registry.ts), and the real publishing pipeline
// (content-pack-publishing.ts / content-packs.ts), including real
// validation and real integrity hashing. Only `node:fs/promises` (standing
// in for the on-disk 5etools dataset) and `directusServiceRequest` (the
// Directus HTTP boundary) are mocked -- mirrors
// srd-5-1-curated.post.test.ts's own fixture/mocking style exactly, since
// both routes now share the same underlying publishContentSourceSelection.

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

// Same fixture shape as srd-5-1-curated.post.test.ts: spells carries TWO
// srd:true entries so curation-still-works is provable independent of the
// SRD filter itself.
const FIXTURE_FILES: Record<string, string> = {
  [`${DATA_ROOT}/spells/spells-phb.json`]: JSON.stringify({
    spell: [
      { name: 'Fire Bolt', source: 'PHB', srd: true, level: 0, entries: ['A mote of fire.'] },
      { name: 'Mage Hand', source: 'PHB', srd: true, level: 0, entries: ['A spectral hand.'] },
      { name: 'Homebrew Zap', source: 'PHB', level: 0, entries: ['Not SRD.'] }
    ]
  }),
  [`${DATA_ROOT}/feats.json`]: JSON.stringify({
    feat: [{ name: 'Grappler', source: 'PHB', srd: true, entries: ['You have advantage on grapple checks.'] }]
  }),
  [`${DATA_ROOT}/backgrounds.json`]: JSON.stringify({
    background: [{ name: 'Acolyte', source: 'PHB', srd: true, entries: ['You served in a temple.'] }]
  }),
  // races.json / items.json / class-*.json realistically hold BOTH the 2014
  // and 2024 books' entries in one array -- so these fixtures carry an XPHB
  // sibling alongside each PHB entry. They are invisible to SRD 5.1 (no
  // `srd` flag) and prove the generic route publishes a second collection
  // from the same files without any route or publisher change.
  [`${DATA_ROOT}/races.json`]: JSON.stringify({
    race: [
      { name: 'Human', source: 'PHB', srd: true, entries: ['Versatile.'] },
      { name: 'Human', source: 'XPHB', edition: 'one', entries: ['Versatile (2024).'] }
    ]
  }),
  [`${DATA_ROOT}/items.json`]: JSON.stringify({
    item: [
      { name: 'Potion of Healing', source: 'PHB', srd: true, entries: ['Restores hit points.'] },
      { name: 'Potion of Healing', source: 'XPHB', entries: ['Restores hit points (2024).'] }
    ]
  }),
  [`${DATA_ROOT}/class/class-fighter.json`]: JSON.stringify({
    class: [
      { name: 'Fighter', source: 'PHB', srd: true, hd: { faces: 10 } },
      { name: 'Fighter', source: 'XPHB', edition: 'one', hd: { faces: 10 }, primaryAbility: [{ str: true }] }
    ]
  }),
  [`${DATA_ROOT}/spells/spells-xphb.json`]: JSON.stringify({
    spell: [{ name: 'Fire Bolt', source: 'XPHB', level: 0, entries: ['A mote of fire (2024).'] }]
  })
}

const FIXTURE_DIRS: Record<string, string[]> = {
  [DATA_ROOT]: ['spells', 'feats.json', 'backgrounds.json', 'races.json', 'items.json', 'class'],
  [`${DATA_ROOT}/spells`]: ['spells-phb.json', 'spells-xphb.json'],
  [`${DATA_ROOT}/class`]: ['class-fighter.json']
}

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(async (dirPath: string) => {
    const names = FIXTURE_DIRS[dirPath] ?? []
    return names.map((name) => {
      const full = `${dirPath}/${name}`
      const isDir = Object.prototype.hasOwnProperty.call(FIXTURE_DIRS, full)
      return {
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir
      }
    })
  }),
  readFile: vi.fn(async (filePath: string) => {
    const content = FIXTURE_FILES[filePath]
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' })
    }
    return content
  })
}))

import handler from '../../../../server/api/content-packs/publish.post'
import { bindContentPackToWorld } from '../../../../server/utils/world-content-pack-binding'
import { clearContentPackCache, loadPublishedContentPack, computeContentIntegrityHash } from '../../../../server/utils/content-packs'
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

type BindingRow = {
  id: string
  world_id: number
  package_id: string
  package_version: string
  package_integrity: string | null
  created_at: string
  updated_at: string
}

let packStore: PackRow[]
let bindingStore: BindingRow[]

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

const FULL_SELECTION_MINUS_MAGE_HAND = {
  species: ['Human__PHB'],
  classes: ['Fighter__PHB'],
  backgrounds: ['Acolyte__PHB'],
  feats: ['Grappler__PHB'],
  items: ['item__Potion of Healing__PHB'],
  spells: ['Fire Bolt__PHB']
}

beforeEach(() => {
  packStore = []
  bindingStore = []
  clearContentPackCache()

  directusServiceRequestMock.mockReset()
  directusServiceRequestMock.mockImplementation(async (path: string, options: any = {}) => {
    const method = options.method || 'GET'

    if (path === '/items/content_packs') {
      if (method === 'GET') {
        const clauses: any[] = options.query?.filter?._and ?? []
        const packageId = clauses.find((c) => c.package_id)?.package_id?._eq
        const version = clauses.find((c) => c.version)?.version?._eq
        const matches = packStore.filter((row) => row.package_id === packageId && row.version === version)
        return { data: matches }
      }
      if (method === 'POST') {
        const row: PackRow = { ...options.body }
        packStore.push(row)
        return { data: row }
      }
      throw new Error(`Unexpected content_packs method in test: ${method}`)
    }

    if (path === '/items/world_content_pack_bindings') {
      if (method === 'GET') {
        const filter = options.query?.filter ?? {}
        const clauses: any[] = filter._and ?? [filter]
        const worldId = clauses.find((c) => c.world_id)?.world_id?._eq
        const packageId = clauses.find((c) => c.package_id)?.package_id?._eq
        const matches = bindingStore.filter(
          (row) => (worldId === undefined || row.world_id === worldId) && (packageId === undefined || row.package_id === packageId)
        )
        return { data: matches }
      }
      if (method === 'POST') {
        const row: BindingRow = { id: String(bindingStore.length + 1), ...options.body }
        bindingStore.push(row)
        return { data: row }
      }
      throw new Error(`Unexpected world_content_pack_bindings method in test: ${method}`)
    }

    throw new Error(`Unexpected Directus path in test: ${path}`)
  })
})

async function callHandler(body: any, principal: Principal | null = publisherPrincipal()) {
  return handler(fakeEvent(body, principal))
}

function baseBody(overrides: Record<string, any> = {}) {
  return {
    gameSystemKey: 'dnd5e',
    collectionKey: 'srd-5.1',
    packageId: 'eldra.content.srd-5.1-generic-test',
    version: '1.0.0',
    selection: FULL_SELECTION_MINUS_MAGE_HAND,
    ...overrides
  }
}

describe('POST /api/content-packs/publish', () => {
  it('fails with 401 when no principal is present, and touches neither the dataset nor Directus', async () => {
    await expect(callHandler(baseBody(), null)).rejects.toMatchObject({ statusCode: 401 })
    expect(packStore).toHaveLength(0)
  })

  it('fails with 403 for a principal lacking platform.contentpack.publish', async () => {
    const underprivileged: Principal = {
      accountId: 'someone-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: false
    }

    await expect(callHandler(baseBody(), underprivileged)).rejects.toMatchObject({ statusCode: 403 })
    expect(packStore).toHaveLength(0)
  })

  it('fails with 404 for an unknown gameSystemKey, before touching the dataset or Directus', async () => {
    await expect(callHandler(baseBody({ gameSystemKey: 'pathfinder' }))).rejects.toMatchObject({ statusCode: 404 })
    expect(packStore).toHaveLength(0)
  })

  it('fails with 404 for a known game system but an unknown/unprovidered collectionKey', async () => {
    // phb-2014 is a real registry entry (app/lib/content-sources/registry.ts)
    // but has no registered provider yet.
    await expect(callHandler(baseBody({ collectionKey: 'phb-2014' }))).rejects.toMatchObject({ statusCode: 404 })
    expect(packStore).toHaveLength(0)
  })

  it('publishes only the selected entries -- Mage Hand (srd but unchecked) is excluded, Fire Bolt (srd and checked) is included', async () => {
    const result = await callHandler(baseBody())

    expect(result.published).toBe(true)
    expect(result.counts).toEqual({
      species: 1,
      classes: 1,
      backgrounds: 1,
      feats: 1,
      items: 1,
      spells: 1
    })

    expect(packStore).toHaveLength(1)
    const row = packStore[0]
    expect(row.content).toHaveLength(6)

    const titles = row.content.map((entry: any) => entry.title).sort()
    expect(titles).toEqual(['Acolyte', 'Fighter', 'Fire Bolt', 'Grappler', 'Human', 'Potion of Healing'])
    expect(titles).not.toContain('Mage Hand')
  })

  it('sources title/description/license from the registry, not hardcoded literals', async () => {
    await callHandler(baseBody())

    const row = packStore[0]
    expect(row.title).toBe('SRD 5.1')
    expect(row.license_id).toBe('OGL-1.0a')
    expect(row.manifest).toMatchObject({
      title: 'SRD 5.1',
      description: 'Core Dungeons & Dragons 5th Edition rules content released by Wizards of the Coast under the System Reference Document 5.1.',
      license: { id: 'OGL-1.0a' },
      origin: { kind: 'translated', adapterId: '5etools-json', sourceId: 'srd-5.1' }
    })
  })

  it('defaults packageId to the registry\'s suggestedPackageId when omitted or blank', async () => {
    const result = await callHandler(baseBody({ packageId: '' }))

    expect(result.published).toBe(true)
    expect(result.packageId).toBe('eldra.content.srd-5.1')
    expect(packStore[0].package_id).toBe('eldra.content.srd-5.1')
  })

  it('uses an explicitly submitted packageId over the suggested default', async () => {
    const result = await callHandler(baseBody({ packageId: 'eldra.content.my-custom-srd' }))

    expect(result.published).toBe(true)
    expect(result.packageId).toBe('eldra.content.my-custom-srd')
  })

  // ---------------------------------------------------------------------
  // The architecture's acceptance test (content-source-architecture.md §12
  // Step 8): publishing a SECOND collection through this same route, with
  // no change to the route, the publisher, or the Builder.
  // ---------------------------------------------------------------------

  it('publishes a different collection (XPHB) through the identical route, with that collection\'s own registry metadata', async () => {
    const result = await callHandler({
      gameSystemKey: 'dnd5e',
      collectionKey: 'xphb',
      packageId: 'eldra.content.xphb-test',
      version: '1.0.0',
      selection: {
        species: ['Human__XPHB'],
        classes: ['Fighter__XPHB'],
        items: ['item__Potion of Healing__XPHB'],
        spells: ['Fire Bolt__XPHB']
      }
    })

    expect(result.published).toBe(true)
    expect(result.counts).toMatchObject({ species: 1, classes: 1, items: 1, spells: 1, backgrounds: 0, feats: 0 })

    const row = packStore[0]
    // Metadata comes from the XPHB registry entry, not SRD's and not a
    // hardcoded literal -- the whole point of Step 5's registry integration.
    expect(row.title).toBe("Player's Handbook (2024)")
    expect(row.license_id).toBe('proprietary')
    expect(row.manifest).toMatchObject({
      title: "Player's Handbook (2024)",
      license: { id: 'proprietary' },
      origin: { kind: 'translated', adapterId: '5etools-json', sourceId: 'xphb' }
    })

    // Every published entry is genuinely XPHB -- no PHB sibling leaked in
    // from the files the two books share.
    expect(row.content.map((c: any) => c.sourceBook)).toEqual(['Human__XPHB', 'Fighter__XPHB', 'item__Potion of Healing__XPHB', 'Fire Bolt__XPHB'].map(() => 'XPHB'))
  })

  it('SRD 5.1 and XPHB produce distinct identities, so both can be published and coexist', async () => {
    await callHandler(baseBody({ packageId: 'eldra.content.srd-both', version: '1.0.0' }))
    await callHandler({
      gameSystemKey: 'dnd5e',
      collectionKey: 'xphb',
      packageId: 'eldra.content.xphb-both',
      version: '1.0.0',
      selection: { classes: ['Fighter__XPHB'] }
    })

    expect(packStore).toHaveLength(2)
    const srdFighter = packStore[0].content.find((c: any) => c.title === 'Fighter')
    const xphbFighter = packStore[1].content.find((c: any) => c.title === 'Fighter')

    expect(srdFighter.title).toBe(xphbFighter.title)
    expect(srdFighter.slug).not.toBe(xphbFighter.slug)
    expect(srdFighter.externalId).not.toBe(xphbFighter.externalId)
  })

  it('computes real integrity over exactly the published (curated) content', async () => {
    await callHandler(baseBody())

    const row = packStore[0]
    const recomputed = computeContentIntegrityHash(row.content)
    expect(row.integrity_hash).toBe(recomputed)

    const loaded = await loadPublishedContentPack('eldra.content.srd-5.1-generic-test', '1.0.0')
    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.package.content).toHaveLength(6)
    }
  })

  it('rejects a duplicate publish of the same (packageId, version) rather than overwriting', async () => {
    await callHandler(baseBody())
    expect(packStore).toHaveLength(1)

    await expect(callHandler(baseBody())).rejects.toMatchObject({ statusCode: 409 })

    expect(packStore).toHaveLength(1)
  })

  it('rejects publishing when no entries are selected (empty-content, via the existing validator)', async () => {
    await expect(
      callHandler(baseBody({ selection: { species: [], classes: [], backgrounds: [], feats: [], items: [], spells: [] } }))
    ).rejects.toMatchObject({ statusCode: 422 })

    expect(packStore).toHaveLength(0)
  })

  it('rejects publishing when the version is empty (invalid-version, via the existing validator)', async () => {
    await expect(callHandler(baseBody({ version: '' }))).rejects.toMatchObject({ statusCode: 422 })
    expect(packStore).toHaveLength(0)
  })

  it('binding still works after a generic publish -- the resulting pack can be bound to a World via the existing, unchanged binding pipeline', async () => {
    const published = await callHandler(baseBody())
    expect(published.published).toBe(true)

    const bound = await bindContentPackToWorld('4', 'eldra.content.srd-5.1-generic-test', '1.0.0')
    expect(bound.bound).toBe(true)
    if (bound.bound) {
      expect(bound.binding.packageId).toBe('eldra.content.srd-5.1-generic-test')
      expect(bound.binding.packageVersion).toBe('1.0.0')
    }
    expect(bindingStore).toHaveLength(1)
  })
})
