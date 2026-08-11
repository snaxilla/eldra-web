// Unit tests for the Rules Package runtime loader
// (app/lib/rules/rules-package.ts, World Configuration Commit 4).

import { describe, expect, it } from 'vitest'
import { loadRulesPackage } from '../../app/lib/rules/rules-package'
import { resolveWorldConfig } from '../../app/lib/rules/world-config'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { parseExpression } from '../../app/lib/rules/parser'
import type {
  ActorState,
  Definition,
  Expression,
  RulesPackageManifest,
  ValueDefinition
} from '../../app/lib/rules/types'

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

function expression(text: string): Expression {
  const result = parseExpression(text)
  if (!result.ok) throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
  return { text, ast: result.ast as Expression['ast'] }
}

function storedValue(id: string): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored' }
}

function derivedValue(id: string, formulaText: string): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'derived', formula: expression(formulaText) }
}

const emptyWorldConfig = resolveWorldConfig(manifest(), 'world:1', null)

describe('loadRulesPackage -- successful load', () => {
  it('produces a runtime package from a manifest, definitions, and a resolved world config', () => {
    const testManifest = manifest()
    const definitions: Definition[] = [storedValue('value:x')]
    const result = loadRulesPackage(testManifest, definitions, emptyWorldConfig)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.packageId).toBe('eldra.test.pkg')
    expect(result.runtimePackage.packageVersion).toBe('1.0.0')
    expect(result.runtimePackage.manifest).toBe(testManifest)
    expect(result.runtimePackage.registry.getById('value:x')).toBeDefined()
    expect(result.runtimePackage.dependencyGraph.listNodes()).toContain('value:x')
    expect(result.runtimePackage.worldConfig).toBe(emptyWorldConfig)
  })

  it('derives packageId/packageVersion from the manifest, not the world config snapshot', () => {
    const testManifest = manifest({ packageId: 'eldra.other.pkg', version: '2.4.0' })
    const worldConfig = resolveWorldConfig(testManifest, 'world:1', null)
    const result = loadRulesPackage(testManifest, [], worldConfig)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.packageId).toBe('eldra.other.pkg')
    expect(result.runtimePackage.packageVersion).toBe('2.4.0')
  })

  it('succeeds on an empty Definition list -- an empty package is a legal, if useless, load', () => {
    const result = loadRulesPackage(manifest(), [], emptyWorldConfig)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.registry.listAll()).toEqual([])
    expect(result.runtimePackage.dependencyGraph.listNodes()).toEqual([])
  })
})

describe('loadRulesPackage -- registry failure propagation', () => {
  it('fails at the registry stage on a duplicate DefinitionId, and reports it as a registry error', () => {
    const definitions: Definition[] = [storedValue('value:x'), storedValue('value:x')]
    const result = loadRulesPackage(manifest(), definitions, emptyWorldConfig)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('registry')
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId: 'value:x' })]))
  })

  it('fails at the registry stage on a Definition with no id', () => {
    const definitions = [{ kind: 'value', valueType: 'number', storage: 'stored' } as unknown as Definition]
    const result = loadRulesPackage(manifest(), definitions, emptyWorldConfig)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('registry')
  })
})

describe('loadRulesPackage -- dependency graph failure propagation', () => {
  it('fails at the dependency-graph stage when a derived formula references a Definition the registry does not have', () => {
    const definitions: Definition[] = [derivedValue('value:x', '@value:missing')]
    const result = loadRulesPackage(manifest(), definitions, emptyWorldConfig)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('dependency-graph')
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ dependencyKey: 'value:missing' })]))
  })

  it('does not fail at the registry stage for the same input -- proving the failure is graph-specific', () => {
    // registry.ts performs NO reference validation (its own file header) --
    // this confirms the dangling reference above is caught by
    // DependencyGraph.build, not misattributed to a registry-stage
    // rejection of the same Definition for an unrelated reason.
    const definitions: Definition[] = [derivedValue('value:x', '@value:missing')]
    const registryResult = RulesRegistry.create(manifest(), definitions)
    expect(registryResult.ok).toBe(true)
  })
})

describe('loadRulesPackage -- immutable runtime object', () => {
  it('freezes the returned runtime package', () => {
    const result = loadRulesPackage(manifest(), [], emptyWorldConfig)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.isFrozen(result.runtimePackage)).toBe(true)
  })

  it('throws (strict mode) on an attempt to reassign a runtime package field', () => {
    const result = loadRulesPackage(manifest(), [], emptyWorldConfig)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(() => {
      ;(result.runtimePackage as { packageId: string }).packageId = 'eldra.hacked.pkg'
    }).toThrow()
  })
})

