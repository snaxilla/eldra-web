// Unit tests for the Rules Package loader (server/utils/rules-packages.ts,
// Infrastructure Commit 3). Directus is mocked at the module boundary
// (server/utils/directus.ts) -- that module relies on Nuxt auto-imports
// (useRuntimeConfig, $fetch) that do not exist under plain Vitest, so it
// must never actually execute in this test file.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import {
  CURRENT_ENGINE_API_VERSION,
  clearRulesPackageCache,
  computeIntegrityHash,
  listPublishedRulesPackages,
  loadPublishedPackage,
  satisfiesEngineApiVersion
} from '../../../server/utils/rules-packages'
import type { Definition, RulesPackageManifest, ValueDefinition } from '../../../app/lib/rules/types'

function manifest(overrides: Partial<RulesPackageManifest> = {}): RulesPackageManifest {
  return {
    packageId: 'eldra.test.pkg',
    version: '1.0.0',
    status: 'published',
    engineApiVersion: '^1.0.0',
    stateSchemaVersion: 1,
    title: 'Test Package',
    license: { id: 'CC0-1.0' },
    capabilities: [],
    dependencies: [],
    ...overrides
  }
}

function storedValue(id: string): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored' }
}

function directusListResponse(rows: any[]) {
  return { data: rows }
}

// Builds a Directus rules_packages row consistent with a given manifest and
// definitions list (integrity_hash computed to actually match, by default),
// then applies any explicit row-level overrides on top -- e.g. to simulate
// a tampered/mismatched/malformed row for failure-path tests.
function buildRow(options: {
  manifest?: RulesPackageManifest
  definitions?: Definition[]
  rowOverrides?: Record<string, any>
} = {}) {
  const effectiveManifest = options.manifest ?? manifest()
  const definitions: Definition[] = options.definitions ?? [storedValue('value:str'), storedValue('value:dex')]

  const row: Record<string, any> = {
    package_id: effectiveManifest.packageId,
    version: effectiveManifest.version,
    status: 'published',
    engine_api_version: effectiveManifest.engineApiVersion,
    state_schema_version: effectiveManifest.stateSchemaVersion,
    title: effectiveManifest.title,
    integrity_hash: computeIntegrityHash(definitions),
    license_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    manifest: effectiveManifest,
    definitions,
    validation_issues: null
  }

  return { ...row, ...(options.rowOverrides ?? {}) }
}

beforeEach(() => {
  clearRulesPackageCache()
  directusServiceRequestMock.mockReset()
})

// Infrastructure Commit 9's own PACKAGE LIST section: "Return only
// packageId, version, title, engineApiVersion. Do not expose manifest. Do
// not expose definitions." -- verified below by asserting on the exact
// object shape, not just a subset of expected keys.
describe('listPublishedRulesPackages', () => {
  it('maps published rows to exactly the four documented envelope fields', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        { package_id: 'eldra.starter.generic-d20', version: '0.1.0', title: 'Eldra Generic d20 (Starter)', engine_api_version: '^1.0.0' }
      ])
    )

    const result = await listPublishedRulesPackages()

    expect(result).toEqual([
      { packageId: 'eldra.starter.generic-d20', version: '0.1.0', title: 'Eldra Generic d20 (Starter)', engineApiVersion: '^1.0.0' }
    ])
  })

  it('never exposes manifest or definitions, even if the row somehow carried them', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        {
          package_id: 'eldra.starter.generic-d20',
          version: '0.1.0',
          title: 'Starter',
          engine_api_version: '^1.0.0',
          manifest: { packageId: 'eldra.starter.generic-d20' },
          definitions: [{ id: 'value:x' }]
        }
      ])
    )

    const result = await listPublishedRulesPackages()

    expect(result[0]).not.toHaveProperty('manifest')
    expect(result[0]).not.toHaveProperty('definitions')
    expect(Object.keys(result[0]!).sort()).toEqual(['engineApiVersion', 'packageId', 'title', 'version'])
  })

  it('filters to status: published at the query level', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    await listPublishedRulesPackages()

    const [, options] = directusServiceRequestMock.mock.calls[0]!
    expect(options.query.filter).toEqual({ status: { _eq: 'published' } })
  })

  it('requests only the four envelope columns, never manifest/definitions', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    await listPublishedRulesPackages()

    const [, options] = directusServiceRequestMock.mock.calls[0]!
    expect(options.query.fields).toBe('package_id,version,title,engine_api_version')
  })

  it('returns an empty array when nothing is published', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))
    expect(await listPublishedRulesPackages()).toEqual([])
  })

  it('lists multiple versions of the same package as separate entries', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(
      directusListResponse([
        { package_id: 'eldra.starter.generic-d20', version: '0.2.0', title: 'Starter', engine_api_version: '^1.0.0' },
        { package_id: 'eldra.starter.generic-d20', version: '0.1.0', title: 'Starter', engine_api_version: '^1.0.0' }
      ])
    )

    const result = await listPublishedRulesPackages()

    expect(result.map((pkg) => pkg.version)).toEqual(['0.2.0', '0.1.0'])
  })
})

