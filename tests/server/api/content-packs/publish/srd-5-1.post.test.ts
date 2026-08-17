// Unit tests for POST /api/content-packs/publish/srd-5-1
// (server/api/content-packs/publish/srd-5-1.post.ts) -- the first real
// Content Pack publication workflow.
//
// Everything except the two I/O boundaries is exercised for REAL: the real
// preview5eTools* parsers (app/lib/importers), the real adapter
// (content-pack-5etools-adapter.ts), and the real publishing pipeline
// (content-pack-publishing.ts / content-packs.ts), including real
// validation and real integrity hashing. Only `node:fs/promises` (standing
// in for the on-disk 5etools dataset, which lives outside this repo at
// /opt/eldra/datasets and must not be a test dependency) and
// `directusServiceRequest` (the Directus HTTP boundary) are mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

// A small fake 5etools dataset tree, on disk only inside this test's mocked
// fs. Each category carries one SRD 5.1 (`srd: true`) entry and one
// non-SRD entry, so the tests can prove the srd-only filter actually
// excludes the latter -- and one category (spells) also carries an
// srd52-only (2024 revision) entry, proving that field is never mistaken
// for `srd`.
const FIXTURE_FILES: Record<string, string> = {
  [`${DATA_ROOT}/spells/spells-phb.json`]: JSON.stringify({
    spell: [
      { name: 'Fire Bolt', source: 'PHB', srd: true, level: 0, entries: ['A mote of fire.'] },
      { name: 'Homebrew Zap', source: 'PHB', level: 0, entries: ['Not SRD.'] }
    ]
  }),
  [`${DATA_ROOT}/spells/spells-xphb.json`]: JSON.stringify({
    spell: [
      { name: 'Fire Bolt', source: 'XPHB', srd52: true, level: 0, entries: ['2024 revision -- srd52 only.'] }
    ]
  }),
  [`${DATA_ROOT}/feats.json`]: JSON.stringify({
    feat: [
      { name: 'Grappler', source: 'PHB', srd: true, entries: ['You have advantage on grapple checks.'] },
      { name: 'Homebrew Feat', source: 'PHB', entries: ['Not SRD.'] }
    ]
  }),
  [`${DATA_ROOT}/backgrounds.json`]: JSON.stringify({
    background: [
      { name: 'Acolyte', source: 'PHB', srd: true, entries: ['You served in a temple.'] },
      { name: 'Homebrew Background', source: 'PHB', entries: ['Not SRD.'] }
    ]
  }),
  [`${DATA_ROOT}/races.json`]: JSON.stringify({
    race: [
      { name: 'Human', source: 'PHB', srd: true, entries: ['Versatile.'] },
      { name: 'Homebrew Lineage', source: 'PHB', entries: ['Not SRD.'] }
    ]
  }),
  [`${DATA_ROOT}/items.json`]: JSON.stringify({
    item: [
      { name: 'Potion of Healing', source: 'PHB', srd: true, entries: ['Restores hit points.'] },
      { name: 'Homebrew Item', source: 'PHB', entries: ['Not SRD.'] }
    ]
  }),
  [`${DATA_ROOT}/class/class-fighter.json`]: JSON.stringify({
    class: [
      { name: 'Fighter', source: 'PHB', srd: true, hd: { faces: 10 } }
    ]
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

import handler from '../../../../../server/api/content-packs/publish/srd-5-1.post'
import { clearContentPackCache, loadPublishedContentPack, computeContentIntegrityHash } from '../../../../../server/utils/content-packs'
import type { Principal } from '../../../../../server/utils/authorization'

type StoreRow = {
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

let store: StoreRow[]

function publisherPrincipal(): Principal {
  return {
    accountId: 'admin-1',
    platformCapabilities: new Set(['platform.contentpack.publish']),
    worldCapabilities: new Map(),
    temporarySingleUserMode: false
  }
}

function fakeEvent(principal: Principal | null = publisherPrincipal()) {
  return { context: { principal } } as any
}

beforeEach(() => {
  store = []
  clearContentPackCache()

  directusServiceRequestMock.mockReset()
  directusServiceRequestMock.mockImplementation(async (path: string, options: any = {}) => {
    if (path !== '/items/content_packs') {
      throw new Error(`Unexpected Directus path in test: ${path}`)
    }

    const method = options.method || 'GET'

    if (method === 'GET') {
      const clauses: any[] = options.query?.filter?._and ?? []
      const packageId = clauses.find((c) => c.package_id)?.package_id?._eq
      const version = clauses.find((c) => c.version)?.version?._eq

      const matches = store.filter((row) => row.package_id === packageId && row.version === version)
      return { data: matches }
    }

    if (method === 'POST') {
      const row: StoreRow = { ...options.body }
      store.push(row)
      return { data: row }
    }

    throw new Error(`Unexpected Directus method in test: ${method}`)
  })
})

describe('POST /api/content-packs/publish/srd-5-1', () => {
  it('fails with 401 when no principal is present, and touches neither the dataset nor Directus', async () => {
    await expect(handler(fakeEvent(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(store).toHaveLength(0)
  })

  it('fails with 403 for a principal lacking platform.contentpack.publish -- authentication alone is not sufficient', async () => {
    const underprivileged: Principal = {
      accountId: 'someone-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: false
    }

    await expect(handler(fakeEvent(underprivileged))).rejects.toMatchObject({ statusCode: 403 })
    expect(store).toHaveLength(0)
  })

  it('publishes the SRD 5.1 Content Pack successfully, using only srd-flagged entries', async () => {
    const result = await handler(fakeEvent())

    expect(result.published).toBe(true)
    expect(result.packageId).toBe('eldra.content.srd-5.1')
    expect(result.version).toBe('1.0.0')

    // Exactly the srd:true fixture in each category -- the non-SRD sibling
    // and the srd52-only (2024 revision) spell are both excluded.
    expect(result.counts).toEqual({
      spells: 1,
      items: 1,
      backgrounds: 1,
      feats: 1,
      species: 1,
      classes: 1
    })
  })

  it('generates a proper manifest via the real publishing pipeline (no direct Directus write bypassing it)', async () => {
    await handler(fakeEvent())

    expect(store).toHaveLength(1)
    const row = store[0]

    expect(row.package_id).toBe('eldra.content.srd-5.1')
    expect(row.version).toBe('1.0.0')
    expect(row.status).toBe('published')
    expect(row.title).toBe('5th Edition SRD 5.1')
    expect(row.license_id).toBe('OGL-1.0a')

    expect(row.manifest).toMatchObject({
      packageId: 'eldra.content.srd-5.1',
      version: '1.0.0',
      status: 'published',
      title: '5th Edition SRD 5.1',
      license: { id: 'OGL-1.0a' },
      origin: { kind: 'translated', adapterId: '5etools-json', sourceId: 'srd-5.1' }
    })

    // One candidate per srd-flagged fixture entry, converted through the
    // real adapter -- `data` is the untouched raw 5etools entry, never a
    // World-entity block shape.
    expect(row.content).toHaveLength(6)
    const spellEntry = row.content.find((entry: any) => entry.entityType === 'spell')
    expect(spellEntry.title).toBe('Fire Bolt')
    expect(spellEntry.data.srd).toBe(true)
    expect(spellEntry.data).not.toHaveProperty('blocks')
  })

  it('computes and stores real integrity over the published content', async () => {
    await handler(fakeEvent())

    const row = store[0]
    const recomputed = computeContentIntegrityHash(row.content)
    expect(row.integrity_hash).toBe(recomputed)
  })

  it('round-trip loads successfully through the real loadPublishedContentPack, integrity intact', async () => {
    await handler(fakeEvent())

    const loaded = await loadPublishedContentPack('eldra.content.srd-5.1', '1.0.0')

    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.package.packageId).toBe('eldra.content.srd-5.1')
      expect(loaded.package.content).toHaveLength(6)
      expect(loaded.package.manifest.title).toBe('5th Edition SRD 5.1')
    }
  })

  it('rejects a duplicate publish of the same (packageId, version) rather than overwriting', async () => {
    await handler(fakeEvent())
    expect(store).toHaveLength(1)

    await expect(handler(fakeEvent())).rejects.toMatchObject({ statusCode: 409 })

    // Still exactly one row -- the duplicate attempt wrote nothing.
    expect(store).toHaveLength(1)
  })
})
