// Unit tests for World Roll Execution
// (server/utils/world-rules-roll.ts, Infrastructure Commit 10).
//
// loadWorldRulesConfig (./world-rules-config) and loadPublishedPackage
// (./rules-packages) are mocked directly, matching world-rules-activation.test.ts's
// own established pattern. createWorldRuntime, requestRoll, and everything
// beneath them (resolveWorldConfig, RulesRegistry, DependencyGraph, the
// Evaluator, the Roll Engine) are the REAL, unmodified engine, exercised
// against Infra 4's real starter package -- this task's own "requestRoll
// reused" and "Rules Engine unchanged" regression requirements are only
// meaningful if the real Roll Service is actually the thing under test.

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

import { requestWorldRoll } from '../../../server/utils/world-rules-roll'
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

function storedConfig(overrides: Partial<WorldRulesConfigRecord> = {}): WorldRulesConfigRecord {
  return {
    worldId: '1',
    activePackageId: 'eldra.starter.generic-d20',
    activePackageVersion: '0.1.0',
    activePackageIntegrity: 'sha256-abc',
    worldConfigVersion: 1,
    settings: {},
    rollTypes: {},
    ...overrides
  }
}

beforeEach(() => {
  loadWorldRulesConfigMock.mockReset()
  loadPublishedPackageMock.mockReset()
})

describe('requestWorldRoll -- successful rolls', () => {
  it('executes the check roll type end to end', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'check' })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected a roll event')
    expect(result.event.ok).toBe(true)
    if (!result.event.ok) throw new Error('expected a successful roll')
    expect(result.event.rollSpecId).toBe('roll:check')
    expect(result.event.result.rolls).toHaveLength(1)
    expect(typeof result.event.result.total).toBe('number')
  })

  it('executes the luck roll type end to end', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected a roll event')
    expect(result.event.ok).toBe(true)
    if (!result.event.ok) throw new Error('expected a successful roll')
    expect(result.event.rollSpecId).toBe('roll:luck')
  })

  it("resolves @world:campaign.difficulty for the check roll's success threshold", async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig({ settings: { campaign: { difficulty: 1 } } }))
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'check' })

    if (!result.ok || !result.event.ok) throw new Error('expected a successful roll')
    // Threshold 1 with a 1d20 roll (minimum possible result 1) always succeeds.
    expect(result.event.result.success).toBe(true)
  })
})

describe('requestWorldRoll -- unknown roll type', () => {
  it('rejects a roll type the package never declared', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'nonexistent' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.failure).toEqual({ stage: 'unknown-roll-type', rollType: 'nonexistent' })
  })

  it('rejects a roll type the World has disabled -- resolved list, not raw declarations', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig({ rollTypes: { luck: { enabled: false } } }))
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.failure).toEqual({ stage: 'unknown-roll-type', rollType: 'luck' })
  })
})

describe('requestWorldRoll -- unconfigured world', () => {
  it('rejects when the World has no world_rules_config row', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(null)

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.failure).toEqual({ stage: 'unconfigured' })
    expect(loadPublishedPackageMock).not.toHaveBeenCalled()
  })
})

describe('requestWorldRoll -- configured but broken world', () => {
  it('rejects when the active package fails to load, distinct from unconfigured', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: false,
      stage: 'not-found',
      packageId: 'eldra.starter.generic-d20',
      version: '0.1.0'
    })

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.failure).toEqual({
      stage: 'package-load',
      failure: { stage: 'not-found', packageId: 'eldra.starter.generic-d20', version: '0.1.0' }
    })
  })

  it('rejects when runtime construction fails (malformed package content), never fabricating a roll', async () => {
    const manifest: RulesPackageManifest = {
      packageId: 'eldra.test.broken',
      version: '1.0.0',
      status: 'published',
      engineApiVersion: '^1.0.0',
      stateSchemaVersion: 1,
      title: 'Broken Test Package',
      license: { id: 'CC0-1.0' },
      capabilities: [],
      dependencies: [],
      rollTypes: [{ id: 'luck', label: 'Luck', rollSpec: 'roll:luck', surfaces: ['sheet'] }]
    }
    const definitions: Definition[] = [
      { id: 'value:x', kind: 'value', valueType: 'number', storage: 'stored' },
      { id: 'value:x', kind: 'value', valueType: 'number', storage: 'stored' } // duplicate id -> registry failure
    ]

    loadWorldRulesConfigMock.mockResolvedValueOnce(
      storedConfig({ activePackageId: manifest.packageId, activePackageVersion: manifest.version })
    )
    loadPublishedPackageMock.mockResolvedValueOnce({
      ok: true,
      package: { packageId: manifest.packageId, version: manifest.version, manifest, definitions, integrityHash: 'sha256-x' }
    })

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.failure.stage).toBe('runtime-construction')
  })
})

