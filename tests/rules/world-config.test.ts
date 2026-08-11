// Unit tests for World Configuration lookup and resolution
// (app/lib/rules/world-config.ts). The first half of this file (unchanged
// from Commit 1) asserts on parseWorldTraitPath/lookupWorldTrait. The
// second half (Commit 3) asserts on resolveWorldConfig. Per this commit's
// scope, world config LOADING (Directus), package activation, actor state,
// and Game Admin are still not exercised here -- none of them exists yet.

import { describe, expect, it } from 'vitest'
import { lookupWorldTrait, parseWorldTraitPath, resolveWorldConfig } from '../../app/lib/rules/world-config'
import { evaluate } from '../../app/lib/rules/evaluator'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type {
  ActorState,
  Expression,
  RulesPackageManifest,
  StoredWorldRulesConfig,
  ValueDefinition,
  WorldConfigSnapshot
} from '../../app/lib/rules/types'

function snapshot(traits: WorldConfigSnapshot['traits'] = {}): WorldConfigSnapshot {
  return {
    worldId: 'world:1',
    packageId: 'eldra.test.pkg',
    packageVersion: '1.0.0',
    worldConfigVersion: 1,
    traits
  }
}

describe('parseWorldTraitPath -- two-segment arity (world-configuration.md §F.2)', () => {
  it('splits a two-segment path into kind and key', () => {
    expect(parseWorldTraitPath('rules.flanking')).toEqual({ kind: 'rules', key: 'flanking' })
  })

  it('accepts a non-reserved kind, since kinds are world vocabulary not engine vocabulary', () => {
    expect(parseWorldTraitPath('calendar.currentSeason')).toEqual({ kind: 'calendar', key: 'currentSeason' })
  })

  it("accepts the architecture's own §19.2 example", () => {
    expect(parseWorldTraitPath('roadType.quality')).toEqual({ kind: 'roadType', key: 'quality' })
  })

  it('rejects a one-segment path -- it carries no kind, so it names no slot', () => {
    expect(parseWorldTraitPath('restVariant')).toBeUndefined()
  })

  it('rejects a three-segment path -- the data model has no such nesting depth', () => {
    expect(parseWorldTraitPath('a.b.c')).toBeUndefined()
  })

  it('rejects a bare @world reference (no path at all)', () => {
    expect(parseWorldTraitPath(undefined)).toBeUndefined()
  })

  it('rejects an empty path', () => {
    expect(parseWorldTraitPath('')).toBeUndefined()
  })

  it('rejects two segments where the kind is empty', () => {
    expect(parseWorldTraitPath('.flanking')).toBeUndefined()
  })

  it('rejects two segments where the key is empty', () => {
    expect(parseWorldTraitPath('rules.')).toBeUndefined()
  })

  it('never throws on malformed input', () => {
    expect(() => parseWorldTraitPath('....')).not.toThrow()
    expect(parseWorldTraitPath('....')).toBeUndefined()
  })
})

describe('lookupWorldTrait -- existing traits', () => {
  it('returns a boolean trait', () => {
    const config = snapshot({ rules: { flanking: true } })
    expect(lookupWorldTrait(config, 'rules', 'flanking')).toBe(true)
  })

  it('returns a number trait', () => {
    const config = snapshot({ roadType: { quality: 4 } })
    expect(lookupWorldTrait(config, 'roadType', 'quality')).toBe(4)
  })

  it('returns a text trait', () => {
    const config = snapshot({ calendar: { currentSeason: 'winter' } })
    expect(lookupWorldTrait(config, 'calendar', 'currentSeason')).toBe('winter')
  })

  it('returns a falsy scalar rather than treating it as absent', () => {
    const config = snapshot({ rules: { flanking: false, bonus: 0, label: '' } })
    expect(lookupWorldTrait(config, 'rules', 'flanking')).toBe(false)
    expect(lookupWorldTrait(config, 'rules', 'bonus')).toBe(0)
    expect(lookupWorldTrait(config, 'rules', 'label')).toBe('')
  })

  it('keeps kinds independent -- the same key under two kinds resolves separately', () => {
    const config = snapshot({ rules: { quality: 1 }, roadType: { quality: 4 } })
    expect(lookupWorldTrait(config, 'rules', 'quality')).toBe(1)
    expect(lookupWorldTrait(config, 'roadType', 'quality')).toBe(4)
  })
})

