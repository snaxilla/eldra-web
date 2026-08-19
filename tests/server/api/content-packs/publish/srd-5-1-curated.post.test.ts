// Unit tests for POST /api/content-packs/publish/srd-5-1-curated
// (server/api/content-packs/publish/srd-5-1-curated.post.ts) -- Curated
// Content Pack Publishing: publishing exactly the GM's selection from the
// Preview UI, through the SAME real publishing pipeline
// publish/srd-5-1.post.ts's own tests already exercise (real importers,
// real adapter, real validation/integrity via content-pack-publishing.ts /
// content-packs.ts). Only `node:fs/promises` (the on-disk 5etools dataset)
// and `directusServiceRequest` (the Directus HTTP boundary, covering both
// content_packs and world_content_pack_bindings -- the binding test below
// needs both) are mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

// The handler reads its body via h3's readBody(event) -- stub it to read a
// `__body` property this test file attaches to its fake event, exactly the
// same shape readBody would extract from a real request.
vi.mock('h3', async () => {
  const actual = await vi.importActual<any>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event.__body)
  }
})

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

// Spells carries TWO srd:true entries (Fire Bolt, Mage Hand) so tests can
// prove per-entry curation actually excludes an unselected entry that
// would otherwise have passed the SRD filter -- distinct from the SRD
// filter itself (already covered by preview/publish's own tests).
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

import handler from '../../../../../server/api/content-packs/publish/srd-5-1-curated.post'
import { bindContentPackToWorld } from '../../../../../server/utils/world-content-pack-binding'
import { clearContentPackCache, loadPublishedContentPack, computeContentIntegrityHash } from '../../../../../server/utils/content-packs'
import type { Principal } from '../../../../../server/utils/authorization'

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

// Full selection: every srd-flagged fixture entry EXCEPT Mage Hand.
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

describe('POST /api/content-packs/publish/srd-5-1-curated', () => {
  it('fails with 401 when no principal is present, and touches neither the dataset nor Directus', async () => {
    await expect(callHandler({ packageId: 'eldra.content.srd-5.1-curated', version: '1.0.0', selection: FULL_SELECTION_MINUS_MAGE_HAND }, null)).rejects.toMatchObject({ statusCode: 401 })
    expect(packStore).toHaveLength(0)
  })

  it('fails with 403 for a principal lacking platform.contentpack.publish', async () => {
    const underprivileged: Principal = {
      accountId: 'someone-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: false
    }

    await expect(
      callHandler({ packageId: 'eldra.content.srd-5.1-curated', version: '1.0.0', selection: FULL_SELECTION_MINUS_MAGE_HAND }, underprivileged)
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(packStore).toHaveLength(0)
  })

  it('publishes only the selected entries -- Mage Hand (srd but unchecked) is excluded, Fire Bolt (srd and checked) is included', async () => {
    const result = await callHandler({
      packageId: 'eldra.content.srd-5.1-curated',
      version: '1.0.0',
      selection: FULL_SELECTION_MINUS_MAGE_HAND
    })

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

  it('computes real integrity over exactly the published (curated) content', async () => {
    await callHandler({
      packageId: 'eldra.content.srd-5.1-curated',
      version: '1.0.0',
      selection: FULL_SELECTION_MINUS_MAGE_HAND
    })

    const row = packStore[0]
    const recomputed = computeContentIntegrityHash(row.content)
    expect(row.integrity_hash).toBe(recomputed)

    const loaded = await loadPublishedContentPack('eldra.content.srd-5.1-curated', '1.0.0')
    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.package.content).toHaveLength(6)
    }
  })

  it('rejects a duplicate publish of the same (packageId, version) rather than overwriting', async () => {
    await callHandler({ packageId: 'eldra.content.srd-5.1-curated', version: '1.0.0', selection: FULL_SELECTION_MINUS_MAGE_HAND })
    expect(packStore).toHaveLength(1)

    await expect(
      callHandler({ packageId: 'eldra.content.srd-5.1-curated', version: '1.0.0', selection: FULL_SELECTION_MINUS_MAGE_HAND })
    ).rejects.toMatchObject({ statusCode: 409 })

    expect(packStore).toHaveLength(1)
  })

  it('rejects publishing when no entries are selected (empty-content, via the existing validator)', async () => {
    await expect(
      callHandler({
        packageId: 'eldra.content.srd-5.1-curated',
        version: '1.0.0',
        selection: { species: [], classes: [], backgrounds: [], feats: [], items: [], spells: [] }
      })
    ).rejects.toMatchObject({ statusCode: 422 })

    expect(packStore).toHaveLength(0)
  })

  it('rejects publishing when the package name is empty (invalid-package-id, via the existing validator)', async () => {
    await expect(
      callHandler({ packageId: '', version: '1.0.0', selection: FULL_SELECTION_MINUS_MAGE_HAND })
    ).rejects.toMatchObject({ statusCode: 422 })

    expect(packStore).toHaveLength(0)
  })

  it('rejects publishing when the version is empty (invalid-version, via the existing validator)', async () => {
    await expect(
      callHandler({ packageId: 'eldra.content.srd-5.1-curated', version: '', selection: FULL_SELECTION_MINUS_MAGE_HAND })
    ).rejects.toMatchObject({ statusCode: 422 })

    expect(packStore).toHaveLength(0)
  })

  it('binding still works after a curated publish -- the resulting pack can be bound to a World via the existing, unchanged binding pipeline', async () => {
    const published = await callHandler({
      packageId: 'eldra.content.srd-5.1-curated',
      version: '1.0.0',
      selection: FULL_SELECTION_MINUS_MAGE_HAND
    })
    expect(published.published).toBe(true)

    const bound = await bindContentPackToWorld('4', 'eldra.content.srd-5.1-curated', '1.0.0')
    expect(bound.bound).toBe(true)
    if (bound.bound) {
      expect(bound.binding.packageId).toBe('eldra.content.srd-5.1-curated')
      expect(bound.binding.packageVersion).toBe('1.0.0')
    }
    expect(bindingStore).toHaveLength(1)
  })
})