describe('requestWorldRoll -- seed generation', () => {
  it('every successful roll carries a non-empty, server-generated seed', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    if (!result.ok || !result.event.ok) throw new Error('expected a successful roll')
    expect(typeof result.event.seed).toBe('string')
    expect(result.event.seed.length).toBeGreaterThanOrEqual(32) // 16 bytes, hex-encoded
    expect(result.event.result.seed).toBe(result.event.seed)
  })

  it('two separate requests get two different seeds -- genuine randomness, not a fixed value', async () => {
    loadWorldRulesConfigMock.mockResolvedValue(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const first = await requestWorldRoll(1, { rollType: 'luck' })
    const second = await requestWorldRoll(1, { rollType: 'luck' })

    if (!first.ok || !first.event.ok || !second.ok || !second.event.ok) throw new Error('expected successful rolls')
    expect(first.event.seed).not.toBe(second.event.seed)
  })

  it('the seed is valid hexadecimal -- node:crypto randomBytes, not Math.random()', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    if (!result.ok || !result.event.ok) throw new Error('expected a successful roll')
    expect(result.event.seed).toMatch(/^[0-9a-f]+$/)
  })
})

describe('requestWorldRoll -- RollEvent returned unchanged', () => {
  it("the eventId matches roll-service.ts's own deriveEventId format exactly", async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'luck', actorId: 'entity:42' })

    if (!result.ok || !result.event.ok) throw new Error('expected a successful roll')
    expect(result.event.eventId).toBe(`roll-event:entity:42:roll:luck:${result.event.seed}`)
    expect(result.event.actorId).toBe('entity:42')
  })

  it('uses a placeholder actorId when none is supplied, never throwing', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    if (!result.ok) throw new Error('expected a roll event')
    expect(result.event.actorId).toBe('anonymous')
  })
})

describe('requestWorldRoll -- requestRoll reused, not duplicated', () => {
  it('produces the exact RollResult shape roll-engine.ts computes -- rolls/kept/total/rerolls all present', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'luck' })

    if (!result.ok || !result.event.ok) throw new Error('expected a successful roll')
    expect(result.event.result).toEqual(
      expect.objectContaining({
        rollSpecId: 'roll:luck',
        manual: false,
        rolls: expect.any(Array),
        rerolls: expect.any(Array),
        kept: expect.any(Array),
        keptIndices: expect.any(Array),
        total: expect.any(Number)
      })
    )
  })

  it('accepts purpose/tags without throwing or dropping the roll (forwarded into the underlying EvaluationContext)', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    // Not directly observable on RollEvent (context is never echoed back --
    // OUTPUT: "Do not decorate"); this only proves the field is accepted
    // and does not break the request.
    const result = await requestWorldRoll(1, { rollType: 'luck', context: { purpose: 'Initiative', tags: ['combat'] } })

    expect(result.ok).toBe(true)
  })
})

describe('requestWorldRoll -- regression: Rules Engine unchanged', () => {
  it('roll:check (which reads @value:/@world:) still validates and executes correctly', async () => {
    loadWorldRulesConfigMock.mockResolvedValueOnce(storedConfig())
    loadPublishedPackageMock.mockResolvedValue(starterPackageLoadResult())

    const result = await requestWorldRoll(1, { rollType: 'check' })

    if (!result.ok || !result.event.ok) throw new Error('expected a successful roll')
    expect(result.event.result.dice).toBeDefined()
  })
})
