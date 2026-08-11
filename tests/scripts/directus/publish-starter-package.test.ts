// Unit tests for the starter package + publish script
// (packages/eldra-generic-d20, scripts/directus/publish-starter-package.mjs,
// Infrastructure Commit 4).
//
// The publish script is plain Node ESM and is imported directly (it has no
// TypeScript syntax of its own -- see its own header for why it loads the
// TS engine via jiti only in its real-Directus main() path). These tests
// bypass that path entirely and inject the REAL validatePackage/
// parseExpression/computeIntegrityHash via ordinary TypeScript imports
// (Vitest transforms .ts natively -- no jiti needed here), plus a fake
// in-memory `dx` in place of real Directus I/O.
//
// server/utils/rules-packages.ts is mocked at the ./directus boundary for
// the same reason tests/server/utils/rules-packages.test.ts already
// documents: that module relies on Nuxt auto-imports that do not exist
// under plain Vitest.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { parseExpression } from '../../../app/lib/rules/parser'
import { validatePackage } from '../../../app/lib/rules/package-validation'
import {
  clearRulesPackageCache,
  computeIntegrityHash,
  loadPublishedPackage
} from '../../../server/utils/rules-packages'
import {
  DEFAULT_PACKAGE_DIR,
  PublishAbortError,
  buildPublishRow,
  hydrateExpressions,
  loadAndValidatePackage,
  loadPackageSource,
  publishStarterPackage
  // @ts-expect-error -- plain .mjs, no type declarations
} from '../../../scripts/directus/publish-starter-package.mjs'

const deps = { parseExpression, validatePackage, computeIntegrityHash }

// A minimal in-memory stand-in for the real `dx()` Directus helper,
// supporting exactly the two request shapes publish-starter-package.mjs
// issues: a GET with a `{ _and: [{ field: { _eq } }, ...] }` filter, and a
// POST that inserts a new row and assigns it an id.
function createFakeDirectus(initialRows: any[] = []) {
  const rows: any[] = [...initialRows]
  let nextId = 1
  const calls: Array<{ path: string; options: any }> = []

  function matches(row: any, filter: any): boolean {
    if (!filter) return true
    if (filter._and) return filter._and.every((clause: any) => matches(row, clause))
    return Object.entries(filter).every(([field, cond]) => row[field] === (cond as any)?._eq)
  }

  async function dx(path: string, options: any = {}) {
    calls.push({ path, options })

    if (!options.method || options.method === 'GET') {
      const filtered = rows.filter((row) => matches(row, options.query?.filter))
      const limited = options.query?.limit ? filtered.slice(0, options.query.limit) : filtered
      return { data: limited }
    }

    if (options.method === 'POST') {
      const body = JSON.parse(options.body)
      const created = { id: String(nextId++), ...body }
      rows.push(created)
      return { data: created }
    }

    throw new Error(`createFakeDirectus: unhandled method ${options.method}`)
  }

  return { dx, rows, calls }
}

beforeEach(() => {
  clearRulesPackageCache()
  directusServiceRequestMock.mockReset()
})

describe('loadPackageSource', () => {
  it('loads manifest.json and definitions.json from the default package directory', () => {
    const { manifest, definitions } = loadPackageSource(DEFAULT_PACKAGE_DIR)
    expect(manifest.packageId).toBe('eldra.starter.generic-d20')
    expect(Array.isArray(definitions)).toBe(true)
    expect(definitions.length).toBeGreaterThan(0)
  })
})

describe('hydrateExpressions', () => {
  it('parses a bare { text } node into { text, ast }', () => {
    const hydrated = hydrateExpressions({ text: '1 + 1' }, parseExpression)
    expect(hydrated.text).toBe('1 + 1')
    expect(hydrated.ast).toBeDefined()
    expect(hydrated.ast.kind).toBe('binary')
  })

  it('is idempotent -- a node that already has ast is left untouched', () => {
    const already = { text: '1 + 1', ast: { kind: 'literal', valueType: 'number', value: 2 } }
    const hydrated = hydrateExpressions(already, parseExpression)
    expect(hydrated).toEqual(already)
  })

  it('recurses through arrays and nested objects', () => {
    const input = { a: [{ text: '1' }, { b: { text: '2' } }] }
    const hydrated = hydrateExpressions(input, parseExpression)
    expect(hydrated.a[0].ast).toBeDefined()
    expect(hydrated.a[1].b.ast).toBeDefined()
  })

  it('throws a PublishAbortError for an unparseable expression', () => {
    expect(() => hydrateExpressions({ text: '1 +' }, parseExpression)).toThrow(PublishAbortError)
  })

  it('leaves non-expression scalar fields untouched', () => {
    const input = { key: 'name', valueType: 'text' }
    expect(hydrateExpressions(input, parseExpression)).toEqual(input)
  })
})

