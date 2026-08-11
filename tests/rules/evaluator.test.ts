// Unit tests for the Rules Engine core Evaluator (app/lib/rules/evaluator.ts).
// These assert on the public API (evaluate) and on EvaluationSession's own
// public API for cache/trace/visit-stack inspection. Per this task's own
// scope, the Modifier Pipeline, Action/Roll execution, and cache
// invalidation are not exercised here.

import { describe, expect, it } from 'vitest'
import { evaluate, evaluateStandaloneExpression } from '../../app/lib/rules/evaluator'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type {
  ActorState,
  CollectionDefinition,
  Definition,
  EvaluationContext,
  Expression,
  ModifierApplicationPhase,
  ModifierSpec,
  RulesPackageManifest,
  SourceDefinition,
  SourceInstance,
  ValueDefinition,
  WorldConfigSnapshot
} from '../../app/lib/rules/types'

function manifest(): RulesPackageManifest {
  return {
    packageId: 'eldra.test.pkg',
    version: '1.0.0',
    status: 'draft',
    engineApiVersion: '^1.0.0',
    stateSchemaVersion: 1,
    title: 'Test Package',
    license: { id: 'CC0-1.0' },
    capabilities: [],
    dependencies: []
  }
}

function expression(text: string): Expression {
  const result = parseExpression(text)
  if (!result.ok) {
    throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
  }
  return { text, ast: result.ast as Expression['ast'] }
}

function valueDefinition(
  id: string,
  overrides: Partial<ValueDefinition> = {}
): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored', ...overrides }
}

function derivedValue(id: string, formulaText: string, valueType: ValueDefinition['valueType'] = 'number'): ValueDefinition {
  return { id, kind: 'value', valueType, storage: 'derived', formula: expression(formulaText) }
}

function collectionDefinition(id: string, itemSchema: CollectionDefinition['itemSchema']): CollectionDefinition {
  return { id, kind: 'collection', itemSchema }
}

// Inline `ModifierSpec` (§16.1) -- no id/kind of its own. Discriminated on
// `phase` (a clamp modifier requires a `clamp` bound, §16.12), which a
// single generic helper cannot express without a cast -- unused by any
// fixture in this file, which never declares a clamp-phase modifier.
function modifier(
  target: string,
  phase: ModifierApplicationPhase,
  value: ModifierSpec['value'],
  overrides: Partial<ModifierSpec> = {}
): ModifierSpec {
  return { target, phase, value, ...overrides } as ModifierSpec
}

function sourceDefinition(id: string, modifiers: ModifierSpec[], overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return { id, kind: 'source', modifiers, ...overrides }
}

function sourceInstance(instanceId: string, sourceRef: string, overrides: Partial<SourceInstance> = {}): SourceInstance {
  return { instanceId, sourceRef, ...overrides }
}

function actorState(overrides: Partial<ActorState> = {}): ActorState {
  return {
    actorId: 'actor:1',
    packageId: 'eldra.test.pkg',
    packageVersion: '1.0.0',
    stateSchemaVersion: 1,
    values: {},
    collections: {},
    choices: {},
    sources: [],
    ...overrides
  }
}

function context(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return { ...overrides }
}

// Builds a session WITHOUT running static cycle detection or reference
// validation first -- the evaluator's runtime guard is being tested in
// isolation, independent of whichever earlier pass would ordinarily catch
// a cyclic package before evaluation ever runs.
function buildSession(
  definitions: Definition[],
  options: { actor?: Partial<ActorState>; tracingEnabled?: boolean; context?: Partial<EvaluationContext> } = {}
): EvaluationSession {
  const registryResult = RulesRegistry.create(manifest(), definitions)
  if (!registryResult.ok) throw new Error(`registry construction failed: ${JSON.stringify(registryResult.errors)}`)
  // The evaluator never consults session.graph directly (it recurses via
  // evaluate() + the registry only), so a deliberately cyclic package --
  // which static graph construction correctly rejects -- can still safely
  // use a placeholder graph here to exercise the evaluator's OWN runtime
  // guard in isolation, independent of static validation.
  const graphResult = DependencyGraph.build(registryResult.registry)
  const graph = graphResult.ok ? graphResult.graph : (undefined as unknown as DependencyGraph)
  return new EvaluationSession(registryResult.registry, graph, actorState(options.actor), context(options.context), {
    tracingEnabled: options.tracingEnabled
  })
}