describe('lookupWorldTrait -- missing traits', () => {
  it('returns undefined when the kind is absent', () => {
    const config = snapshot({ rules: { flanking: true } })
    expect(lookupWorldTrait(config, 'calendar', 'currentSeason')).toBeUndefined()
  })

  it('returns undefined when the kind exists but the key does not', () => {
    const config = snapshot({ rules: { flanking: true } })
    expect(lookupWorldTrait(config, 'rules', 'grittyRest')).toBeUndefined()
  })

  it('returns undefined for an entirely empty snapshot', () => {
    expect(lookupWorldTrait(snapshot(), 'rules', 'flanking')).toBeUndefined()
  })

  it('never invents a default, a zero, or a false for an absent trait', () => {
    const result = lookupWorldTrait(snapshot({ rules: {} }), 'rules', 'flanking')
    expect(result).toBeUndefined()
    expect(result).not.toBe(false)
    expect(result).not.toBe(0)
  })

  it('does not throw for any missing lookup', () => {
    expect(() => lookupWorldTrait(snapshot(), 'nope', 'nope')).not.toThrow()
  })
})

describe('lookupWorldTrait -- prototype-chain safety', () => {
  // `traits` and its inner records are keyed by author-supplied strings, so
  // a reference like `@world:constructor.x` must not resolve up the
  // prototype chain and hand back a Function.
  it('does not resolve an inherited Object.prototype member as a kind', () => {
    expect(lookupWorldTrait(snapshot(), 'constructor', 'name')).toBeUndefined()
    expect(lookupWorldTrait(snapshot(), 'toString', 'x')).toBeUndefined()
  })

  it('does not resolve an inherited Object.prototype member as a key', () => {
    const config = snapshot({ rules: { flanking: true } })
    expect(lookupWorldTrait(config, 'rules', 'toString')).toBeUndefined()
    expect(lookupWorldTrait(config, 'rules', 'hasOwnProperty')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// resolveWorldConfig -- World Configuration Commit 3
// ---------------------------------------------------------------------------

function manifest(overrides: Partial<RulesPackageManifest> = {}): RulesPackageManifest {
  return {
    packageId: 'eldra.test.pkg',
    version: '1.0.0',
    status: 'draft',
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

describe('resolveWorldConfig -- snapshot construction', () => {
  it('resolves an empty world config (stored: null) to an empty-but-valid snapshot', () => {
    const result = resolveWorldConfig(manifest(), 'world:1', null)
    expect(result.snapshot).toEqual({
      worldId: 'world:1',
      packageId: 'eldra.test.pkg',
      packageVersion: '1.0.0',
      worldConfigVersion: 0,
      traits: {}
    })
    expect(result.gaps).toEqual([])
    expect(result.rollTypes).toEqual([])
  })

  it('resolves an empty-but-present StoredWorldRulesConfig identically to null', () => {
    const withNull = resolveWorldConfig(manifest(), 'world:1', null)
    const withEmpty = resolveWorldConfig(manifest(), 'world:1', storedConfig({ worldConfigVersion: 0 }))
    expect(withEmpty.snapshot.traits).toEqual(withNull.snapshot.traits)
    expect(withEmpty.gaps).toEqual(withNull.gaps)
    expect(withEmpty.rollTypes).toEqual(withNull.rollTypes)
  })

  it('takes packageId/packageVersion from the manifest, and worldConfigVersion from stored', () => {
    const result = resolveWorldConfig(manifest({ packageId: 'eldra.custom.pkg', version: '2.4.0' }), 'world:9', storedConfig({ worldConfigVersion: 7 }))
    expect(result.snapshot.packageId).toBe('eldra.custom.pkg')
    expect(result.snapshot.packageVersion).toBe('2.4.0')
    expect(result.snapshot.worldConfigVersion).toBe(7)
    expect(result.snapshot.worldId).toBe('world:9')
  })
})

describe('resolveWorldConfig -- requiredTrait defaults and Binding Gaps', () => {
  it('uses the declared default when the World supplies nothing, and records a Binding Gap', () => {
    const result = resolveWorldConfig(
      manifest({ requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }] }),
      'world:1',
      null
    )
    expect(lookupWorldTrait(result.snapshot, 'roadType', 'quality')).toBe(1)
    expect(result.gaps).toEqual([
      { kind: 'roadType', trait: 'quality', declaredDefault: 1, reason: expect.any(String) }
    ])
  })

  it('uses a supplied value instead of the default, and records no Binding Gap', () => {
    const result = resolveWorldConfig(
      manifest({ requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }] }),
      'world:1',
      storedConfig({ settings: { roadType: { quality: 4 } } })
    )
    expect(lookupWorldTrait(result.snapshot, 'roadType', 'quality')).toBe(4)
    expect(result.gaps).toEqual([])
  })

  it('produces one Binding Gap per unsupplied requiredTrait, independently', () => {
    const result = resolveWorldConfig(
      manifest({
        requiredTraits: [
          { kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 },
          { kind: 'calendar', trait: 'currentSeason', valueType: 'text', default: 'spring' }
        ]
      }),
      'world:1',
      storedConfig({ settings: { roadType: { quality: 4 } } })
    )
    expect(result.gaps).toEqual([
      { kind: 'calendar', trait: 'currentSeason', declaredDefault: 'spring', reason: expect.any(String) }
    ])
    expect(lookupWorldTrait(result.snapshot, 'roadType', 'quality')).toBe(4)
    expect(lookupWorldTrait(result.snapshot, 'calendar', 'currentSeason')).toBe('spring')
  })
})

describe('resolveWorldConfig -- optional rules (kind "rules", no Binding Gap)', () => {
  it('uses the declared default when the World supplies nothing, and records no Binding Gap', () => {
    const result = resolveWorldConfig(
      manifest({ optionalRules: [{ key: 'flanking', label: 'Flanking', valueType: 'boolean', default: false }] }),
      'world:1',
      null
    )
    expect(lookupWorldTrait(result.snapshot, 'rules', 'flanking')).toBe(false)
    expect(result.gaps).toEqual([])
  })

  it('uses a supplied value instead of the default', () => {
    const result = resolveWorldConfig(
      manifest({ optionalRules: [{ key: 'flanking', label: 'Flanking', valueType: 'boolean', default: false }] }),
      'world:1',
      storedConfig({ settings: { rules: { flanking: true } } })
    )
    expect(lookupWorldTrait(result.snapshot, 'rules', 'flanking')).toBe(true)
    expect(result.gaps).toEqual([])
  })
})

describe('resolveWorldConfig -- immutable snapshots', () => {
  it('freezes the snapshot, its traits record, and every per-kind inner record', () => {
    const result = resolveWorldConfig(
      manifest({ requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }] }),
      'world:1',
      null
    )
    expect(Object.isFrozen(result.snapshot)).toBe(true)
    expect(Object.isFrozen(result.snapshot.traits)).toBe(true)
    expect(Object.isFrozen(result.snapshot.traits.roadType)).toBe(true)
  })

  it('throws (strict mode) on an attempt to mutate a resolved trait', () => {
    const result = resolveWorldConfig(
      manifest({ requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }] }),
      'world:1',
      null
    )
    expect(() => {
      ;(result.snapshot.traits.roadType as { quality: number }).quality = 999
    }).toThrow()
  })

  it('freezes the top-level ResolvedWorldConfig and its array fields', () => {
    const result = resolveWorldConfig(manifest(), 'world:1', null)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.gaps)).toBe(true)
    expect(Object.isFrozen(result.rollTypes)).toBe(true)
    expect(Object.isFrozen(result.unboundRecommendedRoles)).toBe(true)
  })
})

