// Unit tests for the World Runtime Assembly Service
// (server/utils/world-runtime-service.ts, Infrastructure Commit 6).
//
// loadWorldRulesConfig/loadPublishedPackage are mocked directly (not at
// the ./directus boundary) so these tests exercise getWorldRuntime's OWN
// composition logic in isolation -- the two loaders already have their own
// full test suites (tests/server/utils/world-rules-config.test.ts,
// tests/server/utils/rules-packages.test.ts). createWorldRuntime and
// everything beneath it (resolveWorldConfig, RulesRegistry,
// DependencyGraph) are the REAL, unmocked engine -- this is deliberately
// the first place the whole stack actually runs together, using Infra 4's
// real starter package content for the "ready" path.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadWorldRulesConfigMock, loadPublishedPackageMock } = vi.hoisted(() => ({
  loadWorldRulesConfigMock: vi.fn(),
  loadPublishedPackageMock: vi.fn()
}))

vi.mock('../../../server/utils/world-rules-config', () => ({
  loadWorldRulesConfig: loadWorldRulesConfigMock
}))

vi.mock('../../../server/utils/rules-packages', () => ({
  loadPublishedPackage: loadPublishedPackageMock
}))

import { getWorldRuntime, summarizeWorldRuntime } from '../../../server/utils/world-runtime-service'
import type { WorldRulesConfigRecord } from '../../../server/utils/world-rules-config'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import manifestSource from '../../../packages/eldra-generic-d20/manifest.json'
import definitionsSource from '../../../packages/eldra-generic-d20/definitions.json'
// @ts-expect-error -- plain .mjs, no type declarations
import { hydrateExpressions } from '../../../scripts/directus/publish-starter-package.mjs'

function loadStarterPackageContent(): { manifest: RulesPackageManifest; definitions: Definition[] } {
  const manifest = hydrateExpressions({ ...manifestSource, status: 'published' }, parseExpression)
  const definitions = hydrateExpressions(definitionsSource, parseExpression)
  return { manifest, definitions }
}

function minimalManifest(overrides: Partial<RulesPackageManifest> = {}): RulesPackageManifest {
  return {
    packageId: 'eldra.test.broken',
    version: '1.0.0',
    status: 'published',
    engineApiVersion: '^1.0.0',
    stateSchemaVersion: 1,
    title: 'Broken Test Package',
    license: { id: 'CC0-1.0' },
    capabilities: [],
    dependencies: [],
    ...overrides
  }
}

function storedConfig(overrides: Partial<WorldRulesConfigRecord> = {}): WorldRulesConfigRecord {
  return {
    worldId: '1',
    activePackageId: 'eldra.starter.generic-d20',
    activePackageVersion: '0.1.0',
    activePackageIntegrity: 'sha256-abc',
    worldConfigVersion: 1,
    settings: { campaign: { difficulty: 15 } },
    rollTypes: {},
    ...overrides
  }
}

beforeEach(() => {
  loadWorldRulesConfigMock.mockReset()
  loadPublishedPackageMock.mockReset()
})

describe('getWorldRuntime -- unconfigured', () => {
  it('returns { configured: false } when no world_rules_config row exists', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(null)

    const result = await getWorldRuntime(1)

    expect(result).toEqual({ configured: false })
  })

  it('never calls loadPublishedPackage when unconfigured -- short-circuits', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(null)

    await getWorldRuntime(1)

    expect(loadPublishedPackageMock).not.toHaveBeenCalled()
  })
})

// Blocker fix regression coverage: getWorldRuntime must not paper over a
// world-config ACCESS failure by reporting it as { configured: false }.
// loadWorldRulesConfig now throws (rather than returning null) when
// Directus itself is unreachable/unrecognized (world-rules-config.ts's
// findRawRow) -- this proves getWorldRuntime lets that distinction survive
// rather than treating every rejection the same as "no row."
describe('getWorldRuntime -- world-config access failure is never read as unconfigured', () => {
  it('propagates a loadWorldRulesConfig rejection rather than returning { configured: false }', async () => {
    const accessError = Object.assign(new Error('World Rules Configuration is unavailable'), { statusCode: 502 })
    loadWorldRulesConfigMock.mockRejectedValueOnce(accessError)

    await expect(getWorldRuntime(1)).rejects.toThrow('World Rules Configuration is unavailable')
  })

  it('never calls loadPublishedPackage when the config read itself failed', async () => {
    const accessError = Object.assign(new Error('World Rules Configuration is unavailable'), { statusCode: 502 })
    loadWorldRulesConfigMock.mockRejectedValueOnce(accessError)

    await expect(getWorldRuntime(1)).rejects.toThrow()
    expect(loadPublishedPackageMock).not.toHaveBeenCalled()
  })
})