// World Configuration Commit 1: an already-RESOLVED snapshot, which is the
// only thing the evaluator ever reads (defaults and Binding Gaps are
// applied during resolution, which does not exist yet -- see
// world-configuration.md §F.6).
function worldSnapshot(traits: WorldConfigSnapshot['traits'] = {}): WorldConfigSnapshot {
  return {
    worldId: 'world:1',
    packageId: 'eldra.test.pkg',
    packageVersion: '1.0.0',
    worldConfigVersion: 1,
    traits
  }
}

describe('literal evaluation', () => {
  it('a derived number literal evaluates to that number', () => {
    const session = buildSession([derivedValue('value:x', '42')])
    expect(evaluate('value:x', session)).toBe(42)
  })

  it('a derived text literal evaluates to that text', () => {
    const session = buildSession([derivedValue('value:x', '"hello"', 'text')])
    expect(evaluate('value:x', session)).toBe('hello')
  })

  it('a derived boolean literal evaluates to that boolean', () => {
    const session = buildSession([derivedValue('value:x', 'true', 'boolean')])
    expect(evaluate('value:x', session)).toBe(true)
  })

  it('a stored value with no ActorState entry and no default falls back to a type-appropriate zero', () => {
    const session = buildSession([valueDefinition('value:x', { valueType: 'number' })])
    expect(evaluate('value:x', session)).toBe(0)
  })

  it('a stored value reads from ActorState.values when present', () => {
    const session = buildSession([valueDefinition('value:x')], { actor: { values: { 'value:x': 7 } } })
    expect(evaluate('value:x', session)).toBe(7)
  })

  it('a stored value falls back to its declared default when ActorState has no entry', () => {
    const session = buildSession([valueDefinition('value:x', { default: 3 })])
    expect(evaluate('value:x', session)).toBe(3)
  })
})

describe('reference evaluation', () => {
  it('a formula referencing another Value evaluates through it', () => {
    const session = buildSession([valueDefinition('value:a'), derivedValue('value:b', '@value:a')], {
      actor: { values: { 'value:a': 5 } }
    })
    expect(evaluate('value:b', session)).toBe(5)
  })

  it("the architecture's own worked example evaluates correctly", () => {
    const session = buildSession(
      [valueDefinition('value:might'), derivedValue('value:might.mod', 'floor((@value:might - 10) / 2)')],
      { actor: { values: { 'value:might': 16 } } }
    )
    expect(evaluate('value:might.mod', session)).toBe(3)
  })

  it('a reference to an unmodeled namespace (@ctx) evaluates to a RulesError', () => {
    const session = buildSession([derivedValue('value:x', '@ctx:successes')])
    const result = evaluate('value:x', session)
    expect(result).toMatchObject({ definitionId: 'value:x' })
    expect((result as { message: string }).message).toContain('ctx')
  })

  it('@choice and @sources remain unresolvable, unchanged by World Configuration', () => {
    const choiceSession = buildSession([derivedValue('value:x', '@choice:origin', 'text')])
    expect((evaluate('value:x', choiceSession) as { message: string }).message).toContain(
      'not resolvable in the current runtime model'
    )

    const sourcesSession = buildSession([derivedValue('value:y', 'count(@sources)')])
    expect((evaluate('value:y', sourcesSession) as { message: string }).message).toBeTruthy()
  })
})

