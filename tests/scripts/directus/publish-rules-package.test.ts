// Unit tests for scripts/directus/publish-rules-package.mjs -- the general
// Rules Package publication pipeline (Author -> Validate -> Publish).
//
// The real engine functions run: `parseExpression`, `validatePackage`, and
// `computeIntegrityHash` are imported normally and injected as `deps`,
// exactly as publish-rules-package.mjs's own header describes. Only Directus
// is faked. The two REAL authored packages under packages/ are published --
// no fixture package is invented, because "eldra-dnd5e-2024 publishes
// without modifying its authored contents" is the compatibility claim under
// test, and a fixture would not test it.
//
// tests/scripts/directus/publish-starter-package.test.ts is deliberately left
// untouched and still passes: it exercises the same logic through the
// compatibility wrapper, which is the point of that wrapper.

import { describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { parseExpression } from '../../../app/lib/rules/parser'
import { validatePackage } from '../../../app/lib/rules/package-validation'
import { computeIntegrityHash } from '../../../server/utils/rules-packages'
import {
  PublishAbortError,
  STARTER_PACKAGE_DIR,
  buildPublishRow,
  formatAuthoredPackages,
  listAuthoredPackages,
  loadAndValidatePackage,
  publishRulesPackage,
  resolvePackageDir
  // @ts-expect-error -- plain .mjs, no type declarations
} from '../../../scripts/directus/publish-rules-package.mjs'

const deps = { parseExpression, validatePackage, computeIntegrityHash }

const STARTER_ID = 'eldra.starter.generic-d20'
const DND5E_ID = 'eldra.rules.dnd5e-2024'

// Same in-memory Directus stand-in shape publish-starter-package.test.ts
// uses: a GET with an `{ _and: [{ field: { _eq } }] }` filter, and a POST.
function createFakeDirectus(initialRows: any[] = []) {
  const rows: any[] = [...initialRows]
  let nextId = 1

  function matches(row: any, filter: any): boolean {
    if (!filter) return true
    if (filter._and) return filter._and.every((clause: any) => matches(row, clause))
    return Object.entries(filter).every(([field, cond]) => row[field] === (cond as any)?._eq)
  }

  async function dx(path: string, options: any = {}) {
    if (!options.method || options.method === 'GET') {
      const filtered = rows.filter((row) => matches(row, options.query?.filter))
      return { data: options.query?.limit ? filtered.slice(0, options.query.limit) : filtered }
    }
    if (options.method === 'POST') {
      const created = { id: String(nextId++), ...JSON.parse(options.body) }
      rows.push(created)
      return { data: created }
    }
    throw new Error(`unhandled method ${options.method}`)
  }

  return { dx, rows }
}

describe('package discovery', () => {
  it('finds every authored package under packages/, reading only its manifest', () => {
    const found = listAuthoredPackages()
    const ids = found.map((entry: any) => entry.packageId)

    expect(ids).toContain(STARTER_ID)
    expect(ids).toContain(DND5E_ID)
  })

  it('reports id, version and title for each, so --list can teach what is publishable', () => {
    const dnd5e = listAuthoredPackages().find((entry: any) => entry.packageId === DND5E_ID)

    expect(dnd5e).toMatchObject({
      dirName: 'eldra-dnd5e-2024',
      packageId: DND5E_ID,
      version: '0.1.0'
    })
    expect(dnd5e.title).toBeTruthy()
    expect(formatAuthoredPackages(listAuthoredPackages())).toContain('eldra-dnd5e-2024')
  })
})

describe('package selection', () => {
  it('resolves a directory name', () => {
    expect(resolvePackageDir('eldra-dnd5e-2024')).toMatch(/packages\/eldra-dnd5e-2024$/)
  })

  it('resolves a packageId', () => {
    expect(resolvePackageDir(DND5E_ID)).toMatch(/packages\/eldra-dnd5e-2024$/)
  })

  it('resolves a path', () => {
    expect(resolvePackageDir('packages/eldra-generic-d20')).toBe(STARTER_PACKAGE_DIR)
  })

  it('refuses an unknown selector and lists what is available instead of failing bare', () => {
    expect(() => resolvePackageDir('not-a-package')).toThrow(PublishAbortError)
    expect(() => resolvePackageDir('not-a-package')).toThrow(/eldra-dnd5e-2024/)
  })

  it('refuses an empty selector with the same guidance', () => {
    expect(() => resolvePackageDir('')).toThrow(/No package specified/)
    expect(() => resolvePackageDir('')).toThrow(/eldra-generic-d20/)
  })
})

describe('both authored packages validate exactly as authored', () => {
  // The compatibility requirement, tested against the real files: publishing
  // eldra-dnd5e-2024 must not require editing its contents.
  it.each([
    ['eldra-generic-d20', STARTER_ID],
    ['eldra-dnd5e-2024', DND5E_ID]
  ])('%s validates with zero errors', (dirName, packageId) => {
    const { manifest, validation } = loadAndValidatePackage(resolvePackageDir(dirName), deps)

    expect(manifest.packageId).toBe(packageId)
    expect(validation.issues.filter((issue: any) => issue.severity === 'error')).toEqual([])
    expect(validation.ok).toBe(true)
  })
})

describe('publishing', () => {
  it.each([
    ['eldra-generic-d20', STARTER_ID],
    ['eldra-dnd5e-2024', DND5E_ID]
  ])('publishes %s as exactly one row with a computed integrity hash', async (dirName, packageId) => {
    const directus = createFakeDirectus()

    const { row } = await publishRulesPackage({
      packageDir: resolvePackageDir(dirName),
      dx: directus.dx,
      deps
    })

    expect(directus.rows).toHaveLength(1)
    expect(row.package_id).toBe(packageId)
    expect(row.status).toBe('published')
    expect(row.integrity_hash).toMatch(/^sha256-[0-9a-f]{64}$/)
    // Integrity covers the HYDRATED definitions actually stored on the row.
    expect(row.integrity_hash).toBe(computeIntegrityHash(row.definitions))
  })

  it('forces status published even though both packages are authored as draft', async () => {
    const directus = createFakeDirectus()
    const { row } = await publishRulesPackage({ packageDir: resolvePackageDir(DND5E_ID), dx: directus.dx, deps })

    expect(row.status).toBe('published')
    expect(row.manifest.status).toBe('published')
    expect(row.manifest.integrity).toBe(row.integrity_hash)
  })

  it('the two packages publish independently and coexist as separate rows', async () => {
    const directus = createFakeDirectus()

    await publishRulesPackage({ packageDir: resolvePackageDir('eldra-generic-d20'), dx: directus.dx, deps })
    await publishRulesPackage({ packageDir: resolvePackageDir('eldra-dnd5e-2024'), dx: directus.dx, deps })

    expect(directus.rows.map((row: any) => row.package_id).sort()).toEqual([DND5E_ID, STARTER_ID].sort())
    expect(new Set(directus.rows.map((row: any) => row.integrity_hash)).size).toBe(2)
  })

  it('carries the authored license id onto the row', async () => {
    const directus = createFakeDirectus()
    const { row } = await publishRulesPackage({ packageDir: resolvePackageDir(DND5E_ID), dx: directus.dx, deps })

    expect(row.license_id).toBe('CC-BY-4.0')
  })
})

describe('versioning -- published releases are immutable', () => {
  it('refuses a duplicate (package_id, version) rather than overwriting', async () => {
    const directus = createFakeDirectus()
    await publishRulesPackage({ packageDir: resolvePackageDir(DND5E_ID), dx: directus.dx, deps })

    await expect(
      publishRulesPackage({ packageDir: resolvePackageDir(DND5E_ID), dx: directus.dx, deps })
    ).rejects.toThrow(PublishAbortError)

    expect(directus.rows).toHaveLength(1)
  })

  it('the refusal teaches the fix -- bump version, which inserts a sibling row', async () => {
    const directus = createFakeDirectus()
    await publishRulesPackage({ packageDir: resolvePackageDir(DND5E_ID), dx: directus.dx, deps })

    await expect(
      publishRulesPackage({ packageDir: resolvePackageDir(DND5E_ID), dx: directus.dx, deps })
    ).rejects.toThrow(/bump "version"/)
  })

  it('a different version of the same packageId publishes alongside the existing one', async () => {
    // Simulates the author bumping manifest.version: same package_id, new
    // version, both rows retained so existing world pins keep resolving.
    const directus = createFakeDirectus()
    const { manifest, definitions } = loadAndValidatePackage(resolvePackageDir(DND5E_ID), deps)

    const first = buildPublishRow(manifest, definitions, deps)
    await directus.dx('/items/rules_packages', { method: 'POST', body: JSON.stringify(first) })

    const bumped = buildPublishRow({ ...manifest, version: '0.2.0' }, definitions, deps)
    await directus.dx('/items/rules_packages', { method: 'POST', body: JSON.stringify(bumped) })

    expect(directus.rows).toHaveLength(2)
    expect(directus.rows.map((row: any) => row.version).sort()).toEqual(['0.1.0', '0.2.0'])
    expect(new Set(directus.rows.map((row: any) => row.package_id)).size).toBe(1)
  })

  it('never issues a PATCH or DELETE against rules_packages', async () => {
    const methods: string[] = []
    const directus = createFakeDirectus()
    const spy = async (path: string, options: any = {}) => {
      methods.push(options.method || 'GET')
      return directus.dx(path, options)
    }

    await publishRulesPackage({ packageDir: resolvePackageDir(DND5E_ID), dx: spy, deps })

    expect(methods).not.toContain('PATCH')
    expect(methods).not.toContain('DELETE')
    expect(methods.filter((method) => method === 'POST')).toHaveLength(1)
  })
})

describe('validation is the publish gate', () => {
  it('aborts without writing a row when validation reports an error', async () => {
    const directus = createFakeDirectus()
    const failing = {
      ...deps,
      validatePackage: () => ({
        ok: false,
        issues: [{ severity: 'error', code: 'broken', message: 'deliberately invalid', definitionId: 'x' }]
      })
    }

    await expect(
      publishRulesPackage({ packageDir: STARTER_PACKAGE_DIR, dx: directus.dx, deps: failing })
    ).rejects.toThrow(/deliberately invalid/)

    expect(directus.rows).toHaveLength(0)
  })
})
