// Unit tests for World Package activation
// (app/lib/rules/world-runtime.ts, World Configuration Commit 5).

import { describe, expect, it } from 'vitest'
import { createWorldRuntime } from '../../app/lib/rules/world-runtime'
import { resolveWorldConfig } from '../../app/lib/rules/world-config'
import { loadRulesPackage } from '../../app/lib/rules/rules-package'
import { parseExpression } from '../../app/lib/rules/parser'
import type { Definition, Expression, RulesPackageManifest, StoredWorldRulesConfig, ValueDefinition } from '../../app/lib/rules/types'

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

function storedConfig(overrides: Partial<StoredWorldRulesConfig> = {}): StoredWorldRulesConfig {
  return {
    worldId: 'world:1',
    activePackageId: 'eldra.test.pkg',
    activePackageVersion: '1.0.0',
    worldConfigVersion: 1,
    settings: {},
    rollTypes: {},
    ...overrides
  }
}

function storedValue(id: string): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored' }
}

function expression(text: string): Expression {
  const result = parseExpression(text)
  if (!result.ok) throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
  return { text, ast: result.ast as Expression['ast'] }
}

function derivedValue(id: string, formulaText: string): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'derived', formula: expression(formulaText) }
}

describe('createWorldRuntime -- successful orchestration', () => {
  it('produces a ready-to-use RuntimeRulesPackage from a manifest, definitions, worldId, and stored: null', () => {
    const testManifest = manifest()
    const definitions: Definition[] = [storedValue('value:x')]
    const result = createWorldRuntime(testManifest, definitions, 'world:1', null)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.packageId).toBe('eldra.test.pkg')
    expect(result.runtimePackage.packageVersion).toBe('1.0.0')
    expect(result.runtimePackage.manifest).toBe(testManifest)
    expect(result.runtimePackage.registry.getById('value:x')).toBeDefined()
    expect(result.runtimePackage.dependencyGraph.listNodes()).toContain('value:x')
    expect(result.runtimePackage.worldConfig.snapshot.worldId).toBe('world:1')
  })
})

describe('createWorldRuntime -- world with defaults', () => {
  it('resolves a declared requiredTrait to its package default when the World has no stored config', () => {
    const testManifest = manifest({
      requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }]
    })
    const result = createWorldRuntime(testManifest, [], 'world:1', null)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.worldConfig.snapshot.traits.roadType?.quality).toBe(1)
  })
})

describe('createWorldRuntime -- world with overrides', () => {
  it('uses the World-supplied value instead of the package default', () => {
    const testManifest = manifest({
      requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }]
    })
    const stored = storedConfig({ settings: { roadType: { quality: 4 } } })
    const result = createWorldRuntime(testManifest, [], 'world:1', stored)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.worldConfig.snapshot.traits.roadType?.quality).toBe(4)
    expect(result.runtimePackage.worldConfig.gaps).toEqual([])
  })

  it('applies a World roll-type override end to end', () => {
    const testManifest = manifest({
      rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] }]
    })
    const stored = storedConfig({ rollTypes: { luck: { enabled: false } } })
    const result = createWorldRuntime(testManifest, [], 'world:1', stored)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.worldConfig.rollTypes).toEqual([])
  })
})

describe('createWorldRuntime -- world with Binding Gaps', () => {
  it('surfaces a Binding Gap on the activated runtime package when a requiredTrait is unsupplied', () => {
    const testManifest = manifest({
      requiredTraits: [{ kind: 'calendar', trait: 'currentSeason', valueType: 'text', default: 'spring' }]
    })
    const result = createWorldRuntime(testManifest, [], 'world:1', null)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.worldConfig.gaps).toEqual([
      { kind: 'calendar', trait: 'currentSeason', declaredDefault: 'spring', reason: expect.any(String) }
    ])
  })
})

describe('createWorldRuntime -- loader failure propagation', () => {
  it('propagates a registry-stage failure unchanged', () => {
    const definitions: Definition[] = [storedValue('value:x'), storedValue('value:x')]
    const result = createWorldRuntime(manifest(), definitions, 'world:1', null)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('registry')
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId: 'value:x' })]))
  })

  it('propagates a dependency-graph-stage failure unchanged', () => {
    const definitions: Definition[] = [derivedValue('value:x', '@value:missing')]
    const result = createWorldRuntime(manifest(), definitions, 'world:1', null)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('dependency-graph')
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ dependencyKey: 'value:missing' })]))
  })

  it('does not produce a Binding Gap or roll-type composition detour on failure -- the failure short-circuits before any of that would matter', () => {
    const definitions: Definition[] = [storedValue('value:x'), storedValue('value:x')]
    const testManifest = manifest({ requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }] })
    const result = createWorldRuntime(testManifest, definitions, 'world:1', null)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect('runtimePackage' in result).toBe(false)
  })
})

describe('createWorldRuntime -- deterministic repeated activation', () => {
  it('produces observably equivalent runtime packages across repeated calls with the same inputs', () => {
    const testManifest = manifest({
      requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }],
      rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] }]
    })
    const definitions: Definition[] = [storedValue('value:x')]
    const stored = storedConfig({ settings: { roadType: { quality: 4 } }, rollTypes: { luck: { order: 2 } } })

    const first = createWorldRuntime(testManifest, definitions, 'world:1', stored)
    const second = createWorldRuntime(testManifest, definitions, 'world:1', stored)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(first.runtimePackage.packageId).toBe(second.runtimePackage.packageId)
    expect(first.runtimePackage.registry.listAll()).toEqual(second.runtimePackage.registry.listAll())
    expect(first.runtimePackage.dependencyGraph.listNodes()).toEqual(second.runtimePackage.dependencyGraph.listNodes())
    expect(first.runtimePackage.worldConfig).toEqual(second.runtimePackage.worldConfig)
  })
})

describe('createWorldRuntime -- immutable returned runtime package', () => {
  it('freezes the returned runtime package', () => {
    const result = createWorldRuntime(manifest(), [], 'world:1', null)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.isFrozen(result.runtimePackage)).toBe(true)
  })

  it('throws (strict mode) on an attempt to reassign a runtime package field', () => {
    const result = createWorldRuntime(manifest(), [], 'world:1', null)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(() => {
      ;(result.runtimePackage as { packageId: string }).packageId = 'eldra.hacked.pkg'
    }).toThrow()
  })
})

describe('createWorldRuntime -- regression: resolveWorldConfig and loadRulesPackage remain unchanged', () => {
  it('produces the exact same result as calling resolveWorldConfig then loadRulesPackage by hand', () => {
    const testManifest = manifest({
      requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }]
    })
    const definitions: Definition[] = [storedValue('value:x')]
    const stored = storedConfig({ settings: { roadType: { quality: 9 } } })

    const viaOrchestration = createWorldRuntime(testManifest, definitions, 'world:1', stored)
    const worldConfig = resolveWorldConfig(testManifest, 'world:1', stored)
    const viaManualComposition = loadRulesPackage(testManifest, definitions, worldConfig)

    expect(viaOrchestration.ok).toBe(true)
    expect(viaManualComposition.ok).toBe(true)
    if (!viaOrchestration.ok || !viaManualComposition.ok) return
    expect(viaOrchestration.runtimePackage.worldConfig).toEqual(viaManualComposition.runtimePackage.worldConfig)
    expect(viaOrchestration.runtimePackage.registry.listAll()).toEqual(viaManualComposition.runtimePackage.registry.listAll())
  })
})
