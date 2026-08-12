// Unit tests for World Rules Activation
// (server/utils/world-rules-activation.ts, Infrastructure Commit 7).
//
// loadWorldRulesConfig/saveWorldRulesConfig (./world-rules-config) and
// loadPublishedPackage (./rules-packages) are mocked directly, backed by a
// small stateful in-memory store that mirrors the real persistence
// module's already-tested semantics (world-rules-config.test.ts) --
// closely enough that activateWorldRulesPackage's internal second call to
// getWorldRuntime (which re-reads the config it just wrote) sees genuinely
// updated state, not a stale mock. createWorldRuntime and everything
// beneath it (resolveWorldConfig, RulesRegistry, DependencyGraph) are the
// REAL, unmocked engine, exercised with Infra 4's real starter package.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadWorldRulesConfigMock, saveWorldRulesConfigMock, loadPublishedPackageMock } = vi.hoisted(() => ({
  loadWorldRulesConfigMock: vi.fn(),
  saveWorldRulesConfigMock: vi.fn(),
  loadPublishedPackageMock: vi.fn()
}))

vi.mock('../../../server/utils/world-rules-config', () => ({
  loadWorldRulesConfig: loadWorldRulesConfigMock,
  saveWorldRulesConfig: saveWorldRulesConfigMock
}))

vi.mock('../../../server/utils/rules-packages', () => ({
  loadPublishedPackage: loadPublishedPackageMock
}))

import { activateWorldRulesPackage, updateWorldRulesConfig } from '../../../server/utils/world-rules-activation'
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

function starterPackageLoadResult(overrides: Partial<RulesPackageManifest> = {}) {
  const { manifest, definitions } = loadStarterPackageContent()
  const merged = { ...manifest, ...overrides }
  return {
    ok: true as const,
    package: { packageId: merged.packageId, version: merged.version, manifest: merged, definitions, integrityHash: 'sha256-abc' }
  }
}

// A minimal, stateful stand-in for world-rules-config.ts's own persistence,
// mirroring its already-tested semantics (world-rules-config.test.ts):
// creating a row with neither activePackageId nor activePackageVersion
// throws; every save increments worldConfigVersion; omitted fields keep
// their stored value.
function createFakeConfigStore(initial: Record<string, WorldRulesConfigRecord> = {}) {
  const store: Record<string, WorldRulesConfigRecord> = { ...initial }

  loadWorldRulesConfigMock.mockImplementation(async (worldId: string | number) => {
    return store[String(worldId)] ?? null
  })

  saveWorldRulesConfigMock.mockImplementation(async (worldId: string | number, patch: any) => {
    const key = String(worldId)
    const existing = store[key]

    if (!existing && (patch.activePackageId === undefined || patch.activePackageVersion === undefined)) {
      throw new Error(
        'saveWorldRulesConfig: creating a new world_rules_config row requires both activePackageId and activePackageVersion'
      )
    }

    const updated: WorldRulesConfigRecord = {
      worldId: key,
      activePackageId: patch.activePackageId ?? existing?.activePackageId,
      activePackageVersion: patch.activePackageVersion ?? existing?.activePackageVersion,
      activePackageIntegrity:
        patch.activePackageIntegrity !== undefined ? patch.activePackageIntegrity : (existing?.activePackageIntegrity ?? null),
      worldConfigVersion: existing ? existing.worldConfigVersion + 1 : 1,
      settings: patch.settings ?? existing?.settings ?? {},
      rollTypes: patch.rollTypes ?? existing?.rollTypes ?? {}
    }

    store[key] = updated
    return updated
  })

  return store
}

beforeEach(() => {
  loadWorldRulesConfigMock.mockReset()
  saveWorldRulesConfigMock.mockReset()
  loadPublishedPackageMock.mockReset()
})

describe('activateWorldRulesPackage -- activate a published package', () => {
  it('binds the World, returns activated:true with a ready summary', async () => {
    createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    expect(result.activated).toBe(true)
    if (!result.activated) throw new Error('expected activation to succeed')
    expect(result.summary.configured).toBe(true)
    if (!('packageId' in result.summary)) throw new Error('expected a ready summary')
    expect(result.summary.packageId).toBe('eldra.starter.generic-d20')
    expect(result.summary.packageVersion).toBe('0.1.0')
  })

  it('persists activePackageId/Version/Integrity via saveWorldRulesConfig', async () => {
    const store = createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    expect(store['1'].activePackageId).toBe('eldra.starter.generic-d20')
    expect(store['1'].activePackageVersion).toBe('0.1.0')
    expect(store['1'].activePackageIntegrity).toBe('sha256-abc')
  })
})