describe('resolveWorldConfig -- roll type composition', () => {
  it('includes a declared roll type with no override at all', () => {
    const result = resolveWorldConfig(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] }] }),
      'world:1',
      null
    )
    expect(result.rollTypes).toEqual([
      { id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'], visibility: undefined, order: 0 }
    ])
  })

  it('drops a roll type the World disabled', () => {
    const result = resolveWorldConfig(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] }] }),
      'world:1',
      storedConfig({ rollTypes: { luck: { enabled: false } } })
    )
    expect(result.rollTypes).toEqual([])
  })

  it('reorders roll types by the World override order, falling back to declaration order/index', () => {
    const result = resolveWorldConfig(
      manifest({
        rollTypes: [
          { id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] },
          { id: 'morale', label: 'Morale Check', rollSpec: 'roll:morale', surfaces: ['sheet'] }
        ]
      }),
      'world:1',
      storedConfig({ rollTypes: { morale: { order: 0 }, luck: { order: 1 } } })
    )
    expect(result.rollTypes.map((rollType) => rollType.id)).toEqual(['morale', 'luck'])
  })

  it('rebinds a roll type to a different package-declared rollSpec', () => {
    const result = resolveWorldConfig(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] }] }),
      'world:1',
      storedConfig({ rollTypes: { luck: { rollSpec: 'roll:luck.variant' } } })
    )
    expect(result.rollTypes[0]?.rollSpec).toBe('roll:luck.variant')
  })

  it('overrides the default broadcast visibility', () => {
    const result = resolveWorldConfig(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'], visibility: 'public' }] }),
      'world:1',
      storedConfig({ rollTypes: { luck: { visibility: 'gm' } } })
    )
    expect(result.rollTypes[0]?.visibility).toBe('gm')
  })

  it('falls back to the declaration visibility when the World does not override it', () => {
    const result = resolveWorldConfig(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'], visibility: 'public' }] }),
      'world:1',
      storedConfig({ rollTypes: { luck: { order: 5 } } })
    )
    expect(result.rollTypes[0]?.visibility).toBe('public')
  })

  it('warns, without creating a roll type, when a World overrides an id the package no longer declares', () => {
    const result = resolveWorldConfig(manifest(), 'world:1', storedConfig({ rollTypes: { staleRollType: { enabled: true } } }))
    expect(result.rollTypes).toEqual([])
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'undeclared-world-roll-type-override' })
    )
  })

  it('never mutates the package manifest it was given', () => {
    const rollTypesDeclaration = [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet' as const] }]
    const testManifest = manifest({ rollTypes: rollTypesDeclaration })
    resolveWorldConfig(testManifest, 'world:1', storedConfig({ rollTypes: { luck: { enabled: false, order: 99, rollSpec: 'roll:other', visibility: 'gm' } } }))
    expect(testManifest.rollTypes).toEqual([{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] }])
  })
})

