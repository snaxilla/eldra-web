// Unit tests for the Rules Engine Modifier Pipeline
// (app/lib/rules/modifier-pipeline.ts), plus the Evaluator's application of
// the ordered sequence it returns. Per this task's own scope, Action
// execution, Roll execution, and Resource mutation are not exercised.

import { describe, expect, it } from 'vitest'
import { groupByPhase, resolveActiveModifiers, MODIFIER_PHASES } from '../../app/lib/rules/modifier-pipeline'
import { evaluate } from '../../app/lib/rules/evaluator'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type {
  ActorState,
  Definition,
  EvaluationContext,
  Expression,
  ModifierDefinition,
  ModifierPhase,
  RuleValue,
  RulesPackageManifest,
  SourceDefinition,
  SourceInstance,
  ValueDefinition
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

function valueDefinition(id: string, overrides: Partial<ValueDefinition> = {}): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored', ...overrides }
}

function modifier(
  target: string,
  phase: ModifierPhase,
  value: ModifierDefinition['value'],
  overrides: Partial<ModifierDefinition> = {}
): ModifierDefinition {
  return { target, phase, value, ...overrides }
}

function source(id: string, modifiers: ModifierDefinition[], overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return { id, kind: 'source', modifiers, ...overrides }
}

function instance(instanceId: string, sourceRef: string): SourceInstance {
  return { instanceId, sourceRef }
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

function buildSession(
  definitions: Definition[],
  options: { values?: ActorState['values']; sources?: SourceInstance[] } = {}
): EvaluationSession {
  const registryResult = RulesRegistry.create(manifest(), definitions)
  if (!registryResult.ok) throw new Error(`registry construction failed: ${JSON.stringify(registryResult.errors)}`)
  const graphResult = DependencyGraph.build(registryResult.registry)
  const graph = graphResult.ok ? graphResult.graph : (undefined as unknown as DependencyGraph)
  return new EvaluationSession(
    registryResult.registry,
    graph,
    actorState({ values: options.values ?? {}, sources: options.sources ?? [] }),
    {} as EvaluationContext
  )
}

// The pipeline never evaluates anything itself -- it delegates every
// condition to an injected ConditionEvaluator. Pipeline-level tests supply
// one directly (defaulting to "condition holds") so the pipeline's OWN
// discovery/suppression/gating/ordering logic is what is under test.
// Real condition evaluation is covered separately, through evaluate().
function resolve(targetId: string, session: EvaluationSession, conditionResult: RuleValue = true) {
  return resolveActiveModifiers(targetId, session, () => conditionResult)
}

describe('active Source discovery', () => {
  it('a Source instance present in ActorState.sources contributes its modifiers', () => {
    const session = buildSession(
      [valueDefinition('value:defense'), source('source:shield', [modifier('value:defense', 'add', 2)])],
      { sources: [instance('si-1', 'source:shield')] }
    )
    const active = resolve('value:defense', session)
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({
      phase: 'add',
      sourceDefinitionId: 'source:shield',
      sourceInstanceId: 'si-1'
    })
  })

  it('only modifiers whose target matches are returned', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        valueDefinition('value:speed'),
        source('source:boots', [modifier('value:speed', 'add', 5), modifier('value:defense', 'add', 1)])
      ],
      { sources: [instance('si-1', 'source:boots')] }
    )
    expect(resolve('value:speed', session)).toHaveLength(1)
    expect(resolve('value:speed', session)[0]!.modifier.value).toBe(5)
  })

  it('a Source instance whose sourceRef does not resolve is skipped', () => {
    const session = buildSession([valueDefinition('value:defense')], {
      sources: [instance('si-1', 'source:doesNotExist')]
    })
    expect(resolve('value:defense', session)).toEqual([])
  })
})