describe('activateWorldRulesPackage -- rejections write nothing', () => {
  it('rejects a missing package', async () => {
    const store = createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValueOnce({ ok: false, stage: 'not-found', packageId: 'eldra.missing', version: '1.0.0' })

    const result = await activateWorldRulesPackage(1, 'eldra.missing', '1.0.0')

    expect(result.activated).toBe(false)
    if (result.activated) throw new Error('expected rejection')
    expect(result.stage).toBe('package-load')
    expect(result.failure).toEqual({ stage: 'not-found', packageId: 'eldra.missing', version: '1.0.0' })
    expect(saveWorldRulesConfigMock).not.toHaveBeenCalled()
    expect(store['1']).toBeUndefined()
  })

  it('rejects a draft package', async () => {
    createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValueOnce({ ok: false, stage: 'not-published', status: 'draft' })

    const result = await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    expect(result.activated).toBe(false)
    if (result.activated) throw new Error('expected rejection')
    expect(result.failure).toEqual({ stage: 'not-published', status: 'draft' })
    expect(saveWorldRulesConfigMock).not.toHaveBeenCalled()
  })

  it('rejects an engine-incompatible package', async () => {
    createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: false,
      stage: 'engine-incompatible',
      declaredRange: '^2.0.0',
      engineVersion: '1.0.0'
    })

    const result = await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    expect(result.activated).toBe(false)
    if (result.activated) throw new Error('expected rejection')
    expect(result.failure).toEqual({ stage: 'engine-incompatible', declaredRange: '^2.0.0', engineVersion: '1.0.0' })
    expect(saveWorldRulesConfigMock).not.toHaveBeenCalled()
  })

  it('rejects an integrity mismatch', async () => {
    createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: false,
      stage: 'integrity-mismatch',
      expected: 'sha256-aaa',
      computed: 'sha256-bbb'
    })

    const result = await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    expect(result.activated).toBe(false)
    if (result.activated) throw new Error('expected rejection')
    expect(result.failure).toEqual({ stage: 'integrity-mismatch', expected: 'sha256-aaa', computed: 'sha256-bbb' })
    expect(saveWorldRulesConfigMock).not.toHaveBeenCalled()
  })
})

describe('activateWorldRulesPackage -- version increment', () => {
  it('a first activation starts world_config_version at 1', async () => {
    const store = createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    expect(store['1'].worldConfigVersion).toBe(1)
  })
})

describe('activateWorldRulesPackage -- repeated activation', () => {
  it('activating twice succeeds both times and increments the version each time', async () => {
    const store = createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const first = await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')
    const second = await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    expect(first.activated).toBe(true)
    expect(second.activated).toBe(true)
    expect(store['1'].worldConfigVersion).toBe(2)
  })

  it('re-activating with a different version switches the World, unrestricted in V1', async () => {
    const store = createFakeConfigStore()

    // Each activation internally calls loadPublishedPackage twice (once
    // directly, once again inside getWorldRuntime's own re-read) -- use a
    // persistent default per activation, not a one-shot queue, so both
    // internal calls within one activation see the same package.
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())
    await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult({ version: '0.2.0' }))
    const second = await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.2.0')

    expect(second.activated).toBe(true)
    expect(store['1'].activePackageVersion).toBe('0.2.0')
    expect(store['1'].worldConfigVersion).toBe(2)
  })
})

describe('updateWorldRulesConfig -- config patch', () => {
  it('updates settings on an already-activated World', async () => {
    const store = createFakeConfigStore({
      '1': {
        worldId: '1',
        activePackageId: 'eldra.starter.generic-d20',
        activePackageVersion: '0.1.0',
        activePackageIntegrity: 'sha256-abc',
        worldConfigVersion: 1,
        settings: {},
        rollTypes: {}
      }
    })
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await updateWorldRulesConfig(1, { settings: { campaign: { difficulty: 15 } } })

    expect(result.updated).toBe(true)
    expect(store['1'].settings).toEqual({ campaign: { difficulty: 15 } })
    expect(store['1'].activePackageId).toBe('eldra.starter.generic-d20') // untouched
  })

  it('updates rollTypes on an already-activated World', async () => {
    const store = createFakeConfigStore({
      '1': {
        worldId: '1',
        activePackageId: 'eldra.starter.generic-d20',
        activePackageVersion: '0.1.0',
        activePackageIntegrity: 'sha256-abc',
        worldConfigVersion: 1,
        settings: {},
        rollTypes: {}
      }
    })
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await updateWorldRulesConfig(1, { rollTypes: { luck: { enabled: false } } })

    expect(result.updated).toBe(true)
    expect(store['1'].rollTypes).toEqual({ luck: { enabled: false } })
  })

  it('rejects an update when the World has no configuration yet -- never silently activates', async () => {
    const store = createFakeConfigStore()

    const result = await updateWorldRulesConfig(1, { settings: { campaign: { difficulty: 15 } } })

    expect(result.updated).toBe(false)
    if (result.updated) throw new Error('expected rejection')
    expect(result.stage).toBe('unconfigured')
    expect(saveWorldRulesConfigMock).not.toHaveBeenCalled()
    expect(store['1']).toBeUndefined()
  })

  it('increments world_config_version on every successful patch', async () => {
    const store = createFakeConfigStore({
      '1': {
        worldId: '1',
        activePackageId: 'eldra.starter.generic-d20',
        activePackageVersion: '0.1.0',
        activePackageIntegrity: 'sha256-abc',
        worldConfigVersion: 4,
        settings: {},
        rollTypes: {}
      }
    })
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    await updateWorldRulesConfig(1, { settings: { campaign: { difficulty: 12 } } })

    expect(store['1'].worldConfigVersion).toBe(5)
  })
})

describe('runtime summary after activation', () => {
  it('the summary returned by activation reflects the real, freshly-resolved runtime', async () => {
    createFakeConfigStore()
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await activateWorldRulesPackage(1, 'eldra.starter.generic-d20', '0.1.0')

    if (!result.activated || !('rollTypes' in result.summary)) throw new Error('expected a ready summary')
    expect(result.summary.rollTypes.map((r) => r.id).sort()).toEqual(['check', 'luck'])
    expect(result.summary.issues).toEqual([])
  })
})