describe('@world reference evaluation (world-configuration.md §F)', () => {
  it('resolves @world:rules.flanking from EvaluationContext.world', () => {
    const session = buildSession([derivedValue('value:x', '@world:rules.flanking', 'boolean')], {
      context: { world: worldSnapshot({ rules: { flanking: true } }) }
    })
    expect(evaluate('value:x', session)).toBe(true)
  })

  it('resolves a number trait and uses it in arithmetic', () => {
    const session = buildSession([derivedValue('value:x', '1 + @world:roadType.quality * 0.1')], {
      context: { world: worldSnapshot({ roadType: { quality: 4 } }) }
    })
    // §19.1's own worked example: `quality: 4` is the world-config fact,
    // `1 + quality * 0.1` is the rules interpretation.
    expect(evaluate('value:x', session)).toBeCloseTo(1.4)
  })

  it('resolves a text trait', () => {
    const session = buildSession([derivedValue('value:x', '@world:calendar.currentSeason', 'text')], {
      context: { world: worldSnapshot({ calendar: { currentSeason: 'winter' } }) }
    })
    expect(evaluate('value:x', session)).toBe('winter')
  })

  it('resolves a falsy trait as that value, not as an error', () => {
    const session = buildSession([derivedValue('value:x', '@world:rules.flanking', 'boolean')], {
      context: { world: worldSnapshot({ rules: { flanking: false } }) }
    })
    expect(evaluate('value:x', session)).toBe(false)
  })

  it('returns a RulesError when EvaluationContext.world is undefined (unconfigured world)', () => {
    const session = buildSession([derivedValue('value:x', '@world:rules.flanking', 'boolean')])
    const result = evaluate('value:x', session)
    expect(result).toMatchObject({ definitionId: 'value:x' })
    expect((result as { message: string }).message).toContain('no active World Configuration')
  })

  it('returns a RulesError when the trait is missing from a configured world', () => {
    const session = buildSession([derivedValue('value:x', '@world:rules.grittyRest', 'boolean')], {
      context: { world: worldSnapshot({ rules: { flanking: true } }) }
    })
    const result = evaluate('value:x', session)
    expect(result).toMatchObject({ definitionId: 'value:x' })
    expect((result as { message: string }).message).toContain('not present')
  })

  it('returns a RulesError when the whole kind is missing', () => {
    const session = buildSession([derivedValue('value:x', '@world:calendar.currentSeason', 'text')], {
      context: { world: worldSnapshot({ rules: { flanking: true } }) }
    })
    expect((evaluate('value:x', session) as { message: string }).message).toContain('not present')
  })

  it('never substitutes a zero, empty string, or false for a missing trait', () => {
    const session = buildSession([derivedValue('value:x', '@world:rules.missing')], {
      context: { world: worldSnapshot({ rules: {} }) }
    })
    const result = evaluate('value:x', session)
    expect(result).not.toBe(0)
    expect(result).not.toBe('')
    expect(result).not.toBe(false)
    expect(result).toMatchObject({ definitionId: 'value:x' })
  })

  it('returns a RulesError for a one-segment @world path (defensive: reference validation catches this first)', () => {
    const session = buildSession([derivedValue('value:x', '@world:restVariant')], {
      context: { world: worldSnapshot({ rules: { restVariant: 'gritty' } }) }
    })
    const result = evaluate('value:x', session)
    expect((result as { message: string }).message).toContain('exactly two path segments')
  })

  it('returns a RulesError for a three-segment @world path', () => {
    const session = buildSession([derivedValue('value:x', '@world:a.b.c')], {
      context: { world: worldSnapshot({ a: { b: 1 } }) }
    })
    expect((evaluate('value:x', session) as { message: string }).message).toContain('exactly two path segments')
  })

  it('reports the unconfigured world before the path arity, per §F.6 check order', () => {
    const session = buildSession([derivedValue('value:x', '@world:a.b.c')])
    expect((evaluate('value:x', session) as { message: string }).message).toContain('no active World Configuration')
  })

  it('a @world error propagates through arithmetic rather than being absorbed', () => {
    const session = buildSession([derivedValue('value:x', '1 + @world:rules.missing')], {
      context: { world: worldSnapshot({ rules: {} }) }
    })
    expect(evaluate('value:x', session)).toMatchObject({ definitionId: 'value:x' })
  })

  it('the same snapshot is read for every reference in one session (frozen, §F.5)', () => {
    const session = buildSession(
      [
        derivedValue('value:a', '@world:rules.bonus'),
        derivedValue('value:b', '@world:rules.bonus'),
        derivedValue('value:c', '@value:a + @value:b')
      ],
      { context: { world: worldSnapshot({ rules: { bonus: 3 } }) } }
    )
    expect(evaluate('value:c', session)).toBe(6)
  })
})

describe('recursive evaluation', () => {
  it('a -> b -> c resolves through the full chain', () => {
    const session = buildSession(
      [valueDefinition('value:a'), derivedValue('value:b', '@value:a * 2'), derivedValue('value:c', '@value:b + 1')],
      { actor: { values: { 'value:a': 3 } } }
    )
    expect(evaluate('value:c', session)).toBe(7)
  })
})

describe('nested dependencies', () => {
  it('a value with multiple references combined through nested arithmetic and a conditional', () => {
    const session = buildSession(
      [
        valueDefinition('value:hp'),
        valueDefinition('value:maxHp'),
        derivedValue('value:status', 'if(@value:hp <= 0, "Dead", "Alive")', 'text')
      ],
      { actor: { values: { 'value:hp': 0, 'value:maxHp': 20 } } }
    )
    expect(evaluate('value:status', session)).toBe('Dead')
  })

  it('the conditional branch NOT selected is never evaluated (laziness)', () => {
    // The unselected branch references a Definition that does not exist --
    // if it were evaluated, this would produce a RulesError instead.
    const session = buildSession([derivedValue('value:x', 'if(true, 1, @value:doesNotExist)')])
    expect(evaluate('value:x', session)).toBe(1)
  })
})