describe('resolveWorldConfig -- unbound recommended semantic role detection', () => {
  it('reports every recommended role as unbound when the manifest binds none', () => {
    const result = resolveWorldConfig(manifest(), 'world:1', null)
    expect(result.unboundRecommendedRoles).toEqual(expect.arrayContaining(['vitality', 'level', 'identity.name']))
    expect(result.unboundRecommendedRoles).toHaveLength(3)
  })

  it('excludes a recommended role once the manifest binds it', () => {
    const result = resolveWorldConfig(manifest({ semanticRoles: { vitality: 'value:hp' } }), 'world:1', null)
    expect(result.unboundRecommendedRoles).not.toContain('vitality')
    expect(result.unboundRecommendedRoles).toEqual(expect.arrayContaining(['level', 'identity.name']))
  })

  it('never blocks resolution -- a package binding no recommended roles still resolves fully', () => {
    const result = resolveWorldConfig(
      manifest({ requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }] }),
      'world:1',
      null
    )
    expect(result.unboundRecommendedRoles).toHaveLength(3)
    expect(lookupWorldTrait(result.snapshot, 'roadType', 'quality')).toBe(1)
  })
})

describe('resolveWorldConfig -- deterministic repeated resolution', () => {
  it('produces structurally identical results across repeated calls with the same inputs', () => {
    const testManifest = manifest({
      requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }],
      optionalRules: [{ key: 'flanking', label: 'Flanking', valueType: 'boolean', default: false }],
      rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] }],
      semanticRoles: { vitality: 'value:hp' }
    })
    const stored = storedConfig({ settings: { roadType: { quality: 4 } }, rollTypes: { luck: { order: 2 } } })

    const first = resolveWorldConfig(testManifest, 'world:1', stored)
    const second = resolveWorldConfig(testManifest, 'world:1', stored)

    expect(first).toEqual(second)
  })
})

describe('resolveWorldConfig -- regression: evaluator @world resolution is unchanged', () => {
  // Commit 1's evaluator reads an already-resolved WorldConfigSnapshot; this
  // integration test proves resolveWorldConfig's OUTPUT still plugs into
  // evaluator.ts's unmodified evaluateWorldReference exactly the way a
  // hand-built snapshot already did in evaluator.test.ts.
  function expression(text: string): Expression {
    const result = parseExpression(text)
    if (!result.ok) throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
    return { text, ast: result.ast as Expression['ast'] }
  }

  function derivedValue(id: string, formulaText: string): ValueDefinition {
    return { id, kind: 'value', valueType: 'boolean', storage: 'derived', formula: expression(formulaText) }
  }

  function actorState(): ActorState {
    return {
      actorId: 'actor:1',
      packageId: 'eldra.test.pkg',
      packageVersion: '1.0.0',
      stateSchemaVersion: 1,
      values: {},
      collections: {},
      choices: {},
      sources: []
    }
  }

  it('evaluates @world:rules.flanking against a snapshot built by resolveWorldConfig', () => {
    const testManifest = manifest({ optionalRules: [{ key: 'flanking', label: 'Flanking', valueType: 'boolean', default: true }] })
    const resolved = resolveWorldConfig(testManifest, 'world:1', null)

    const definitions = [derivedValue('value:x', '@world:rules.flanking')]
    const registryResult = RulesRegistry.create(testManifest, definitions)
    if (!registryResult.ok) throw new Error('registry construction failed')
    const graphResult = DependencyGraph.build(registryResult.registry)
    const graph = graphResult.ok ? graphResult.graph : (undefined as unknown as DependencyGraph)
    const session = new EvaluationSession(registryResult.registry, graph, actorState(), { world: resolved.snapshot }, {})

    expect(evaluate('value:x', session)).toBe(true)
  })
})
