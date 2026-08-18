// Unit tests for the Content Pack loader (server/utils/content-packs.ts,
// Content Pack Infrastructure Phase 1). Directus is mocked at the module
// boundary (server/utils/directus.ts) -- that module relies on Nuxt
// auto-imports (useRuntimeConfig, $fetch) that do not exist under plain
// Vitest, exactly as tests/server/utils/rules-packages.test.ts already
// documents.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import {
  clearContentPackCache,
  computeContentIntegrityHash,
  listPublishedContentPacks,
  loadContentPackManifest,
  loadPublishedContentPack,
  publishContentPackRelease
} from '../../../server/utils/content-packs'
import type { ContentPackEntry, ContentPackManifest } from '../../../server/utils/content-packs'

function manifest(overrides: Partial<ContentPackManifest> = {}): ContentPackManifest {
  return {
    packageId: 'eldra.test.content',
    version: '1.0.0',
    status: 'published',
    contentSchemaVersion: 1,
    title: 'Test Content Pack',
    license: { id: 'CC0-1.0' },
    ...overrides
  }
}

function directusListResponse(rows: any[]) {
  return { data: rows }
}

// Builds a Directus content_packs row consistent with a given manifest and
// content list (integrity_hash computed to actually match, by default),
// then applies any explicit row-level overrides on top -- e.g. to simulate
// a tampered/mismatched/malformed row for failure-path tests.
function buildRow(options: {
  manifest?: ContentPackManifest
  content?: ContentPackEntry[]
  rowOverrides?: Record<string, any>
} = {}) {
  const effectiveManifest = options.manifest ?? manifest()
  const content: ContentPackEntry[] = options.content ?? [{ id: 'item:torch' }, { id: 'item:rope' }]

  const row: Record<string, any> = {
    package_id: effectiveManifest.packageId,
    version: effectiveManifest.version,
    status: 'published',
    content_schema_version: effectiveManifest.contentSchemaVersion,
    title: effectiveManifest.title,
    integrity_hash: computeContentIntegrityHash(content),
    license_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    manifest: effectiveManifest,
    content
  }

  return { ...row, ...(options.rowOverrides ?? {}) }
}

beforeEach(() => {
  clearContentPackCache()
  directusServiceRequestMock.mockReset()
})

describe('listPublishedContentPacks', () => {
  it('maps published rows to exactly the five documented envelope fields, including license_id (Content Pack Binding UI)', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        { package_id: 'eldra.srd-5.1', version: '1.0.0', title: 'SRD 5.1', content_schema_version: 1, license_id: 'OGL-1.0a' }
      ])
    )

    const result = await listPublishedContentPacks()

    expect(result).toEqual([
      { packageId: 'eldra.srd-5.1', version: '1.0.0', title: 'SRD 5.1', contentSchemaVersion: 1, licenseId: 'OGL-1.0a' }
    ])
  })

  it('licenseId is null, never a crash, when the row has none', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        { package_id: 'eldra.srd-5.1', version: '1.0.0', title: 'SRD 5.1', content_schema_version: 1 }
      ])
    )

    const result = await listPublishedContentPacks()

    expect(result[0]!.licenseId).toBeNull()
  })

  it('never exposes manifest or content, even if the row somehow carried them', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        {
          package_id: 'eldra.srd-5.1',
          version: '1.0.0',
          title: 'SRD 5.1',
          content_schema_version: 1,
          license_id: 'OGL-1.0a',
          manifest: { packageId: 'eldra.srd-5.1' },
          content: [{ id: 'item:x' }]
        }
      ])
    )

    const result = await listPublishedContentPacks()

    expect(result[0]).not.toHaveProperty('manifest')
    expect(result[0]).not.toHaveProperty('content')
    expect(Object.keys(result[0]!).sort()).toEqual(['contentSchemaVersion', 'licenseId', 'packageId', 'title', 'version'])
  })

  it('filters to status: published at the query level', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    await listPublishedContentPacks()

    const [, options] = directusServiceRequestMock.mock.calls[0]!
    expect(options.query.filter).toEqual({ status: { _eq: 'published' } })
  })

  it('requests only the five envelope columns, never manifest/content', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    await listPublishedContentPacks()

    const [, options] = directusServiceRequestMock.mock.calls[0]!
    expect(options.query.fields).toBe('package_id,version,title,content_schema_version,license_id')
  })

  it('returns an empty array when nothing is published', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))
    expect(await listPublishedContentPacks()).toEqual([])
  })

  it('lists multiple versions of the same package as separate entries', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        { package_id: 'eldra.srd-5.1', version: '1.1.0', title: 'SRD 5.1', content_schema_version: 1 },
        { package_id: 'eldra.srd-5.1', version: '1.0.0', title: 'SRD 5.1', content_schema_version: 1 }
      ])
    )

    const result = await listPublishedContentPacks()

    expect(result.map((pkg) => pkg.version)).toEqual(['1.1.0', '1.0.0'])
  })
})