describe('computeIntegrityHash', () => {
  it('is stable across repeated calls with the same definitions', () => {
    const definitions: Definition[] = [storedValue('value:a'), storedValue('value:b')]
    expect(computeIntegrityHash(definitions)).toBe(computeIntegrityHash(definitions))
  })

  it('changes when definition order changes -- order is content, not incidental', () => {
    const a: Definition[] = [storedValue('value:a'), storedValue('value:b')]
    const b: Definition[] = [storedValue('value:b'), storedValue('value:a')]
    expect(computeIntegrityHash(a)).not.toBe(computeIntegrityHash(b))
  })

  it('changes when any definition content changes', () => {
    const a: Definition[] = [storedValue('value:a')]
    const b: Definition[] = [{ ...storedValue('value:a'), valueType: 'text' }]
    expect(computeIntegrityHash(a)).not.toBe(computeIntegrityHash(b))
  })

  it('is prefixed sha256- and is a valid hex digest', () => {
    const hash = computeIntegrityHash([storedValue('value:a')])
    expect(hash).toMatch(/^sha256-[0-9a-f]{64}$/)
  })
})

describe('satisfiesEngineApiVersion', () => {
  it('a caret range is satisfied by the exact base version', () => {
    expect(satisfiesEngineApiVersion('^1.0.0', '1.0.0')).toBe(true)
  })

  it('a caret range is satisfied by a later patch/minor within the same major', () => {
    expect(satisfiesEngineApiVersion('^1.0.0', '1.4.2')).toBe(true)
  })

  it('a caret range rejects a lower version than its base', () => {
    expect(satisfiesEngineApiVersion('^1.2.0', '1.1.9')).toBe(false)
  })

  it('a caret range rejects the next major version', () => {
    expect(satisfiesEngineApiVersion('^1.0.0', '2.0.0')).toBe(false)
  })

  it('a 0.x caret range is minor-locked (^0.2.3 excludes 0.3.0)', () => {
    expect(satisfiesEngineApiVersion('^0.2.3', '0.2.9')).toBe(true)
    expect(satisfiesEngineApiVersion('^0.2.3', '0.3.0')).toBe(false)
  })

  it('a bare exact version requires an exact match', () => {
    expect(satisfiesEngineApiVersion('1.0.0', '1.0.0')).toBe(true)
    expect(satisfiesEngineApiVersion('1.0.0', '1.0.1')).toBe(false)
  })

  it('rejects unparseable versions on either side', () => {
    expect(satisfiesEngineApiVersion('^not-a-version', '1.0.0')).toBe(false)
    expect(satisfiesEngineApiVersion('^1.0.0', 'not-a-version')).toBe(false)
  })
})

describe('loadPublishedPackage -- successful load', () => {
  it('loads a published package whose integrity matches', async () => {
    const row = buildRow()
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.packageId).toBe('eldra.test.pkg')
    expect(result.package.version).toBe('1.0.0')
    expect(result.package.manifest.title).toBe('Test Package')
    expect(result.package.definitions).toHaveLength(2)
    expect(result.package.integrityHash).toBe(row.integrity_hash)
  })

  it('queries Directus filtered by package_id and version, service-token style', async () => {
    const row = buildRow()
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(directusServiceRequestMock).toHaveBeenCalledWith(
      '/items/rules_packages',
      expect.objectContaining({
        method: 'GET',
        query: expect.objectContaining({
          filter: {
            _and: [
              { package_id: { _eq: 'eldra.test.pkg' } },
              { version: { _eq: '1.0.0' } }
            ]
          }
        })
      })
    )
  })

  it('deserializes manifest/definitions when Directus returns them as JSON-encoded strings', async () => {
    const row = buildRow()
    const stringEncodedRow = {
      ...row,
      manifest: JSON.stringify(row.manifest),
      definitions: JSON.stringify(row.definitions)
    }
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([stringEncodedRow]))

    const result = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.definitions).toHaveLength(2)
  })

  it('is ready to hand to createWorldRuntime -- manifest and definitions round-trip untouched', async () => {
    const row = buildRow()
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.manifest).toEqual(row.manifest)
    expect(result.package.definitions).toEqual(row.definitions)
  })
})