describe('getWorldRuntime -- configured and ready', () => {
  it('assembles a real runtime from the real starter package', async () => {
    const { manifest, definitions } = loadStarterPackageContent()
    loadWorldRulesConfigMock.mockResolvedValue(storedConfig())
    loadPublishedPackageMock.mockResolvedValue({
      ok: true,
      package: { packageId: manifest.packageId, version: manifest.version, manifest, definitions, integrityHash: 'sha256-abc' }
    })

    const result = await getWorldRuntime(1)

    expect(result.configured).toBe(true)
    if (!result.configured || !result.ok) throw new Error('expected ready result')
    expect(result.runtime.packageId).toBe('eldra.starter.generic-d20')
    expect(result.runtime.packageVersion).toBe('0.1.0')
    expect(result.runtime.registry.has('value:vitality')).toBe(true)
    expect(result.runtime.worldConfig.rollTypes.map((r) => r.id).sort()).toEqual(['check', 'luck'])
    expect(result.runtime.worldConfig.issues).toEqual([])
    expect(result.integrityHash).toBe('sha256-abc')
  })

  it('passes stored.worldId (not the raw call argument) through to createWorldRuntime', async () => {
    const { manifest, definitions } = loadStarterPackageContent()
    loadWorldRulesConfigMock.mockResolvedValue(storedConfig({ worldId: '999' }))
    loadPublishedPackageMock.mockResolvedValue({
      ok: true,
      package: { packageId: manifest.packageId, version: manifest.version, manifest, definitions, integrityHash: 'sha256-abc' }
    })

    const result = await getWorldRuntime(1) // deliberately different from stored.worldId

    if (!result.configured || !result.ok) throw new Error('expected ready result')
    expect(result.runtime.worldConfig.snapshot.worldId).toBe('999')
  })
})

describe('getWorldRuntime -- configured but broken: package loader failure', () => {
  it('reports stage "package-load" with the loader\'s own failure verbatim, distinct from unconfigured', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: false,
      stage: 'not-found',
      packageId: 'eldra.starter.generic-d20',
      version: '0.1.0'
    })

    const result = await getWorldRuntime(1)

    expect(result.configured).toBe(true) // NEVER collapses to unconfigured
    if (!result.configured || result.ok) throw new Error('expected broken result')
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('package-load')
    expect(result.failure).toEqual({ stage: 'not-found', packageId: 'eldra.starter.generic-d20', version: '0.1.0' })
  })

  it('propagates an integrity-mismatch failure the same way', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: false,
      stage: 'integrity-mismatch',
      expected: 'sha256-aaa',
      computed: 'sha256-bbb'
    })

    const result = await getWorldRuntime(1)

    if (!result.configured || result.ok) throw new Error('expected broken result')
    expect(result.stage).toBe('package-load')
    expect(result.failure).toEqual({ stage: 'integrity-mismatch', expected: 'sha256-aaa', computed: 'sha256-bbb' })
  })
})

describe('getWorldRuntime -- configured but broken: runtime creation failure', () => {
  it('reports stage "runtime-construction" when the package itself is malformed (duplicate DefinitionIds)', async () => {
    const manifest = minimalManifest()
    const definitions: Definition[] = [
      { id: 'value:x', kind: 'value', valueType: 'number', storage: 'stored' },
      { id: 'value:x', kind: 'value', valueType: 'number', storage: 'stored' }
    ]

    loadWorldRulesConfigMock.mockResolvedValueOnce(
      storedConfig({ activePackageId: manifest.packageId, activePackageVersion: manifest.version, settings: {} })
    )
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: true,
      package: { packageId: manifest.packageId, version: manifest.version, manifest, definitions, integrityHash: 'sha256-x' }
    })

    const result = await getWorldRuntime(1)

    expect(result.configured).toBe(true)
    if (!result.configured || result.ok) throw new Error('expected broken result')
    expect(result.stage).toBe('runtime-construction')
    expect((result.failure as any).stage).toBe('registry')
    expect((result.failure as any).errors.length).toBeGreaterThan(0)
  })
})