describe('inactive Sources', () => {
  it('a SourceDefinition that has no instance in ActorState contributes nothing', () => {
    const session = buildSession([
      valueDefinition('value:defense'),
      source('source:shield', [modifier('value:defense', 'add', 2)])
    ])
    expect(resolve('value:defense', session)).toEqual([])
  })

  it('a suppressed Source contributes nothing', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:shield', [modifier('value:defense', 'add', 2)]),
        source('source:disarm', [], { suppresses: ['source:shield'] })
      ],
      { sources: [instance('si-1', 'source:shield'), instance('si-2', 'source:disarm')] }
    )
    expect(resolve('value:defense', session)).toEqual([])
  })

  it('suppression is not transitive (§16.6: A suppresses B; B\'s suppression of C still applies)', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:a', [], { suppresses: ['source:b'] }),
        source('source:b', [modifier('value:defense', 'add', 2)], { suppresses: ['source:c'] }),
        source('source:c', [modifier('value:defense', 'add', 4)])
      ],
      {
        sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b'), instance('si-c', 'source:c')]
      }
    )
    // B is suppressed by A, and C is still suppressed by B -- so neither
    // B's nor C's modifiers survive.
    expect(resolve('value:defense', session)).toEqual([])
  })
})

describe('multiple Modifiers', () => {
  it('modifiers from several active Sources all appear', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:a', [modifier('value:defense', 'add', 1)]),
        source('source:b', [modifier('value:defense', 'add', 2)])
      ],
      { sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')] }
    )
    expect(resolve('value:defense', session)).toHaveLength(2)
  })

  it('two instances of the same Source both contribute, distinguished by instance id', () => {
    const session = buildSession(
      [valueDefinition('value:defense'), source('source:ring', [modifier('value:defense', 'add', 1)])],
      { sources: [instance('si-1', 'source:ring'), instance('si-2', 'source:ring')] }
    )
    const active = resolve('value:defense', session)
    expect(active).toHaveLength(2)
    expect(active.map((entry) => entry.sourceInstanceId)).toEqual(['si-1', 'si-2'])
  })
})

describe('phase ordering', () => {
  it('MODIFIER_PHASES preserves the architecture\'s fixed order exactly (§16.4)', () => {
    expect(MODIFIER_PHASES).toEqual(['base', 'set', 'add', 'scale', 'clamp', 'final'])
  })

  it('modifiers are returned in phase order regardless of authoring order', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:mixed', [
          modifier('value:defense', 'final', 99),
          modifier('value:defense', 'add', 1),
          modifier('value:defense', 'set', 10),
          modifier('value:defense', 'scale', 2)
        ])
      ],
      { sources: [instance('si-1', 'source:mixed')] }
    )
    expect(resolve('value:defense', session).map((entry) => entry.phase)).toEqual(['set', 'add', 'scale', 'final'])
  })

  it('groupByPhase returns every phase, in fixed order, with empty groups preserved', () => {
    const session = buildSession(
      [valueDefinition('value:defense'), source('source:a', [modifier('value:defense', 'add', 1)])],
      { sources: [instance('si-a', 'source:a')] }
    )
    const grouped = groupByPhase(resolve('value:defense', session))
    expect([...grouped.keys()]).toEqual(['base', 'set', 'add', 'scale', 'clamp', 'final'])
    expect(grouped.get('add')).toHaveLength(1)
    expect(grouped.get('scale')).toEqual([])
  })
})