describe('loadPublishedPackage -- not found', () => {
  it('fails with stage "not-found" when Directus returns no matching row', async () => {
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([]))

    const result = await loadPublishedPackage('eldra.missing.pkg', '9.9.9')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-found')
  })
})

describe('loadPublishedPackage -- unpublished package rejection', () => {
  it('fails with stage "not-published" for a draft row', async () => {
    const row = buildRow({ rowOverrides: { status: 'draft' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-published')
    expect((result as any).status).toBe('draft')
  })
})

describe('loadPublishedPackage -- engine compatibility', () => {
  it('fails with stage "engine-incompatible" when the manifest range excludes the running engine', async () => {
    const testManifest = manifest({ engineApiVersion: '^2.0.0' })
    const row = buildRow({ manifest: testManifest })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('engine-incompatible')
    expect((result as any).declaredRange).toBe('^2.0.0')
    expect((result as any).engineVersion).toBe(CURRENT_ENGINE_API_VERSION)
  })
})

describe('loadPublishedPackage -- integrity mismatch', () => {
  it('fails loudly with stage "integrity-mismatch" when the stored hash does not match recomputed content', async () => {
    const row = buildRow({
      rowOverrides: {
        integrity_hash: 'sha256-0000000000000000000000000000000000000000000000000000000000000000'
      }
    })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('integrity-mismatch')
    expect((result as any).expected).toBe(row.integrity_hash)
  })

  it('detects tampering: definitions changed after integrity_hash was recorded', async () => {
    const originalDefinitions: Definition[] = [storedValue('value:str')]
    const tamperedDefinitions: Definition[] = [storedValue('value:str'), storedValue('value:injected')]
    const row = buildRow({
      definitions: tamperedDefinitions,
      rowOverrides: { integrity_hash: computeIntegrityHash(originalDefinitions) }
    })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('integrity-mismatch')
  })
})

describe('loadPublishedPackage -- malformed JSON rejection', () => {
  it('fails with stage "deserialize" for an unparseable definitions string, without throwing', async () => {
    const row = buildRow({ rowOverrides: { definitions: '{not valid json' } })
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([row]))

    const result = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('deserialize')
    expect((result as any).field).toBe('definitions')
  })
})

describe('loadPublishedPackage -- cache behavior', () => {
  it('cache miss on the first load, then a cache hit returns the same object instance', async () => {
    const row = buildRow()
    directusServiceRequestMock.mockResolvedValue(directusListResponse([row]))

    const first = await loadPublishedPackage('eldra.test.pkg', '1.0.0')
    const second = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

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

    const failed = await loadPublishedPackage('eldra.test.pkg', '1.0.0')
    expect(failed.ok).toBe(false)

    const goodRow = buildRow()
    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([goodRow]))

    const succeeded = await loadPublishedPackage('eldra.test.pkg', '1.0.0')
    expect(succeeded.ok).toBe(true)
  })

  it('repeated loads of the same published package are deterministic in content across calls', async () => {
    const row = buildRow()
    directusServiceRequestMock.mockResolvedValue(directusListResponse([row]))

    const results = []
    for (let i = 0; i < 5; i++) {
      results.push(await loadPublishedPackage('eldra.test.pkg', '1.0.0'))
    }

    for (const result of results) {
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.package.integrityHash).toBe(row.integrity_hash)
      expect(result.package.definitions).toEqual(row.definitions)
    }
  })

  it('different versions of the same packageId cache independently', async () => {
    const rowV1 = buildRow()
    const rowV2 = buildRow({ manifest: manifest({ version: '2.0.0' }) })

    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([rowV1]))
    const v1 = await loadPublishedPackage('eldra.test.pkg', '1.0.0')

    directusServiceRequestMock.mockResolvedValueOnce(directusListResponse([rowV2]))
    const v2 = await loadPublishedPackage('eldra.test.pkg', '2.0.0')

    expect(v1.ok).toBe(true)
    expect(v2.ok).toBe(true)
    if (!v1.ok || !v2.ok) return

    expect(v1.package).not.toBe(v2.package)
    expect(v1.package.version).toBe('1.0.0')
    expect(v2.package.version).toBe('2.0.0')
  })
})