describe('getWorldRuntime -- deterministic repeated requests', () => {
  it('the same inputs produce structurally identical results across repeated calls', async () => {
    const { manifest, definitions } = loadStarterPackageContent()
    loadWorldRulesConfigMock.mockResolvedValue(storedConfig())
    loadPublishedPackageMock.mockResolvedValue({
      ok: true,
      package: { packageId: manifest.packageId, version: manifest.version, manifest, definitions, integrityHash: 'sha256-abc' }
    })

    const first = await getWorldRuntime(1)
    const second = await getWorldRuntime(1)

    if (!first.configured || !first.ok || !second.configured || !second.ok) {
      throw new Error('expected ready results')
    }
    expect(second.runtime.packageId).toBe(first.runtime.packageId)
    expect(second.runtime.worldConfig.rollTypes).toEqual(first.runtime.worldConfig.rollTypes)
    expect(second.runtime.worldConfig.issues).toEqual(first.runtime.worldConfig.issues)
  })
})

describe('summarizeWorldRuntime -- serialization', () => {
  it('unconfigured serializes to exactly { configured: false }', () => {
    const summary = summarizeWorldRuntime({ configured: false })
    expect(summary).toEqual({ configured: false })
    expect(Object.keys(summary)).toEqual(['configured'])
  })

  it('a broken result passes through configured/ok/stage/failure unchanged', () => {
    const summary = summarizeWorldRuntime({
      configured: true,
      ok: false,
      stage: 'package-load',
      failure: { stage: 'not-found', packageId: 'eldra.x', version: '1.0.0' }
    })

    expect(summary).toEqual({
      configured: true,
      ok: false,
      stage: 'package-load',
      failure: { stage: 'not-found', packageId: 'eldra.x', version: '1.0.0' }
    })
  })

  it('a ready result exposes exactly the documented fields, nothing more', async () => {
    const { manifest, definitions } = loadStarterPackageContent()
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: true,
      package: { packageId: manifest.packageId, version: manifest.version, manifest, definitions, integrityHash: 'sha256-abc' }
    })

    const result = await getWorldRuntime(1)
    const summary = summarizeWorldRuntime(result)

    expect(Object.keys(summary).sort()).toEqual(
      ['bindingGaps', 'configured', 'integrityHash', 'issues', 'packageId', 'packageVersion', 'rollTypes', 'unboundRecommendedRoles'].sort()
    )
    expect((summary as any).packageId).toBe('eldra.starter.generic-d20')
    expect((summary as any).packageVersion).toBe('0.1.0')
    expect((summary as any).integrityHash).toBe('sha256-abc')
    expect((summary as any).rollTypes.map((r: any) => r.id).sort()).toEqual(['check', 'luck'])
  })
})

describe('summarizeWorldRuntime -- no internals leak', () => {
  async function summarizeReadyStarterPackage() {
    const { manifest, definitions } = loadStarterPackageContent()
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: true,
      package: { packageId: manifest.packageId, version: manifest.version, manifest, definitions, integrityHash: 'sha256-abc' }
    })
    const result = await getWorldRuntime(1)
    return summarizeWorldRuntime(result)
  }

  it('never exposes a registry, dependencyGraph, manifest, definitions, or runtime key', async () => {
    const summary: any = await summarizeReadyStarterPackage()

    expect(summary).not.toHaveProperty('registry')
    expect(summary).not.toHaveProperty('dependencyGraph')
    expect(summary).not.toHaveProperty('manifest')
    expect(summary).not.toHaveProperty('definitions')
    expect(summary).not.toHaveProperty('runtime')
  })

  it('survives a JSON round-trip with no class instances or circular structures', async () => {
    const summary = await summarizeReadyStarterPackage()

    // RulesRegistry/DependencyGraph instances are not JSON-serializable in
    // a way that would round-trip to plain data -- if either leaked into
    // the summary, this would either throw or produce `{}` for that key.
    const roundTripped = JSON.parse(JSON.stringify(summary))
    expect(roundTripped).toEqual(summary)
  })
})