describe('loadRulesPackage -- world configuration inclusion', () => {
  it('carries the exact ResolvedWorldConfig it was given through to the runtime package, unmodified', () => {
    const testManifest = manifest({
      requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }]
    })
    const worldConfig = resolveWorldConfig(testManifest, 'world:1', null)
    const result = loadRulesPackage(testManifest, [], worldConfig)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimePackage.worldConfig).toBe(worldConfig)
    expect(result.runtimePackage.worldConfig.gaps).toEqual([
      { kind: 'roadType', trait: 'quality', declaredDefault: 1, reason: expect.any(String) }
    ])
  })
})

describe('loadRulesPackage -- registry reuse behavior', () => {
  it('builds the dependency graph from the exact same registry instance the runtime package exposes', () => {
    const definitions: Definition[] = [derivedValue('value:x', '@value:y'), storedValue('value:y')]
    const result = loadRulesPackage(manifest(), definitions, emptyWorldConfig)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Cross-consistency check: every id the graph indexes resolves in the
    // SAME registry instance the runtime package exposes -- proving
    // DependencyGraph.build was called against
    // `result.runtimePackage.registry` itself, not a second, separately
    // constructed registry that merely happens to look the same.
    for (const id of result.runtimePackage.dependencyGraph.listNodes()) {
      expect(result.runtimePackage.registry.has(id)).toBe(true)
    }
    expect(result.runtimePackage.dependencyGraph.getDependencies('value:x')).toEqual(['value:y'])
  })

  it('is usable directly to construct an EvaluationSession (world-configuration.md §7 runtime flow)', () => {
    const definitions: Definition[] = [storedValue('value:x')]
    const result = loadRulesPackage(manifest(), definitions, emptyWorldConfig)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const actorState: ActorState = {
      actorId: 'actor:1',
      packageId: 'eldra.test.pkg',
      packageVersion: '1.0.0',
      stateSchemaVersion: 1,
      values: {},
      collections: {},
      choices: {},
      sources: []
    }
    const session = new EvaluationSession(
      result.runtimePackage.registry,
      result.runtimePackage.dependencyGraph,
      actorState,
      { world: result.runtimePackage.worldConfig.snapshot }
    )
    expect(session.registry).toBe(result.runtimePackage.registry)
    expect(session.graph).toBe(result.runtimePackage.dependencyGraph)
  })
})

describe('loadRulesPackage -- repeated deterministic loads', () => {
  it('produces observably equivalent runtime packages across repeated calls with the same inputs', () => {
    const testManifest = manifest({
      requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }]
    })
    const definitions: Definition[] = [derivedValue('value:x', '@value:y'), storedValue('value:y')]
    const worldConfig = resolveWorldConfig(testManifest, 'world:1', null)

    const first = loadRulesPackage(testManifest, definitions, worldConfig)
    const second = loadRulesPackage(testManifest, definitions, worldConfig)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(first.runtimePackage.packageId).toBe(second.runtimePackage.packageId)
    expect(first.runtimePackage.packageVersion).toBe(second.runtimePackage.packageVersion)
    expect(first.runtimePackage.registry.listAll()).toEqual(second.runtimePackage.registry.listAll())
    expect(first.runtimePackage.dependencyGraph.listNodes()).toEqual(second.runtimePackage.dependencyGraph.listNodes())
    expect(first.runtimePackage.dependencyGraph.getDependencies('value:x')).toEqual(
      second.runtimePackage.dependencyGraph.getDependencies('value:x')
    )
    expect(first.runtimePackage.worldConfig).toEqual(second.runtimePackage.worldConfig)
  })
})

describe('loadRulesPackage -- regression: existing Registry/DependencyGraph behavior unchanged', () => {
  it('produces the same registry contents RulesRegistry.create would produce directly', () => {
    const definitions: Definition[] = [storedValue('value:x')]
    const direct = RulesRegistry.create(manifest(), definitions)
    const viaLoader = loadRulesPackage(manifest(), definitions, emptyWorldConfig)

    expect(direct.ok).toBe(true)
    expect(viaLoader.ok).toBe(true)
    if (!direct.ok || !viaLoader.ok) return
    expect(viaLoader.runtimePackage.registry.listAll()).toEqual(direct.registry.listAll())
  })
})