describe('memoization', () => {
  it('evaluating a Definition populates the session cache', () => {
    const session = buildSession([derivedValue('value:x', '42')])
    expect(session.hasCached('value:x')).toBe(false)
    evaluate('value:x', session)
    expect(session.hasCached('value:x')).toBe(true)
    expect(session.getCached('value:x')).toBe(42)
  })

  it('a second evaluate() call does not recompute -- it returns the cached value even after the underlying formula would produce something different', () => {
    const session = buildSession([valueDefinition('value:a'), derivedValue('value:b', '@value:a')], {
      actor: { values: { 'value:a': 1 } }
    })
    expect(evaluate('value:b', session)).toBe(1)
    session.actorState.values['value:a'] = 999
    // Still 1: the cached result from the first call, not recomputed.
    expect(evaluate('value:b', session)).toBe(1)
  })
})

describe('cache hits', () => {
  it('a pre-populated cache entry is returned as-is, bypassing evaluation entirely', () => {
    // The formula itself would error if actually evaluated (unknown
    // reference) -- proving the cache hit short-circuits before any
    // computation happens.
    const session = buildSession([derivedValue('value:x', '@value:doesNotExist')])
    session.setCached('value:x', 123)
    expect(evaluate('value:x', session)).toBe(123)
  })
})

describe('runtime cycle detection', () => {
  it('a self-referencing formula produces a RulesError, not infinite recursion', () => {
    const session = buildSession([derivedValue('value:x', '@value:x')])
    const result = evaluate('value:x', session)
    expect(result).toMatchObject({ definitionId: 'value:x' })
    expect((result as { message: string }).message).toContain('cycle')
  })

  it('a two-Definition runtime cycle is caught via the session visit stack', () => {
    // a evaluates b, b evaluates a again -- the cycle is detected re-
    // entering 'value:a' (the id already on the visit stack), so the error
    // names 'value:a', not 'value:b' which merely triggered the re-entry.
    const session = buildSession([derivedValue('value:a', '@value:b'), derivedValue('value:b', '@value:a')])
    const result = evaluate('value:a', session)
    expect(result).toMatchObject({ definitionId: 'value:a' })
    expect((result as { message: string }).message).toContain('cycle')
  })

  it('the visit stack is empty again after a cycle is caught and unwound', () => {
    const session = buildSession([derivedValue('value:x', '@value:x')])
    evaluate('value:x', session)
    expect(session.getVisitPath()).toEqual([])
  })

  it('a runtime cycle error is not cached, so a later call can still be attempted', () => {
    const session = buildSession([derivedValue('value:x', '@value:x')])
    evaluate('value:x', session)
    expect(session.hasCached('value:x')).toBe(false)
  })

  it('a cycle error is not cached even at an intermediate frame it merely passes through', () => {
    // a -> b -> a: the error is constructed naming 'a', but it unwinds
    // through 'b's own evaluate() frame first. Neither id should end up
    // cached with this transient result.
    const session = buildSession([derivedValue('value:a', '@value:b'), derivedValue('value:b', '@value:a')])
    evaluate('value:a', session)
    expect(session.hasCached('value:a')).toBe(false)
    expect(session.hasCached('value:b')).toBe(false)
  })
})

describe('trace creation', () => {
  it('no trace is recorded when tracingEnabled is false', () => {
    const session = buildSession([derivedValue('value:x', '42')])
    evaluate('value:x', session)
    expect(session.getTrace('value:x')).toBeUndefined()
  })

  it('a trace is recorded when tracingEnabled is true', () => {
    const session = buildSession([derivedValue('value:x', '42')], { tracingEnabled: true })
    evaluate('value:x', session)
    expect(session.getTrace('value:x')).toEqual({ path: 'value:x', result: 42, steps: [] })
  })
})

describe('repeated evaluation', () => {
  it('evaluating the same Definition multiple times yields the same result every time', () => {
    const session = buildSession(
      [valueDefinition('value:a'), derivedValue('value:b', '@value:a + 1')],
      { actor: { values: { 'value:a': 4 } } }
    )
    const first = evaluate('value:b', session)
    const second = evaluate('value:b', session)
    const third = evaluate('value:b', session)
    expect(first).toBe(5)
    expect(second).toBe(5)
    expect(third).toBe(5)
  })
})