describe('computeContentIntegrityHash', () => {
  it('is stable across repeated calls with the same content', () => {
    const content: ContentPackEntry[] = [{ id: 'item:a' }, { id: 'item:b' }]
    expect(computeContentIntegrityHash(content)).toBe(computeContentIntegrityHash(content))
  })

  it('changes when content order changes -- order is content, not incidental', () => {
    const a: ContentPackEntry[] = [{ id: 'item:a' }, { id: 'item:b' }]
    const b: ContentPackEntry[] = [{ id: 'item:b' }, { id: 'item:a' }]
    expect(computeContentIntegrityHash(a)).not.toBe(computeContentIntegrityHash(b))
  })

  it('changes when any content entry changes', () => {
    const a: ContentPackEntry[] = [{ id: 'item:a', weight: 1 }]
    const b: ContentPackEntry[] = [{ id: 'item:a', weight: 2 }]
    expect(computeContentIntegrityHash(a)).not.toBe(computeContentIntegrityHash(b))
  })

  it('is prefixed sha256- and is a valid hex digest', () => {
    const hash = computeContentIntegrityHash([{ id: 'item:a' }])
    expect(hash).toMatch(/^sha256-[0-9a-f]{64}$/)
  })
})

describe('loadContentPackManifest -- manifest loading', () => {
  it('loads a manifest without requiring or checking integrity', async () => {
    const row = buildRow({ rowOverrides: { integrity_hash: 'sha256-totally-wrong-does-not-matter' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadContentPackManifest('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.title).toBe('Test Content Pack')
  })

  it('requests only status and manifest, never content', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([buildRow()]))

    await loadContentPackManifest('eldra.test.content', '1.0.0')

    const [, options] = directusServiceRequestMock.mock.calls[0]!
    expect(options.query.fields).toBe('status,manifest')
  })

  it('fails with stage "not-found" when Directus returns no matching row', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    const result = await loadContentPackManifest('eldra.missing', '9.9.9')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-found')
  })

  it('fails with stage "not-published" for a draft row', async () => {
    const row = buildRow({ rowOverrides: { status: 'draft' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadContentPackManifest('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-published')
  })

  it('fails with stage "deserialize" for an unparseable manifest string', async () => {
    const row = buildRow({ rowOverrides: { manifest: '{not valid json' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadContentPackManifest('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('deserialize')
    expect((result as any).field).toBe('manifest')
  })
})

describe('loadPublishedContentPack -- successful load', () => {
  it('loads a published pack whose integrity matches', async () => {
    const row = buildRow()
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.packageId).toBe('eldra.test.content')
    expect(result.package.version).toBe('1.0.0')
    expect(result.package.manifest.title).toBe('Test Content Pack')
    expect(result.package.content).toHaveLength(2)
    expect(result.package.integrityHash).toBe(row.integrity_hash)
  })

  it('queries Directus filtered by package_id and version, service-token style', async () => {
    const row = buildRow()
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(directusServiceRequestMock).toHaveBeenCalledWith(
      '/items/content_packs',
      expect.objectContaining({
        method: 'GET',
        query: expect.objectContaining({
          filter: {
            _and: [
              { package_id: { _eq: 'eldra.test.content' } },
              { version: { _eq: '1.0.0' } }
            ]
          }
        })
      })
    )
  })

  it('deserializes manifest/content when Directus returns them as JSON-encoded strings', async () => {
    const row = buildRow()
    const stringEncodedRow = {
      ...row,
      manifest: JSON.stringify(row.manifest),
      content: JSON.stringify(row.content)
    }
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([stringEncodedRow]))

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.content).toHaveLength(2)
  })
})

describe('loadPublishedContentPack -- not found', () => {
  it('fails with stage "not-found" when Directus returns no matching row', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    const result = await loadPublishedContentPack('eldra.missing.content', '9.9.9')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-found')
  })
})

describe('loadPublishedContentPack -- unpublished pack rejection', () => {
  it('fails with stage "not-published" for a draft row', async () => {
    const row = buildRow({ rowOverrides: { status: 'draft' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-published')
    expect((result as any).status).toBe('draft')
  })
})

describe('loadPublishedContentPack -- integrity mismatch', () => {
  it('fails loudly with stage "integrity-mismatch" when the stored hash does not match recomputed content', async () => {
    const row = buildRow({
      rowOverrides: {
        integrity_hash: 'sha256-0000000000000000000000000000000000000000000000000000000000000000'
      }
    })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('integrity-mismatch')
    expect((result as any).expected).toBe(row.integrity_hash)
  })

  it('detects tampering: content changed after integrity_hash was recorded', async () => {
    const originalContent: ContentPackEntry[] = [{ id: 'item:torch' }]
    const tamperedContent: ContentPackEntry[] = [{ id: 'item:torch' }, { id: 'item:injected' }]
    const row = buildRow({
      content: tamperedContent,
      rowOverrides: { integrity_hash: computeContentIntegrityHash(originalContent) }
    })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('integrity-mismatch')
  })
})

describe('loadPublishedContentPack -- malformed JSON rejection', () => {
  it('fails with stage "deserialize" for an unparseable content string, without throwing', async () => {
    const row = buildRow({ rowOverrides: { content: '{not valid json' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('deserialize')
    expect((result as any).field).toBe('content')
  })
})

describe('loadPublishedContentPack -- cache behavior', () => {
  it('cache miss on the first load, then a cache hit returns the same object instance', async () => {
    const row = buildRow()
    directusServiceRequestMock.mockResolvedValue(directusListResponse([row]))

    const first = await loadPublishedContentPack('eldra.test.content', '1.0.0')
    const second = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(second.package).toBe(first.package)
  })

  it('a failed load (integrity mismatch) is never cached', async () => {
    const badRow = buildRow({
      rowOverrides: {
        integrity_hash: 'sha256-bad0000000000000000000000000000000000000000000000000000000000'
      }
    })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([badRow]))

    const failed = await loadPublishedContentPack('eldra.test.content', '1.0.0')
    expect(failed.ok).toBe(false)

    const goodRow = buildRow()
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([goodRow]))

    const succeeded = await loadPublishedContentPack('eldra.test.content', '1.0.0')
    expect(succeeded.ok).toBe(true)
  })

  it('different versions of the same packageId cache independently', async () => {
    const rowV1 = buildRow()
    const rowV2 = buildRow({ manifest: manifest({ version: '2.0.0' }) })

    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([rowV1]))
    const v1 = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([rowV2]))
    const v2 = await loadPublishedContentPack('eldra.test.content', '2.0.0')

    expect(v1.ok).toBe(true)
    expect(v2.ok).toBe(true)
    if (!v1.ok || !v2.ok) return

    expect(v1.package).not.toBe(v2.package)
    expect(v1.package.version).toBe('1.0.0')
    expect(v2.package.version).toBe('2.0.0')
  })
})

// A minimal in-memory stand-in for Directus supporting exactly the two
// request shapes publishContentPackRelease issues: a GET filtered by
// package_id+version (existence check), and a POST that creates a row --
// mirrors world-content-packs.test.ts's own fake-store approach.
function createFakeContentPacksStore(initialRows: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = initialRows.map((row) => ({ ...row }))
  let nextId = 1

  directusServiceRequestMock.mockImplementation(async (_path: string, options: any = {}) => {
    const method = options.method || 'GET'

    if (method === 'GET') {
      const clauses: any[] = options.query?.filter?._and ?? (options.query?.filter ? [options.query.filter] : [])
      const matched = rows.filter((row) =>
        clauses.every((clause: any) => {
          const [field] = Object.keys(clause)
          return row[field] === clause[field]._eq
        })
      )
      return { data: options.query?.limit && options.query.limit > 0 ? matched.slice(0, options.query.limit) : matched }
    }

    if (method === 'POST') {
      const created = { id: String(nextId++), ...options.body }
      rows.push(created)
      return { data: created }
    }

    throw new Error(`createFakeContentPacksStore: unhandled method ${method}`)
  })

  return rows
}

describe('publishContentPackRelease -- new pack', () => {
  it('inserts a published row with computed integrity', async () => {
    clearContentPackCache()
    const rows = createFakeContentPacksStore([])
    const content: ContentPackEntry[] = [{ id: 'item:torch' }]
    const testManifest = manifest()

    const result = await publishContentPackRelease({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      contentSchemaVersion: 1,
      licenseId: 'CC-BY-4.0',
      manifest: testManifest,
      content
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.integrityHash).toBe(computeContentIntegrityHash(content))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('published')
    expect(rows[0].integrity_hash).toBe(computeContentIntegrityHash(content))
    expect(rows[0].package_id).toBe('eldra.srd-5.1')
    expect(rows[0].version).toBe('1.0.0')
  })

  it('populates the load cache so an immediate load is a cache hit', async () => {
    clearContentPackCache()
    createFakeContentPacksStore([])
    const content: ContentPackEntry[] = [{ id: 'item:torch' }]

    const published = await publishContentPackRelease({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      contentSchemaVersion: 1,
      licenseId: 'CC-BY-4.0',
      manifest: manifest({ packageId: 'eldra.srd-5.1', version: '1.0.0' }),
      content
    })
    expect(published.ok).toBe(true)
    if (!published.ok) return

    // Referential identity (`toBe`, not `toEqual`) is the real assertion
    // here: the fake store's GET would also succeed on a real fetch (the
    // POST body it recorded is a complete row), so only object identity
    // distinguishes "served from cache" from "fetched again".
    const loaded = await loadPublishedContentPack('eldra.srd-5.1', '1.0.0')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.package).toBe(published.package)
  })
})

describe('publishContentPackRelease -- duplicate rejection', () => {
  it('refuses a duplicate published (packageId, version) and writes nothing', async () => {
    clearContentPackCache()
    const rows = createFakeContentPacksStore([
      { id: 'r1', package_id: 'eldra.srd-5.1', version: '1.0.0', status: 'published' }
    ])

    const result = await publishContentPackRelease({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      contentSchemaVersion: 1,
      licenseId: 'CC-BY-4.0',
      manifest: manifest({ packageId: 'eldra.srd-5.1', version: '1.0.0' }),
      content: [{ id: 'item:torch' }]
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('already-exists')
    expect(result.status).toBe('published')
    expect(rows).toHaveLength(1)
  })

  it('a different version of the same packageId is allowed', async () => {
    clearContentPackCache()
    const rows = createFakeContentPacksStore([
      { id: 'r1', package_id: 'eldra.srd-5.1', version: '1.0.0', status: 'published' }
    ])

    const result = await publishContentPackRelease({
      packageId: 'eldra.srd-5.1',
      version: '2.0.0',
      title: 'SRD 5.1',
      contentSchemaVersion: 1,
      licenseId: 'CC-BY-4.0',
      manifest: manifest({ packageId: 'eldra.srd-5.1', version: '2.0.0' }),
      content: [{ id: 'item:torch' }]
    })

    expect(result.ok).toBe(true)
    expect(rows).toHaveLength(2)
  })
})

describe('publish -> list/load/manifest round trip (versioning, listing, loading)', () => {
  it('a published pack is immediately visible to listing, manifest loading, and full loading', async () => {
    clearContentPackCache()
    const rows = createFakeContentPacksStore([])
    const content: ContentPackEntry[] = [{ id: 'item:torch' }, { id: 'item:rope' }]
    const testManifest = manifest({ packageId: 'eldra.srd-5.1', title: 'SRD 5.1' })

    const published = await publishContentPackRelease({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      contentSchemaVersion: 1,
      licenseId: 'CC-BY-4.0',
      manifest: testManifest,
      content
    })
    expect(published.ok).toBe(true)

    const listed = await listPublishedContentPacks()
    expect(listed).toEqual([
      { packageId: 'eldra.srd-5.1', version: '1.0.0', title: 'SRD 5.1', contentSchemaVersion: 1, licenseId: 'CC-BY-4.0' }
    ])

    const loadedManifest = await loadContentPackManifest('eldra.srd-5.1', '1.0.0')
    expect(loadedManifest.ok).toBe(true)
    if (loadedManifest.ok) expect(loadedManifest.manifest.title).toBe('SRD 5.1')

    const loadedFull = await loadPublishedContentPack('eldra.srd-5.1', '1.0.0')
    expect(loadedFull.ok).toBe(true)
    if (loadedFull.ok) {
      expect(loadedFull.package.content).toEqual(content)
      expect(loadedFull.package.integrityHash).toBe(computeContentIntegrityHash(content))
    }
  })

  it('publishing a second version leaves the first version independently loadable (versioning)', async () => {
    clearContentPackCache()
    createFakeContentPacksStore([])

    await publishContentPackRelease({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      contentSchemaVersion: 1,
      licenseId: 'CC-BY-4.0',
      manifest: manifest({ packageId: 'eldra.srd-5.1', version: '1.0.0' }),
      content: [{ id: 'item:torch' }]
    })

    await publishContentPackRelease({
      packageId: 'eldra.srd-5.1',
      version: '1.1.0',
      title: 'SRD 5.1',
      contentSchemaVersion: 1,
      licenseId: 'CC-BY-4.0',
      manifest: manifest({ packageId: 'eldra.srd-5.1', version: '1.1.0' }),
      content: [{ id: 'item:torch' }, { id: 'item:lantern' }]
    })

    const v1 = await loadPublishedContentPack('eldra.srd-5.1', '1.0.0')
    const v11 = await loadPublishedContentPack('eldra.srd-5.1', '1.1.0')

    expect(v1.ok && v1.package.content).toHaveLength(1)
    expect(v11.ok && v11.package.content).toHaveLength(2)
  })
})