describe('the starter package validates', () => {
  it('validatePackage() reports ok:true with zero issues', () => {
    const { validation } = loadAndValidatePackage(DEFAULT_PACKAGE_DIR, deps)
    expect(validation.issues).toEqual([])
    expect(validation.ok).toBe(true)
  })

  it('contains every definition kind the commit requires', () => {
    const { definitions } = loadAndValidatePackage(DEFAULT_PACKAGE_DIR, deps)
    const kinds = definitions.map((d: any) => d.kind).sort()
    expect(kinds).toEqual(['collection', 'roll', 'roll', 'source', 'value', 'value', 'value', 'value'])
    expect(definitions.map((d: any) => d.id)).toEqual(
      expect.arrayContaining(['value:level', 'value:vitality', 'value:proficiency_bonus', 'roll:check', 'roll:luck'])
    )
  })

  it('declares both required semantic roles, one requiredTrait, one optionalRule', () => {
    const { manifest } = loadAndValidatePackage(DEFAULT_PACKAGE_DIR, deps)
    expect(manifest.semanticRoles).toEqual({ vitality: 'value:vitality', level: 'value:level' })
    expect(manifest.requiredTraits).toHaveLength(1)
    expect(manifest.optionalRules).toHaveLength(1)
    expect(manifest.rollTypes.map((r: any) => r.id).sort()).toEqual(['check', 'luck'])
  })
})

describe('buildPublishRow', () => {
  it('forces status to published regardless of the source manifest', () => {
    const { manifest, definitions } = loadAndValidatePackage(DEFAULT_PACKAGE_DIR, deps)
    expect(manifest.status).toBe('draft') // authored source state
    const row = buildPublishRow(manifest, definitions, deps)
    expect(row.status).toBe('published')
    expect(row.manifest.status).toBe('published')
  })

  it('stores integrity computed over the definitions, matching computeIntegrityHash', () => {
    const { manifest, definitions } = loadAndValidatePackage(DEFAULT_PACKAGE_DIR, deps)
    const row = buildPublishRow(manifest, definitions, deps)
    expect(row.integrity_hash).toBe(computeIntegrityHash(definitions))
    expect(row.manifest.integrity).toBe(row.integrity_hash)
  })
})

describe('publishStarterPackage -- publish succeeds', () => {
  it('inserts exactly one published row when none exists yet', async () => {
    const { dx, rows, calls } = createFakeDirectus()

    const result = await publishStarterPackage({ dx, deps })

    expect(result.row.package_id).toBe('eldra.starter.generic-d20')
    expect(result.row.status).toBe('published')
    expect(rows).toHaveLength(1)
    expect(calls.some((c) => c.options.method === 'POST')).toBe(true)
  })

  it('stores the computed integrity hash on the inserted row', async () => {
    const { dx, rows } = createFakeDirectus()
    const result = await publishStarterPackage({ dx, deps })

    expect(rows[0].integrity_hash).toBe(result.row.integrity_hash)
    expect(rows[0].integrity_hash).toMatch(/^sha256-[0-9a-f]{64}$/)
  })
})

describe('publishStarterPackage -- duplicate publish rejected', () => {
  it('aborts without inserting a second row when a published version already exists', async () => {
    const existing = {
      id: '1',
      package_id: 'eldra.starter.generic-d20',
      version: '0.1.0',
      status: 'published'
    }
    const { dx, rows, calls } = createFakeDirectus([existing])

    await expect(publishStarterPackage({ dx, deps })).rejects.toThrow(PublishAbortError)

    expect(rows).toHaveLength(1) // unchanged -- nothing appended
    expect(calls.some((c) => c.options.method === 'POST')).toBe(false) // never attempted a write
  })
})

describe('publishStarterPackage -- validation abort', () => {
  it('never calls Directus at all when validation fails', async () => {
    const brokenDeps = {
      ...deps,
      validatePackage: () => ({
        ok: false,
        issues: [{ severity: 'error', code: 'fake-error', message: 'forced failure for this test' }]
      })
    }
    const { dx, calls } = createFakeDirectus()

    await expect(publishStarterPackage({ dx, deps: brokenDeps })).rejects.toThrow(PublishAbortError)
    expect(calls).toHaveLength(0)
  })
})

describe('the published package reloads through loadPublishedPackage()', () => {
  it('round-trips: publish, then load the same row back through the real loader', async () => {
    const { dx } = createFakeDirectus()
    const { created } = await publishStarterPackage({ dx, deps })

    directusServiceRequestMock.mockResolvedValueOnce({ data: [created.data] })

    const loaded = await loadPublishedPackage('eldra.starter.generic-d20', '0.1.0')

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.package.packageId).toBe('eldra.starter.generic-d20')
    expect(loaded.package.version).toBe('0.1.0')
    expect(loaded.package.definitions).toHaveLength(8)
    expect(loaded.package.manifest.title).toBe('Eldra Generic d20 (Starter)')
  })

  it('the reloaded package is ready for createWorldRuntime -- manifest/definitions round-trip untouched', async () => {
    const { dx } = createFakeDirectus()
    const { row, created } = await publishStarterPackage({ dx, deps })

    directusServiceRequestMock.mockResolvedValueOnce({ data: [created.data] })
    const loaded = await loadPublishedPackage('eldra.starter.generic-d20', '0.1.0')

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.package.manifest).toEqual(row.manifest)
    expect(loaded.package.definitions).toEqual(row.definitions)
  })
})