describe('arithmetic and function whitelist', () => {
  it('evaluates the four arithmetic operators', () => {
    const session = buildSession([derivedValue('value:x', '(2 + 3) * 4 / 2 - 1')])
    expect(evaluate('value:x', session)).toBe(9)
  })

  it('evaluates clamp/min/max/floor', () => {
    const session = buildSession([derivedValue('value:x', 'floor(clamp(max(1, 2), 0, min(10, 5)) / 2)')])
    // clamp(2, 0, 5) = 2; floor(2/2) = 1
    expect(evaluate('value:x', session)).toBe(1)
  })

  it('evaluates text functions', () => {
    const session = buildSession([derivedValue('value:x', 'upper(concat(lower("A"), "b"))', 'text')])
    expect(evaluate('value:x', session)).toBe('AB')
  })

  it('and/or short-circuit and do not evaluate later arguments once determined', () => {
    const session = buildSession([derivedValue('value:x', 'and(false, @value:doesNotExist)', 'boolean')])
    expect(evaluate('value:x', session)).toBe(false)
  })

  it('an unrecognized function name produces a RulesError', () => {
    const session = buildSession([derivedValue('value:x', 'banana(1)')])
    expect(evaluate('value:x', session)).toMatchObject({ definitionId: 'value:x' })
  })

  it('error propagation: an error inside a sub-expression propagates through arithmetic unchanged', () => {
    // The error is constructed where the actual problem is (the missing
    // reference), not rewrapped with the outer formula's own id.
    const session = buildSession([derivedValue('value:x', '1 + @value:doesNotExist')])
    const result = evaluate('value:x', session)
    expect(result).toMatchObject({ definitionId: 'value:doesNotExist' })
  })
})

describe('dice', () => {
  it('a literal NdF dice token evaluates to a diceSpec, not a number', () => {
    const session = buildSession([derivedValue('value:x', '2d6')])
    expect(evaluate('value:x', session)).toEqual({ count: 2, faces: 6 })
  })

  it('dice(count, faces) with a referenced count evaluates correctly', () => {
    const session = buildSession([valueDefinition('value:pool'), derivedValue('value:x', 'dice(@value:pool, 6)')], {
      actor: { values: { 'value:pool': 3 } }
    })
    expect(evaluate('value:x', session)).toEqual({ count: 3, faces: 6 })
  })

  it('keepHighest annotates a diceSpec without rolling it', () => {
    const session = buildSession([derivedValue('value:x', 'keepHighest(dice(4, 6), 3)')])
    expect(evaluate('value:x', session)).toEqual({ count: 4, faces: 6, keep: 'highest', keepCount: 3 })
  })

  // §17.3's own worked table spells the d20 roll-over/advantage families as
  // e.g. "1d20 + @mod" -- a diceSpec plus a flat numeric modifier, still
  // constructing a diceSpec (§14.6), never rolling. Found missing while
  // implementing the Roll Engine; fixed in evaluateBinary's '+' case.
  it('diceSpec + number attaches a flat modifier without rolling', () => {
    const session = buildSession([derivedValue('value:x', '1d20 + 5')])
    expect(evaluate('value:x', session)).toEqual({ count: 1, faces: 20, modifier: 5 })
  })

  it('number + diceSpec attaches a flat modifier (operand order does not matter)', () => {
    const session = buildSession([derivedValue('value:x', '5 + 1d20')])
    expect(evaluate('value:x', session)).toEqual({ count: 1, faces: 20, modifier: 5 })
  })

  it('diceSpec + number modifiers accumulate left-to-right', () => {
    const session = buildSession([derivedValue('value:x', '1d20 + 2 + 3')])
    expect(evaluate('value:x', session)).toEqual({ count: 1, faces: 20, modifier: 5 })
  })

  it('a referenced modifier resolves through @value: before attaching', () => {
    const session = buildSession(
      [valueDefinition('value:mod'), derivedValue('value:x', '1d20 + @value:mod')],
      { actor: { values: { 'value:mod': 4 } } }
    )
    expect(evaluate('value:x', session)).toEqual({ count: 1, faces: 20, modifier: 4 })
  })
})