describe('deterministic ordering', () => {
  it('within a phase, explicit `order` wins first (§15.3)', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:a', [
          modifier('value:defense', 'add', 1, { order: 5, label: 'late' }),
          modifier('value:defense', 'add', 2, { order: 1, label: 'early' })
        ])
      ],
      { sources: [instance('si-a', 'source:a')] }
    )
    expect(resolve('value:defense', session).map((entry) => entry.modifier.label)).toEqual(['early', 'late'])
  })

  it('ties on `order` break by sourceDefinitionId, then sourceInstanceId', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:zebra', [modifier('value:defense', 'add', 1)]),
        source('source:alpha', [modifier('value:defense', 'add', 2)])
      ],
      {
        // Deliberately inserted zebra-first so insertion order cannot be
        // what produces the result.
        sources: [instance('si-9', 'source:zebra'), instance('si-1', 'source:alpha')]
      }
    )
    expect(resolve('value:defense', session).map((entry) => entry.sourceDefinitionId)).toEqual([
      'source:alpha',
      'source:zebra'
    ])
  })

  it('instance id breaks the tie when source definition ids match', () => {
    const session = buildSession(
      [valueDefinition('value:defense'), source('source:ring', [modifier('value:defense', 'add', 1)])],
      { sources: [instance('si-b', 'source:ring'), instance('si-a', 'source:ring')] }
    )
    expect(resolve('value:defense', session).map((entry) => entry.sourceInstanceId)).toEqual(['si-a', 'si-b'])
  })

  it('resolving twice yields an identical ordered sequence', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:a', [modifier('value:defense', 'add', 1)]),
        source('source:b', [modifier('value:defense', 'scale', 2)])
      ],
      { sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')] }
    )
    expect(resolve('value:defense', session)).toEqual(resolve('value:defense', session))
  })
})

