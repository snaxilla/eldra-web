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

// Published-Release Load Reduction Pass -- loadPublishedContentPack now
// issues up to TWO Directus calls per logical load on a cache miss: a
// lightweight metadata-only read (status/integrity_hash/manifest), then,
// only if nothing is already cached for the resulting (packageId, version,
// integrity_hash), a second content-only read. This queues the SAME row
// for both -- the mock does not enforce server-side `fields` selection, so
// returning the full row to both calls is faithful: each call only reads
// the specific columns it asked for. Use this for any COLD (first-time,
// not-yet-cached) logical load; a call that returns early after STEP 1
// (not-found/not-published/malformed-manifest) or that hits the cache
// needs only ONE queued response -- see the tests that assert that
// directly below.
function queueColdLoad(row: Record<string, unknown>) {
  directusServiceRequestMock
    .mockResolvedValueOnce(directusListResponse([row]))
    .mockResolvedValueOnce(directusListResponse([row]))
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
      { packageId: 'eldra.srd-5.1', version: '1.0.0', title: 'SRD 5.1', contentSchemaVersion: 1, licenseId: 'OGL-1.0a', origin: null }
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

  it('never exposes the raw manifest or content, even though manifest is now read to extract origin', async () => {
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
    expect(Object.keys(result[0]!).sort()).toEqual(['contentSchemaVersion', 'licenseId', 'origin', 'packageId', 'title', 'version'])
  })

  it('extracts origin.adapterId/sourceId from the manifest when present (Refresh Content Package identity fix)', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        {
          package_id: 'eldra.solaris.xphb',
          version: '1.0.4',
          title: "Player's Handbook (2024)",
          content_schema_version: 1,
          license_id: null,
          manifest: {
            packageId: 'eldra.solaris.xphb',
            origin: { kind: 'translated', adapterId: '5etools-json', sourceId: 'xphb' }
          }
        }
      ])
    )

    const result = await listPublishedContentPacks()

    expect(result[0]!.origin).toEqual({ adapterId: '5etools-json', sourceId: 'xphb' })
  })

  it('origin is null when the manifest has no origin, or only a partial one', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        { package_id: 'a', version: '1.0.0', title: 'A', content_schema_version: 1, license_id: null, manifest: { packageId: 'a' } },
        {
          package_id: 'b',
          version: '1.0.0',
          title: 'B',
          content_schema_version: 1,
          license_id: null,
          manifest: { packageId: 'b', origin: { kind: 'translated', adapterId: '5etools-json' } }
        }
      ])
    )

    const result = await listPublishedContentPacks()

    expect(result[0]!.origin).toBeNull()
    expect(result[1]!.origin).toBeNull()
  })

  it('filters to status: published at the query level', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    await listPublishedContentPacks()

    const [, options] = directusServiceRequestMock.mock.calls[0]!
    expect(options.query.filter).toEqual({ status: { _eq: 'published' } })
  })

  it('requests the six envelope+manifest columns, never content', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    await listPublishedContentPacks()

    const [, options] = directusServiceRequestMock.mock.calls[0]!
    expect(options.query.fields).toBe('package_id,version,title,content_schema_version,license_id,manifest')
    expect(String(options.query.fields).split(',')).not.toContain('content')
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

  // Content Workspaces & Studio Phase 0, Area 2 -- the reported defect:
  // Directus sorts `version` (a plain varchar column) LEXICALLY, so a row
  // order like the real eldra.solaris.xphb pack history ("1.0.33" through
  // "1.0.38") would rank "1.0.33", "1.0.34", ..., "1.0.38", "1.0.9" if left
  // trusted as-is -- "1.0.9" lexically outranks every "1.0.3x" version.
  // This asserts the function's OWN output order is numerically correct
  // regardless of what order the (mocked) Directus response returns rows
  // in, proving the fix is the explicit re-sort inside
  // listPublishedContentPacks, not a hope that Directus happens to agree.
  it('re-sorts the Directus response numerically by version (descending), per package, even when Directus returns rows in lexical order', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        { package_id: 'eldra.solaris.xphb', version: '1.0.33', title: 'PHB', content_schema_version: 1 },
        { package_id: 'eldra.solaris.xphb', version: '1.0.34', title: 'PHB', content_schema_version: 1 },
        { package_id: 'eldra.solaris.xphb', version: '1.0.9', title: 'PHB', content_schema_version: 1 },
        { package_id: 'eldra.solaris.xphb', version: '1.0.38', title: 'PHB', content_schema_version: 1 },
        { package_id: 'eldra.solaris.xphb', version: '1.0.4', title: 'PHB', content_schema_version: 1 }
      ])
    )

    const result = await listPublishedContentPacks()

    expect(result.map((pkg) => pkg.version)).toEqual(['1.0.38', '1.0.34', '1.0.33', '1.0.9', '1.0.4'])
  })

  it('groups by packageId (ascending), then orders each group\'s versions numerically descending', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        { package_id: 'eldra.b', version: '1.0.9', title: 'B', content_schema_version: 1 },
        { package_id: 'eldra.a', version: '1.0.38', title: 'A', content_schema_version: 1 },
        { package_id: 'eldra.b', version: '1.0.10', title: 'B', content_schema_version: 1 },
        { package_id: 'eldra.a', version: '1.0.9', title: 'A', content_schema_version: 1 }
      ])
    )

    const result = await listPublishedContentPacks()

    expect(result.map((pkg) => `${pkg.packageId}@${pkg.version}`)).toEqual([
      'eldra.a@1.0.38',
      'eldra.a@1.0.9',
      'eldra.b@1.0.10',
      'eldra.b@1.0.9'
    ])
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
    queueColdLoad(row)

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
    queueColdLoad(row)

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

  it('splits a cold load into a lightweight metadata read, then a content-only read -- never one fields:* read', async () => {
    const row = buildRow()
    queueColdLoad(row)

    await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(directusServiceRequestMock).toHaveBeenCalledTimes(2)
    const fieldsRequested = directusServiceRequestMock.mock.calls.map((call) => String(call[1]?.query?.fields))
    expect(fieldsRequested).toEqual(['status,integrity_hash,manifest', 'content'])
  })

  it('deserializes manifest/content when Directus returns them as JSON-encoded strings', async () => {
    const row = buildRow()
    const stringEncodedRow = {
      ...row,
      manifest: JSON.stringify(row.manifest),
      content: JSON.stringify(row.content)
    }
    queueColdLoad(stringEncodedRow)

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

// Package Sync Hotfix 1 -- AUDIT THE DOWNSTREAM LOOKUP. Real production
// incident: an `undefined` version reached this function's own Directus
// query, whose `filter: { version: { _eq: undefined } }` clause serializes
// (via JSON.stringify, which drops `undefined` object properties) to an
// EMPTY operator object -- which Directus reads as "no constraint," turning
// an intended exact-version lookup into an unconstrained one that returned
// an arbitrary historical row. This guard makes that structurally
// impossible: proven here by asserting `directusServiceRequestMock` is
// NEVER called for an empty/absent packageId or version -- the request is
// never even constructed, let alone sent with a half-empty filter.
describe('loadPublishedContentPack -- fails closed on an invalid version/packageId, before any Directus call', () => {
  it('reports "not-found" for an undefined version without ever calling Directus', async () => {
    const result = await loadPublishedContentPack('eldra.test.content', undefined as unknown as string)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-found')
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('reports "not-found" for an empty-string version without ever calling Directus', async () => {
    const result = await loadPublishedContentPack('eldra.test.content', '')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-found')
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('reports "not-found" for an empty-string packageId without ever calling Directus', async () => {
    const result = await loadPublishedContentPack('', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-found')
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})

describe('loadPublishedContentPack -- unpublished pack rejection', () => {
  it('fails with stage "not-published" for a draft row, without ever requesting the content column', async () => {
    const row = buildRow({ rowOverrides: { status: 'draft' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-published')
    expect((result as any).status).toBe('draft')
    // Published-Release Load Reduction Pass -- the metadata-only STEP 1
    // read already has enough to fail here; STEP 2's content-only read must
    // never be issued for a row that isn't published.
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
  })
})

describe('loadPublishedContentPack -- integrity mismatch', () => {
  it('fails loudly with stage "integrity-mismatch" when the stored hash does not match recomputed content', async () => {
    const row = buildRow({
      rowOverrides: {
        integrity_hash: 'sha256-0000000000000000000000000000000000000000000000000000000000000000'
      }
    })
    queueColdLoad(row)

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
    queueColdLoad(row)

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('integrity-mismatch')
  })

  it('fails with stage "deserialize" for an unparseable manifest, without ever requesting the content column (metadata-only STEP 1 already has enough to fail)', async () => {
    const row = buildRow({ rowOverrides: { manifest: '{not valid json' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('deserialize')
    if (result.stage !== 'deserialize') return
    expect(result.field).toBe('manifest')
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
  })
})

describe('loadPublishedContentPack -- malformed JSON rejection', () => {
  it('fails with stage "deserialize" for an unparseable content string, without throwing', async () => {
    const row = buildRow({ rowOverrides: { content: '{not valid json' } })
    queueColdLoad(row)

    const result = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('deserialize')
    expect((result as any).field).toBe('content')
  })
})

describe('loadPublishedContentPack -- cache behavior', () => {
  it('cache miss on the first load (2 Directus calls), then a cache hit (1 call) reuses the SAME content array', async () => {
    const row = buildRow()
    // Published-Release Load Reduction Pass -- the whole-package `toBe`
    // (referential identity) this test used to assert no longer holds by
    // design: `manifest`/`status` are re-read fresh on every call (so a
    // legitimate manifest-only edit is still picked up immediately -- see
    // the cache Map's own header), so the OUTER package object is rebuilt
    // every time even on a cache hit. What a cache hit actually guarantees
    // -- and what this test now asserts instead -- is that the heavy
    // `content` array is the SAME reference (never re-fetched/re-parsed)
    // and that the second call issues only the lightweight metadata read.
    directusServiceRequestMock.mockResolvedValue(directusListResponse([row]))

    const first = await loadPublishedContentPack('eldra.test.content', '1.0.0')
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(2)

    directusServiceRequestMock.mockClear()
    const second = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(second.package.content).toBe(first.package.content)
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
    expect(String(directusServiceRequestMock.mock.calls[0][1]?.query?.fields)).toBe('status,integrity_hash,manifest')
  })

  it('a failed load (integrity mismatch) is never cached', async () => {
    const badRow = buildRow({
      rowOverrides: {
        integrity_hash: 'sha256-bad0000000000000000000000000000000000000000000000000000000000'
      }
    })
    queueColdLoad(badRow)

    const failed = await loadPublishedContentPack('eldra.test.content', '1.0.0')
    expect(failed.ok).toBe(false)

    const goodRow = buildRow()
    queueColdLoad(goodRow)

    const succeeded = await loadPublishedContentPack('eldra.test.content', '1.0.0')
    expect(succeeded.ok).toBe(true)
  })

  it('different versions of the same packageId cache independently', async () => {
    const rowV1 = buildRow()
    const rowV2 = buildRow({ manifest: manifest({ version: '2.0.0' }) })

    queueColdLoad(rowV1)
    const v1 = await loadPublishedContentPack('eldra.test.content', '1.0.0')

    queueColdLoad(rowV2)
    const v2 = await loadPublishedContentPack('eldra.test.content', '2.0.0')

    expect(v1.ok).toBe(true)
    expect(v2.ok).toBe(true)
    if (!v1.ok || !v2.ok) return

    expect(v1.package).not.toBe(v2.package)
    expect(v1.package.version).toBe('1.0.0')
    expect(v2.package.version).toBe('2.0.0')
  })

  it('a row whose integrity_hash changes between calls is treated as a cache miss, not silently served stale', async () => {
    // Establishes and tests the ACTUAL contract per instruction, rather
    // than assuming (packageId, version) content can never change once
    // published: this module's own write path (publishContentPackRelease)
    // refuses to overwrite an existing row, but nothing in
    // loadPublishedContentPack itself assumes that -- it re-reads
    // integrity_hash fresh on every call and keys the cache by it, so if
    // the stored hash ever legitimately differs from what is cached, the
    // heavier content read runs again rather than reusing a stale entry.
    const firstContent: ContentPackEntry[] = [{ id: 'item:torch' }]
    const secondContent: ContentPackEntry[] = [{ id: 'item:torch' }, { id: 'item:lantern' }]
    const firstRow = buildRow({ content: firstContent })
    const secondRow = buildRow({ content: secondContent, rowOverrides: { integrity_hash: computeContentIntegrityHash(secondContent) } })

    queueColdLoad(firstRow)
    const first = await loadPublishedContentPack('eldra.test.content', '1.0.0')
    expect(first.ok && first.package.content).toHaveLength(1)

    queueColdLoad(secondRow)
    const second = await loadPublishedContentPack('eldra.test.content', '1.0.0')
    expect(second.ok && second.package.content).toHaveLength(2)
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

    // Published-Release Load Reduction Pass -- the cache now holds only
    // `content`, not the full package (manifest/status are always re-read
    // fresh -- see the cache Map's own header), so the outer object is no
    // longer the same instance even on a cache hit. The real assertion is
    // that the heavy `content` array IS the same instance (never re-
    // fetched/re-parsed) and that the load issues only ONE Directus call
    // -- the lightweight metadata read -- never the content-only one.
    const callsBeforePublish = directusServiceRequestMock.mock.calls.length
    const loaded = await loadPublishedContentPack('eldra.srd-5.1', '1.0.0')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.package.content).toBe(published.package.content)
    expect(directusServiceRequestMock.mock.calls.length).toBe(callsBeforePublish + 1)
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
      { packageId: 'eldra.srd-5.1', version: '1.0.0', title: 'SRD 5.1', contentSchemaVersion: 1, licenseId: 'CC-BY-4.0', origin: null }
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