describe('collections', () => {
  const inventorySchema: CollectionDefinition['itemSchema'] = [
    { key: 'weightEach', valueType: 'number' },
    { key: 'quantity', valueType: 'number' },
    { key: 'equipped', valueType: 'boolean' }
  ]

  it("the architecture's own sum/aggregate example evaluates correctly", () => {
    const session = buildSession(
      [
        collectionDefinition('collection:inventory', inventorySchema),
        derivedValue('value:totalWeight', 'sum(@collection:inventory[equipped], "weightEach" * "quantity")')
      ],
      {
        actor: {
          collections: {
            'collection:inventory': [
              { instanceId: '1', weightEach: 2, quantity: 3, equipped: true },
              { instanceId: '2', weightEach: 5, quantity: 1, equipped: false },
              { instanceId: '3', weightEach: 1, quantity: 4, equipped: true }
            ]
          }
        }
      }
    )
    // (2*3) + (1*4) = 10 -- item 2 excluded by the [equipped] filter
    expect(evaluate('value:totalWeight', session)).toBe(10)
  })

  it('count() counts filtered items', () => {
    const session = buildSession(
      [
        collectionDefinition('collection:inventory', inventorySchema),
        derivedValue('value:equippedCount', 'count(@collection:inventory[equipped])')
      ],
      {
        actor: {
          collections: {
            'collection:inventory': [
              { instanceId: '1', equipped: true },
              { instanceId: '2', equipped: false },
              { instanceId: '3', equipped: true }
            ]
          }
        }
      }
    )
    expect(evaluate('value:equippedCount', session)).toBe(2)
  })

  it('any() reports whether any item matches', () => {
    const session = buildSession(
      [
        collectionDefinition('collection:inventory', inventorySchema),
        derivedValue('value:hasEquipped', 'any(@collection:inventory[equipped])', 'boolean')
      ],
      { actor: { collections: { 'collection:inventory': [{ instanceId: '1', equipped: false }] } } }
    )
    expect(evaluate('value:hasEquipped', session)).toBe(false)
  })

  it('an empty (unset) collection instance is treated as zero items', () => {
    const session = buildSession([
      collectionDefinition('collection:inventory', inventorySchema),
      derivedValue('value:count', 'count(@collection:inventory)')
    ])
    expect(evaluate('value:count', session)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// @source: runtime resolution (§16.9, revision 3, Commit 6). `@source:` is
// legal only inside a ModifierSpec's `value`/`condition` -- every test here
// exercises it through evaluate() on the TARGET a Modifier affects, never
// by calling an internal evaluator function directly, so these are true
// end-to-end tests of the binding modifier-pipeline.ts's ActiveModifier
// provenance now makes possible.
// ---------------------------------------------------------------------------

describe('@source: engine fields (§16.9)', () => {
  it('@source:instanceId resolves to the activating Source instance\'s id', () => {
    const session = buildSession(
      [
        valueDefinition('value:label', { valueType: 'text', default: '' }),
        sourceDefinition('source:blessed', [modifier('value:label', 'set', expression('@source:instanceId'))])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:blessed')] } }
    )
    expect(evaluate('value:label', session)).toBe('cs-1')
  })

  it('@source:definitionId resolves to the Source Definition\'s own id', () => {
    const session = buildSession(
      [
        valueDefinition('value:label', { valueType: 'text', default: '' }),
        sourceDefinition('source:blessed', [modifier('value:label', 'set', expression('@source:definitionId'))])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:blessed')] } }
    )
    expect(evaluate('value:label', session)).toBe('source:blessed')
  })

  it('@source:duration.kind and @source:duration.remaining resolve when a duration is set', () => {
    const session = buildSession(
      [
        valueDefinition('value:kind', { valueType: 'text', default: '' }),
        valueDefinition('value:remaining', { valueType: 'number', default: 0 }),
        sourceDefinition('source:stressed', [
          modifier('value:kind', 'set', expression('@source:duration.kind')),
          modifier('value:remaining', 'set', expression('@source:duration.remaining'))
        ])
      ],
      {
        actor: {
          sources: [sourceInstance('cs-1', 'source:stressed', { duration: { kind: 'rounds', remaining: 3 } })]
        }
      }
    )
    expect(evaluate('value:kind', session)).toBe('rounds')
    expect(evaluate('value:remaining', session)).toBe(3)
  })

  it('@source:duration.kind/.remaining default to "" and 0 when the instance has no duration (§16.9)', () => {
    const session = buildSession(
      [
        valueDefinition('value:kind', { valueType: 'text', default: '' }),
        valueDefinition('value:remaining', { valueType: 'number', default: 0 }),
        sourceDefinition('source:permanent', [
          modifier('value:kind', 'set', expression('@source:duration.kind')),
          modifier('value:remaining', 'set', expression('@source:duration.remaining'))
        ])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:permanent')] } }
    )
    expect(evaluate('value:kind', session)).toBe('')
    expect(evaluate('value:remaining', session)).toBe(0)
  })
})

describe('@source: flat item fields (§16.9, collection-derived instances)', () => {
  it('a collection item\'s own field is readable through @source:<field>', () => {
    const session = buildSession(
      [
        valueDefinition('value:bonus', { default: 0 }),
        {
          id: 'collection:inventory',
          kind: 'collection',
          sourceRefField: 'sourceRef',
          itemSchema: [
            { key: 'name', valueType: 'text' },
            { key: 'enhancementBonus', valueType: 'number' },
            { key: 'sourceRef', valueType: 'ref', refKind: 'source' }
          ]
        },
        sourceDefinition('source:item.ring', [modifier('value:bonus', 'add', expression('@source:enhancementBonus'))])
      ],
      {
        actor: {
          collections: {
            'collection:inventory': [
              { instanceId: 'ci-1', name: 'Ring', enhancementBonus: 3, sourceRef: 'source:item.ring' }
            ]
          }
        }
      }
    )
    expect(evaluate('value:bonus', session)).toBe(3)
  })
})

describe('@source: absent field is an error, never a zero or false (§16.9)', () => {
  it('a misspelled/unknown field name produces a RulesError, never a type-appropriate zero', () => {
    const session = buildSession(
      [
        valueDefinition('value:guard', { default: 10 }),
        sourceDefinition('source:blessed', [
          modifier('value:guard', 'add', 2, { condition: expression('@source:notARealField') })
        ])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:blessed')] } }
    )
    const result = evaluate('value:guard', session)
    expect(result).not.toBe(10) // not silently excluded (would look like "condition false")
    expect(result).not.toBe(12) // not silently applied either
    expect((result as { message: string }).message).toContain('notARealField')
  })

  it('reading an item field on a DECLARED (non-collection) instance is an absent-field error, not a zero', () => {
    // §16.9: "a condition has no `equipped`" -- a declared instance has no
    // itemFields at all.
    const session = buildSession(
      [
        valueDefinition('value:guard', { default: 10 }),
        sourceDefinition('source:blessed', [
          modifier('value:guard', 'add', 2, { condition: expression('@source:equipped') })
        ])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:blessed')] } }
    )
    const result = evaluate('value:guard', session)
    expect(result).not.toBe(10)
    expect((result as { message: string }).message).toContain('equipped')
  })
})

describe('@source: missing binding (lexical scope, §16.9)', () => {
  it('@source: used outside a Modifier value/condition (e.g. a Value formula) is a runtime RulesError', () => {
    // The parser accepts @source: anywhere (grammar only, §8.2) -- Reference
    // Validation is what would normally catch this at package-validation
    // time (not implemented this commit); the evaluator's own defensive
    // fallback is what is under test here.
    const session = buildSession([derivedValue('value:x', '@source:instanceId', 'text')])
    const result = evaluate('value:x', session)
    expect((result as { message: string }).message).toContain('no active Source instance is bound')
  })
})

describe('@source: condition evaluation (§16.9)', () => {
  it('a condition reading @source:duration.remaining gates the modifier through real evaluation', () => {
    const active = buildSession(
      [
        valueDefinition('value:guard', { default: 10 }),
        sourceDefinition('source:blessed', [
          modifier('value:guard', 'add', 2, { condition: expression('@source:duration.remaining > 0') })
        ])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:blessed', { duration: { kind: 'rounds', remaining: 3 } })] } }
    )
    expect(evaluate('value:guard', active)).toBe(12)

    const expired = buildSession(
      [
        valueDefinition('value:guard', { default: 10 }),
        sourceDefinition('source:blessed', [
          modifier('value:guard', 'add', 2, { condition: expression('@source:duration.remaining > 0') })
        ])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:blessed', { duration: { kind: 'rounds', remaining: 0 } })] } }
    )
    expect(evaluate('value:guard', expired)).toBe(10)
  })

  it('the canonical equipped-item example resolves end to end (§16.13 example 1)', () => {
    const equippedSchema = [
      { key: 'name', valueType: 'text' as const },
      { key: 'equipped', valueType: 'boolean' as const },
      { key: 'sourceRef', valueType: 'ref' as const, refKind: 'source' }
    ]
    const definitions: Definition[] = [
      valueDefinition('value:guard', { default: 10 }),
      { id: 'collection:inventory', kind: 'collection', itemSchema: equippedSchema, sourceRefField: 'sourceRef' },
      sourceDefinition('source:item.scaleHauberk', [
        modifier('value:guard', 'add', 2, { condition: expression('@source:equipped') })
      ])
    ]

    const registryResult = RulesRegistry.create(manifest(), definitions)
    if (!registryResult.ok) throw new Error('registry construction failed')
    const graphResult = DependencyGraph.build(registryResult.registry)
    if (!graphResult.ok) throw new Error('graph construction failed')

    const equippedState = actorState({
      collections: {
        'collection:inventory': [
          { instanceId: 'ci-1', name: 'Scale Hauberk', equipped: true, sourceRef: 'source:item.scaleHauberk' }
        ]
      }
    })
    const equippedSession = new EvaluationSession(registryResult.registry, graphResult.graph, equippedState, context())
    expect(evaluate('value:guard', equippedSession)).toBe(12)

    const unequippedState = actorState({
      collections: {
        'collection:inventory': [
          { instanceId: 'ci-1', name: 'Scale Hauberk', equipped: false, sourceRef: 'source:item.scaleHauberk' }
        ]
      }
    })
    const unequippedSession = new EvaluationSession(registryResult.registry, graphResult.graph, unequippedState, context())
    expect(evaluate('value:guard', unequippedSession)).toBe(10)
  })
})

describe('@source: value evaluation (§16.9)', () => {
  it('a modifier value expression reads @source: (item field) rather than a condition', () => {
    const session = buildSession(
      [
        valueDefinition('value:attack', { default: 0 }),
        { id: 'collection:inventory', kind: 'collection', itemSchema: [
          { key: 'name', valueType: 'text' },
          { key: 'bonus', valueType: 'number' },
          { key: 'sourceRef', valueType: 'ref', refKind: 'source' }
        ], sourceRefField: 'sourceRef' },
        sourceDefinition('source:item.wand', [modifier('value:attack', 'add', expression('@source:bonus'))])
      ],
      {
        actor: {
          collections: {
            'collection:inventory': [{ instanceId: 'ci-1', name: 'Wand', bonus: 5, sourceRef: 'source:item.wand' }]
          }
        }
      }
    )
    expect(evaluate('value:attack', session)).toBe(5)
  })
})

describe('@source: runtime error propagation (§16.11A, unchanged by this commit)', () => {
  it('an absent-field error inside a condition aborts the target -- never silently "false" (§16.11A)', () => {
    const session = buildSession(
      [
        valueDefinition('value:guard', { default: 10 }),
        sourceDefinition('source:blessed', [
          modifier('value:guard', 'add', 2, { condition: expression('and(@source:duration.kind = "permanent", @source:nonsense)') })
        ])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:blessed', { duration: { kind: 'permanent' } })] } }
    )
    const result = evaluate('value:guard', session)
    expect(result).not.toBe(10)
    expect(result).not.toBe(12)
    expect((result as { message: string }).message).toContain('nonsense')
  })

  it('an absent-field error is memoized like any other RuleValue (§15.4, unchanged since Commit 1)', () => {
    const session = buildSession(
      [
        valueDefinition('value:guard', { default: 10 }),
        sourceDefinition('source:blessed', [
          modifier('value:guard', 'add', 2, { condition: expression('@source:notARealField') })
        ])
      ],
      { actor: { sources: [sourceInstance('cs-1', 'source:blessed')] } }
    )
    expect(session.hasCached('value:guard')).toBe(false)
    const first = evaluate('value:guard', session)
    expect(session.hasCached('value:guard')).toBe(true)
    const second = evaluate('value:guard', session)
    expect(second).toEqual(first)
  })
})

// Added while implementing the Roll Engine: RollSpec.successRule.threshold
// (types.ts) is `Expression | RuleValue` -- the percentile roll-under
// family (§17.3: `atMost: @value:skill`) needs the Expression form
// evaluated against a session/scope, which previously had no public entry
// point (only whole Definitions were evaluable via `evaluate`).
describe('evaluateStandaloneExpression (added for the Roll Engine, §17.3)', () => {
  it('evaluates a literal expression with no Definition of its own', () => {
    const session = buildSession([])
    expect(evaluateStandaloneExpression(expression('2 + 2'), session, 'roll:test')).toBe(4)
  })

  it('resolves a @value: reference against the session exactly like evaluate() does', () => {
    const session = buildSession([valueDefinition('value:skill', { default: 35 })])
    expect(evaluateStandaloneExpression(expression('@value:skill'), session, 'roll:test')).toBe(35)
  })

  it('propagates an internal error unchanged, attributed to the actual missing reference', () => {
    const session = buildSession([])
    const result = evaluateStandaloneExpression(expression('@value:doesNotExist'), session, 'roll:test')
    expect(result).toMatchObject({ definitionId: 'value:doesNotExist' })
  })
})