describe('conditional Modifiers', () => {
  const conditional = () => [
    valueDefinition('value:defense', { default: 10 }),
    valueDefinition('value:might'),
    source('source:rage', [
      modifier('value:defense', 'add', 2, { condition: expression('@value:might > 10') })
    ])
  ]

  it('a modifier is excluded when its condition does not hold', () => {
    const session = buildSession(conditional(), { sources: [instance('si-1', 'source:rage')] })
    expect(resolve('value:defense', session, false)).toEqual([])
  })

  it('a non-boolean condition result aborts resolution with a RulesError, not an empty list (§16.11A, revision 3)', () => {
    // Pre-revision-3 behavior silently excluded the modifier here (an
    // empty array). Revision 3 (ADR-022) makes this a resolution FAILURE:
    // EEL has no truthiness, so a non-boolean condition result is an
    // authoring mistake, not an eligibility answer, and must propagate.
    const session = buildSession(conditional(), { sources: [instance('si-1', 'source:rage')] })
    const result = resolve('value:defense', session, 1)
    expect(result).not.toEqual([])
    expect(Array.isArray(result)).toBe(false)
    expect(result).toMatchObject({ definitionId: 'source:rage', reason: 'modifier-condition-not-boolean' })
    expect((result as { message: string }).message).toContain('boolean')
  })

  it('a modifier with no condition is unconditionally applicable', () => {
    const session = buildSession(
      [valueDefinition('value:defense'), source('source:plate', [modifier('value:defense', 'add', 3)])],
      { sources: [instance('si-1', 'source:plate')] }
    )
    expect(resolve('value:defense', session)).toHaveLength(1)
  })

  it('a real condition reading actor state gates the modifier through the Evaluator', () => {
    const applied = buildSession(conditional(), {
      values: { 'value:might': 16 },
      sources: [instance('si-1', 'source:rage')]
    })
    expect(evaluate('value:defense', applied)).toBe(12)

    const notApplied = buildSession(conditional(), {
      values: { 'value:might': 4 },
      sources: [instance('si-1', 'source:rage')]
    })
    expect(evaluate('value:defense', notApplied)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Revision 3, commit 1: condition-result / error-propagation correction
// (rules-engine.md §16.11A, ADR-022). "False eligibility excludes;
// evaluation failure propagates." These exercise the change end to end,
// through evaluate() -- not just resolveActiveModifiers() in isolation --
// since the defect this corrects was specifically that a failure used to
// disappear before ever reaching the target Value.
// ---------------------------------------------------------------------------

describe('condition failure propagation (§16.11A, revision 3)', () => {
  it('a genuinely non-boolean condition result aborts target evaluation -- the target becomes an error, not the unmodified base', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        valueDefinition('value:might', { default: 5 }),
        source('source:rage', [modifier('value:defense', 'add', 2, { condition: expression('@value:might') })])
      ],
      { sources: [instance('si-1', 'source:rage')] }
    )
    // '@value:might' evaluates to the number 5 -- a well-formed, non-error,
    // non-boolean RuleValue. It must not be silently treated as "false".
    const result = evaluate('value:defense', session)
    expect(result).not.toBe(10) // not the unmodified base
    expect(result).not.toBe(12) // not silently applied either
    expect(result).toMatchObject({ reason: 'modifier-condition-not-boolean' })
  })

  it('an existing RulesError produced inside a condition propagates unchanged -- never read as "not true"', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:rage', [modifier('value:defense', 'add', 2, { condition: expression('@ctx:something') })])
      ],
      { sources: [instance('si-1', 'source:rage')] }
    )
    // '@ctx:something' is well-formed syntax that the evaluator does not
    // resolve (evaluateReference's namespace fallback) -- a genuine
    // RulesError, produced independently of this commit's change.
    const result = evaluate('value:defense', session)
    expect(result).not.toBe(10)
    // Attributed to the Source that owns the condition, not the target --
    // the same existing convention modifierValue() uses for value-expression
    // errors (evaluator.ts), unchanged by this commit.
    expect(result).toMatchObject({ definitionId: 'source:rage' })
    expect((result as { message: string }).message).toContain('ctx')
    // Not re-labelled as a boolean-context failure -- the original error's
    // own message survives untouched (ADR-022: enrich, never wrap).
    expect((result as { message: string }).message).not.toContain('modifier-condition-not-boolean')
  })

  it('a runtime dynamic cycle reached through a condition propagates as a visible error, never as a silently-excluded modifier', () => {
    // Mirrors rules-engine.md §16.13 example 8: value:guard's modifier
    // condition depends on value:morale, whose formula depends back on
    // value:guard -- a cycle that exists only once this Source is active.
    const session = buildSession(
      [
        valueDefinition('value:guard', { default: 10 }),
        valueDefinition('value:morale', { storage: 'derived', formula: expression('@value:guard') }),
        source('source:spell', [
          modifier('value:guard', 'add', 2, { condition: expression('@value:morale < 12') })
        ])
      ],
      { sources: [instance('si-1', 'source:spell')] }
    )
    const result = evaluate('value:guard', session)
    expect(result).not.toBe(10) // the cycle must not resolve as "condition false"
    expect((result as { message: string }).message).toContain('Runtime dependency cycle detected')
    expect((result as { message: string }).message).toContain('value:guard')
    expect((result as { message: string }).message).toContain('value:morale')
  })

  it('a successful boolean true condition still applies its modifier, unaffected by this change', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        valueDefinition('value:might', { default: 16 }),
        source('source:rage', [
          modifier('value:defense', 'add', 2, { condition: expression('@value:might > 10') })
        ])
      ],
      { sources: [instance('si-1', 'source:rage')] }
    )
    expect(evaluate('value:defense', session)).toBe(12)
  })

  it('a successful boolean false condition still excludes its modifier silently, unaffected by this change', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        valueDefinition('value:might', { default: 4 }),
        source('source:rage', [
          modifier('value:defense', 'add', 2, { condition: expression('@value:might > 10') })
        ])
      ],
      { sources: [instance('si-1', 'source:rage')] }
    )
    expect(evaluate('value:defense', session)).toBe(10)
  })

  it('a propagated condition error is memoized like any other RuleValue (§15.4) -- repeated reads return the same cached result', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        valueDefinition('value:might', { default: 5 }),
        source('source:rage', [modifier('value:defense', 'add', 2, { condition: expression('@value:might') })])
      ],
      { sources: [instance('si-1', 'source:rage')] }
    )
    expect(session.hasCached('value:defense')).toBe(false)
    const first = evaluate('value:defense', session)
    expect(session.hasCached('value:defense')).toBe(true)
    expect(session.getCached('value:defense')).toEqual(first)
    const second = evaluate('value:defense', session)
    expect(second).toEqual(first)
  })
})

describe('overlapping Modifiers', () => {
  it('several sources targeting the same Value in different phases all survive discovery', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:a', [modifier('value:defense', 'add', 2)]),
        source('source:b', [modifier('value:defense', 'scale', 2)]),
        source('source:c', [modifier('value:defense', 'set', 10)])
      ],
      {
        sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b'), instance('si-c', 'source:c')]
      }
    )
    expect(resolve('value:defense', session).map((entry) => entry.phase)).toEqual(['set', 'add', 'scale'])
  })
})

// ---------------------------------------------------------------------------
// Application, through the Evaluator (the pipeline itself computes nothing)
// ---------------------------------------------------------------------------

describe('stacking behavior defined by the architecture', () => {
  it('untyped add modifiers stack (sum), the §16.3 default for unknown types', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:a', [modifier('value:defense', 'add', 2)]),
        source('source:b', [modifier('value:defense', 'add', 3)])
      ],
      { sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')] }
    )
    expect(evaluate('value:defense', session)).toBe(15)
  })

  it('same-modifierType add modifiers also stack today, since no policy table can declare otherwise', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:a', [modifier('value:defense', 'add', 2, { modifierType: 'equipment' })]),
        source('source:b', [modifier('value:defense', 'add', 3, { modifierType: 'equipment' })])
      ],
      { sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')] }
    )
    expect(evaluate('value:defense', session)).toBe(15)
  })
})

describe('phase application through the Evaluator', () => {
  it('a derived base has add modifiers applied on top', () => {
    const session = buildSession(
      [
        valueDefinition('value:agility', { default: 14 }),
        valueDefinition('value:agility.mod', {
          storage: 'derived',
          formula: expression('floor((@value:agility - 10) / 2)')
        }),
        valueDefinition('value:guard', { storage: 'derived', formula: expression('10 + @value:agility.mod') }),
        source('source:hauberk', [modifier('value:guard', 'add', expression('2'), { modifierType: 'equipment' })])
      ],
      { sources: [instance('si-1', 'source:hauberk')] }
    )
    // The architecture's Appendix Package A: agility 14 -> mod 2 -> guard
    // base 12, +2 armour = 14 (its stated "Derived value:guard = 14").
    expect(evaluate('value:guard', session)).toBe(14)
  })

  it('phases apply in fixed order: set, then add, then scale, then final', () => {
    const session = buildSession(
      [
        valueDefinition('value:x', { default: 1 }),
        source('source:all', [
          modifier('value:x', 'scale', 2),
          modifier('value:x', 'add', 3),
          modifier('value:x', 'set', 10)
        ])
      ],
      { sources: [instance('si-1', 'source:all')] }
    )
    // set 10 -> add 3 = 13 -> scale 2 = 26
    expect(evaluate('value:x', session)).toBe(26)
  })

  it('final overrides everything, including a scale applied before it', () => {
    const session = buildSession(
      [
        valueDefinition('value:x', { default: 5 }),
        source('source:doom', [modifier('value:x', 'scale', 10), modifier('value:x', 'final', 0)])
      ],
      { sources: [instance('si-1', 'source:doom')] }
    )
    expect(evaluate('value:x', session)).toBe(0)
  })

  it('a modifier value expression is evaluated, not taken literally', () => {
    const session = buildSession(
      [
        valueDefinition('value:x', { default: 1 }),
        valueDefinition('value:bonus', { default: 7 }),
        source('source:a', [modifier('value:x', 'add', expression('@value:bonus'))])
      ],
      { sources: [instance('si-1', 'source:a')] }
    )
    expect(evaluate('value:x', session)).toBe(8)
  })

  it('a clamp-phase modifier yields a RulesError rather than guessing min vs max', () => {
    const session = buildSession(
      [valueDefinition('value:x', { default: 5 }), source('source:cap', [modifier('value:x', 'clamp', 30)])],
      { sources: [instance('si-1', 'source:cap')] }
    )
    const result = evaluate('value:x', session)
    expect(result).toMatchObject({ definitionId: 'value:x' })
    expect((result as { message: string }).message).toContain('clamp')
  })

  it('a Value with no active modifiers is unchanged', () => {
    const session = buildSession([valueDefinition('value:x', { default: 5 })])
    expect(evaluate('value:x', session)).toBe(5)
  })
})
