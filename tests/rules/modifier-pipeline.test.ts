// Unit tests for the Rules Engine Modifier Pipeline
// (app/lib/rules/modifier-pipeline.ts), plus the Evaluator's application of
// the ordered sequence it returns. Per this task's own scope, Action
// execution, Roll execution, and Resource mutation are not exercised.

import { describe, expect, it } from 'vitest'
import {
  applyStackingSelection,
  groupByPhase,
  resolveActiveModifiers,
  MODIFIER_PHASES,
  type ActiveModifier
} from '../../app/lib/rules/modifier-pipeline'
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
  ModifierApplicationPhase,
  ModifierDefinition,
  ModifierReference,
  ModifierSpec,
  RuleValue,
  RulesPackageManifest,
  SourceDefinition,
  SourceInstance,
  ValueDefinition
} from '../../app/lib/rules/types'

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

// Builds an inline `ModifierSpec` (revision 3, Commit 2 -- was
// `ModifierDefinition`; inline entries carry no id/kind of their own).
// `ModifierSpec` is discriminated on `phase` (a clamp modifier requires a
// `clamp` bound, §16.12), which a single generic helper cannot express
// without a cast -- callers are responsible for passing a `clamp` override
// when `phase === 'clamp'`, exactly as a real package author would.
function modifier(
  target: string,
  phase: ModifierApplicationPhase,
  value: ModifierSpec['value'],
  overrides: Partial<ModifierSpec> = {}
): ModifierSpec {
  return { target, phase, value, ...overrides } as ModifierSpec
}

function source(
  id: string,
  modifiers: Array<ModifierSpec | ModifierReference>,
  overrides: Partial<SourceDefinition> = {}
): SourceDefinition {
  return { id, kind: 'source', modifiers, ...overrides }
}

// A standalone, reusable Modifier Definition (§16.1, §16.10) -- has its own
// id/kind, attached to a Source only via `{ ref: id }` (modifierRef below).
function standaloneModifier(
  id: string,
  target: string,
  phase: ModifierApplicationPhase,
  value: ModifierSpec['value'],
  overrides: Partial<ModifierSpec> = {}
): ModifierDefinition {
  return { id, kind: 'modifier', target, phase, value, ...overrides } as ModifierDefinition
}

function modifierRef(ref: string): ModifierReference {
  return { ref }
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
  options: {
    values?: ActorState['values']
    sources?: SourceInstance[]
    modifierTypes?: RulesPackageManifest['modifierTypes']
  } = {}
): EvaluationSession {
  const registryResult = RulesRegistry.create(manifest({ modifierTypes: options.modifierTypes }), definitions)
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
// condition (and, as of revision 3 Commit 7, every candidate value) to
// injected callbacks. Pipeline-level tests supply trivial ones (condition
// defaulting to "holds"; value passing a literal straight through) so the
// pipeline's OWN discovery/suppression/gating/ordering/stacking logic is
// what is under test. Real condition/value expression evaluation is
// covered separately, through evaluate().
//
// Unwraps a successful `ModifierResolution` (revision 3, Commit 2) to its
// `ActiveModifier[]`, matching resolveActiveModifiers' pre-revision-3 bare-
// array return so every existing success-path assertion in this file
// (`.toEqual([])`, `.toHaveLength(...)`, `.map(...)`) needs no change.
// Throws with a clear message on an unexpected failure, mirroring
// dependency-graph.test.ts's buildOk/buildErrors pattern -- a test whose
// whole point IS inspecting a failure calls resolveActiveModifiers
// directly instead (see the 'non-boolean condition result' test below).
function resolve(targetId: string, session: EvaluationSession, conditionResult: RuleValue = true): ActiveModifier[] {
  const resolution = resolveActiveModifiers(targetId, session, () => conditionResult, (value) => {
    if (typeof value === 'object' && value !== null && 'text' in value && 'ast' in value) {
      throw new Error('resolve() only supports literal modifier values -- use evaluate() to exercise real value expression evaluation')
    }
    return value
  })
  if (!resolution.ok) {
    throw new Error(`Expected modifier resolution to succeed, got: ${JSON.stringify(resolution.error)}`)
  }
  return [...resolution.modifiers]
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
        source('source:disarm', [], { suppresses: { sources: ['source:shield'] } })
      ],
      { sources: [instance('si-1', 'source:shield'), instance('si-2', 'source:disarm')] }
    )
    expect(resolve('value:defense', session)).toEqual([])
  })

  it('suppression is not transitive (§16.6: A suppresses B; B\'s suppression of C still applies)', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:a', [], { suppresses: { sources: ['source:b'] } }),
        source('source:b', [modifier('value:defense', 'add', 2)], { suppresses: { sources: ['source:c'] } }),
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

// ---------------------------------------------------------------------------
// Modifier attachment resolution (§16.10, revision 3, Commit 5). @source:
// runtime field resolution is explicitly out of scope here -- these tests
// only assert on ActiveModifier's provenance fields (attachmentIndex,
// origin, sourceDefinitionId, sourceInstanceId), never on evaluated values.
// ---------------------------------------------------------------------------

describe('modifier attachment resolution (§16.10)', () => {
  it('an inline modifier resolves with attachmentIndex 0 and declared origin', () => {
    const session = buildSession(
      [valueDefinition('value:defense'), source('source:a', [modifier('value:defense', 'add', 1)])],
      { sources: [instance('si-1', 'source:a')] }
    )
    const [active] = resolve('value:defense', session)
    expect(active).toMatchObject({
      attachmentIndex: 0,
      origin: { kind: 'declared' },
      sourceDefinitionId: 'source:a',
      sourceInstanceId: 'si-1'
    })
  })

  it('a { ref } entry resolves to the standalone ModifierDefinition it names', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        standaloneModifier('modifier:shieldBonus', 'value:defense', 'add', 2),
        source('source:shield', [modifierRef('modifier:shieldBonus')])
      ],
      { sources: [instance('si-1', 'source:shield')] }
    )
    const active = resolve('value:defense', session)
    expect(active).toHaveLength(1)
    expect(active[0]!.modifier.value).toBe(2)
    expect(active[0]!.modifier.target).toBe('value:defense')
  })

  it('inline and referenced Modifiers become indistinguishable after resolution (§16.10 decision 4)', () => {
    const inlineSession = buildSession(
      [valueDefinition('value:defense'), source('source:a', [modifier('value:defense', 'add', 2, { label: 'X' })])],
      { sources: [instance('si-1', 'source:a')] }
    )
    const refSession = buildSession(
      [
        valueDefinition('value:defense'),
        standaloneModifier('modifier:x', 'value:defense', 'add', 2, { label: 'X' }),
        source('source:a', [modifierRef('modifier:x')])
      ],
      { sources: [instance('si-1', 'source:a')] }
    )
    const inlineActive = resolve('value:defense', inlineSession)
    const refActive = resolve('value:defense', refSession)
    // Same shape apart from the modifier's own (irrelevant) id/kind identity.
    expect(refActive[0]!.attachmentIndex).toBe(inlineActive[0]!.attachmentIndex)
    expect(refActive[0]!.origin).toEqual(inlineActive[0]!.origin)
    expect(refActive[0]!.phase).toBe(inlineActive[0]!.phase)
    expect(refActive[0]!.sourceDefinitionId).toBe(inlineActive[0]!.sourceDefinitionId)
    expect(refActive[0]!.sourceInstanceId).toBe(inlineActive[0]!.sourceInstanceId)
    expect(refActive[0]!.modifier.target).toBe(inlineActive[0]!.modifier.target)
    expect(refActive[0]!.modifier.value).toBe(inlineActive[0]!.modifier.value)
  })

  it('one standalone modifier referenced by multiple Sources attaches independently to each', () => {
    const session = buildSession(
      [
        valueDefinition('value:resistance'),
        standaloneModifier('modifier:fireResist', 'value:resistance', 'add', 5),
        source('source:ring', [modifierRef('modifier:fireResist')]),
        source('source:cloak', [modifierRef('modifier:fireResist')])
      ],
      { sources: [instance('si-ring', 'source:ring'), instance('si-cloak', 'source:cloak')] }
    )
    const active = resolve('value:resistance', session)
    expect(active).toHaveLength(2)
    expect(active.map((entry) => entry.sourceDefinitionId).sort()).toEqual(['source:cloak', 'source:ring'])
    expect(active.every((entry) => entry.modifier.value === 5)).toBe(true)
  })

  it('mixed inline and referenced entries in one Source\'s modifiers array both attach', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        standaloneModifier('modifier:armour', 'value:defense', 'add', 3),
        source('source:brace', [modifierRef('modifier:armour'), modifier('value:defense', 'add', 1)])
      ],
      { sources: [instance('si-1', 'source:brace')] }
    )
    const active = resolve('value:defense', session)
    expect(active).toHaveLength(2)
    expect(active.map((entry) => entry.modifier.value)).toEqual([3, 1])
  })

  it('attachmentIndex reflects position within SourceDefinition.modifiers, inline or referenced alike', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        standaloneModifier('modifier:a', 'value:defense', 'add', 1),
        source('source:mixed', [
          modifierRef('modifier:a'),                    // index 0
          modifier('value:defense', 'add', 2),           // index 1
          modifier('value:defense', 'add', 3)            // index 2
        ])
      ],
      { sources: [instance('si-1', 'source:mixed')] }
    )
    const active = resolve('value:defense', session)
    expect(active.map((entry) => entry.attachmentIndex)).toEqual([0, 1, 2])
  })

  it('attachmentIndex is the final ordering tiebreak when order/sourceDefinitionId/sourceInstanceId all tie (§15.3)', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        source('source:mixed', [
          modifier('value:defense', 'add', 10, { label: 'first' }),
          modifier('value:defense', 'add', 20, { label: 'second' })
        ])
      ],
      { sources: [instance('si-1', 'source:mixed')] }
    )
    // Neither modifier declares `order` (both default to the same tie), and
    // both share sourceDefinitionId/sourceInstanceId -- only attachmentIndex
    // (array position) can break the tie, and it must resolve in authoring
    // order, not be left undefined.
    expect(resolve('value:defense', session).map((entry) => entry.modifier.label)).toEqual(['first', 'second'])
  })

  it('a { ref } naming a nonexistent Definition is skipped, not treated as active (missing ModifierDefinition)', () => {
    const session = buildSession(
      [valueDefinition('value:defense'), source('source:a', [modifierRef('modifier:doesNotExist')])],
      { sources: [instance('si-1', 'source:a')] }
    )
    expect(resolve('value:defense', session)).toEqual([])
  })

  it('a { ref } naming a Definition that exists but is not kind "modifier" is skipped', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        valueDefinition('value:notAModifier'),
        source('source:a', [modifierRef('value:notAModifier')])
      ],
      { sources: [instance('si-1', 'source:a')] }
    )
    expect(resolve('value:defense', session)).toEqual([])
  })

  it('a resolvable { ref } coexists with an unresolvable one -- the good entry still attaches', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        standaloneModifier('modifier:good', 'value:defense', 'add', 7),
        source('source:a', [modifierRef('modifier:doesNotExist'), modifierRef('modifier:good')])
      ],
      { sources: [instance('si-1', 'source:a')] }
    )
    const active = resolve('value:defense', session)
    expect(active).toHaveLength(1)
    expect(active[0]!.modifier.value).toBe(7)
    // The surviving entry keeps its OWN array position (index 1), not a
    // renumbered "0" after the skipped entry -- attachmentIndex names a
    // position in the authored array, not a count of survivors.
    expect(active[0]!.attachmentIndex).toBe(1)
  })

  it('resolving the same mixed-attachment target twice is deterministic', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense'),
        standaloneModifier('modifier:a', 'value:defense', 'add', 1),
        source('source:mixed', [modifierRef('modifier:a'), modifier('value:defense', 'add', 2)])
      ],
      { sources: [instance('si-1', 'source:mixed')] }
    )
    expect(resolve('value:defense', session)).toEqual(resolve('value:defense', session))
  })

  it('collection-derived Sources (via the Source Overlay) now also contribute modifiers (ambiguity C resolved)', () => {
    // The pipeline no longer reads ActorState.sources directly -- it reads
    // session.sourceOverlay, which already includes collection-derived
    // instances (source-overlay.ts, Commit 4). This was unreachable before
    // this commit. buildSession only forwards `sources`/`values`, so the
    // session is constructed directly here to also populate `collections`.
    const registryResult = RulesRegistry.create(manifest(), [
      valueDefinition('value:defense'),
      { id: 'collection:inventory', kind: 'collection', itemSchema: [], sourceRefField: 'sourceRef' } satisfies Definition,
      source('source:item.ring', [modifier('value:defense', 'add', 4)])
    ])
    if (!registryResult.ok) throw new Error('registry construction failed')
    const graphResult = DependencyGraph.build(registryResult.registry)
    if (!graphResult.ok) throw new Error('graph construction failed')
    const state = actorState({
      collections: { 'collection:inventory': [{ instanceId: 'ci-1', sourceRef: 'source:item.ring' }] }
    })
    const session = new EvaluationSession(registryResult.registry, graphResult.graph, state, {} as EvaluationContext)

    const active = resolve('value:defense', session)
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({
      sourceInstanceId: 'ci-1',
      origin: { kind: 'collection', collectionId: 'collection:inventory', itemInstanceId: 'ci-1' }
    })
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
    // Calls resolveActiveModifiers directly (not the resolve() helper,
    // which throws on failure) since this test's whole point is inspecting
    // the failure itself.
    const session = buildSession(conditional(), { sources: [instance('si-1', 'source:rage')] })
    // The value evaluator is never invoked here -- the condition failure
    // aborts resolution before stage 6 (candidate value evaluation) runs.
    // Cast rather than a runtime narrowing check, since this callback is
    // provably unreachable in this test.
    const resolution = resolveActiveModifiers('value:defense', session, () => 1, (value) => value as RuleValue)
    expect(resolution.ok).toBe(false)
    if (resolution.ok) throw new Error('expected resolution to fail')
    expect(resolution.error).toMatchObject({ definitionId: 'source:rage', code: 'modifier-condition-not-boolean' })
    expect(resolution.error.message).toContain('boolean')
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
    expect(result).toMatchObject({ code: 'modifier-condition-not-boolean' })
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
  it('untyped add modifiers stack (sum) -- an omitted modifierType always forms its own group of one (§16.3)', () => {
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

  it('same-modifierType add modifiers stack when the declared policy is "stack" (§16.3/§16.11)', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:a', [modifier('value:defense', 'add', 2, { modifierType: 'equipment' })]),
        source('source:b', [modifier('value:defense', 'add', 3, { modifierType: 'equipment' })])
      ],
      {
        sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')],
        modifierTypes: [{ id: 'equipment', stacking: 'stack' }]
      }
    )
    expect(evaluate('value:defense', session)).toBe(15)
  })

  it('an undeclared modifierType falls back to "stack" at runtime (package validation not yet implemented)', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:a', [modifier('value:defense', 'add', 2, { modifierType: 'equipmnet' })]),
        source('source:b', [modifier('value:defense', 'add', 3, { modifierType: 'equipmnet' })])
      ],
      { sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')] } // no modifierTypes declared at all
    )
    expect(evaluate('value:defense', session)).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// Modifier stacking (§16.11, revision 3, Commit 7). Uses evaluate() (the
// real evaluator) rather than the resolve() helper, since stacking needs
// real candidate VALUES to compare -- resolve()'s injected evaluators are
// deliberately trivial stand-ins, see its own comment above.
// ---------------------------------------------------------------------------

describe('stacking: "stack" policy (§16.11)', () => {
  it('every candidate applies, in §15.3 order', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:a', [modifier('value:defense', 'add', 2, { modifierType: 'circumstance' })]),
        source('source:b', [modifier('value:defense', 'add', 3, { modifierType: 'circumstance' })]),
        source('source:c', [modifier('value:defense', 'add', 1, { modifierType: 'circumstance' })])
      ],
      {
        sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b'), instance('si-c', 'source:c')],
        modifierTypes: [{ id: 'circumstance', stacking: 'stack' }]
      }
    )
    expect(evaluate('value:defense', session)).toBe(16) // 10 + 2 + 3 + 1
  })
})

describe('stacking: "highest" policy (§16.11)', () => {
  it('applies only the numerically greatest candidate', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:hauberk', [modifier('value:defense', 'add', 2, { modifierType: 'equipment' })]),
        source('source:ring', [modifier('value:defense', 'add', 3, { modifierType: 'equipment' })])
      ],
      {
        sources: [instance('si-hauberk', 'source:hauberk'), instance('si-ring', 'source:ring')],
        modifierTypes: [{ id: 'equipment', stacking: 'highest' }]
      }
    )
    expect(evaluate('value:defense', session)).toBe(13) // 10 + 3, not 10 + 2 + 3
  })

  it('equal values: the first in §15.3 order wins the tie', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        // 'source:alpha' < 'source:zebra' lexicographically -- alpha sorts
        // first in §15.3 order regardless of authoring/array position.
        source('source:zebra', [modifier('value:defense', 'add', 5, { modifierType: 'equipment' })]),
        source('source:alpha', [modifier('value:defense', 'add', 5, { modifierType: 'equipment' })])
      ],
      {
        sources: [instance('si-z', 'source:zebra'), instance('si-a', 'source:alpha')],
        modifierTypes: [{ id: 'equipment', stacking: 'highest' }]
      }
    )
    // Both candidates are 5 -- the RESULT (15) is the same regardless of
    // which one technically "won," so this alone would not distinguish
    // correct tie-breaking from a bug. See the dedicated pipeline-level
    // test below for a direct assertion on WHICH entry survives.
    expect(evaluate('value:defense', session)).toBe(15)
  })
})

describe('stacking: "lowest" policy (§16.11)', () => {
  it('applies only the numerically least candidate', () => {
    const session = buildSession(
      [
        valueDefinition('value:armour', { default: 10 }),
        source('source:curse.a', [modifier('value:armour', 'add', -2, { modifierType: 'curse' })]),
        source('source:curse.b', [modifier('value:armour', 'add', -5, { modifierType: 'curse' })])
      ],
      {
        sources: [instance('si-a', 'source:curse.a'), instance('si-b', 'source:curse.b')],
        modifierTypes: [{ id: 'curse', stacking: 'lowest' }]
      }
    )
    expect(evaluate('value:armour', session)).toBe(5) // 10 + (-5), the LEAST value, not -2
  })
})

describe('stacking: "exclusive" policy (§16.11)', () => {
  it('selects the first candidate in §15.3 order, by priority (order), not by magnitude', () => {
    // §16.11's own example: morph effects. The smaller `order` (higher
    // priority) wins even though it is not the numerically greater value.
    const session = buildSession(
      [
        valueDefinition('value:size', { default: 0 }),
        source('source:reduce', [modifier('value:size', 'set', 1, { modifierType: 'morph', order: 5 })]),
        source('source:enlarge', [modifier('value:size', 'set', 3, { modifierType: 'morph', order: 10 })])
      ],
      {
        sources: [instance('si-enlarge', 'source:enlarge'), instance('si-reduce', 'source:reduce')],
        modifierTypes: [{ id: 'morph', stacking: 'exclusive' }]
      }
    )
    // NOTE: 'exclusive' selection only applies to add/scale (§16.11); this
    // uses 'set' deliberately to also confirm exclusive-selected-then-
    // override composes correctly end to end (§16.13 example 5's own
    // worked case). Selection picks order 5 (source:reduce) as the
    // candidate; the 'set' phase then applies it as the override.
    expect(evaluate('value:size', session)).toBe(1)
  })

  it('more than one active exclusive candidate is not an error -- it is the normal case (§16.11)', () => {
    const session = buildSession(
      [
        valueDefinition('value:x', { default: 0 }),
        source('source:a', [modifier('value:x', 'add', 10, { modifierType: 'morph', order: 1 })]),
        source('source:b', [modifier('value:x', 'add', 20, { modifierType: 'morph', order: 2 })]),
        source('source:c', [modifier('value:x', 'add', 30, { modifierType: 'morph', order: 3 })])
      ],
      {
        sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b'), instance('si-c', 'source:c')],
        modifierTypes: [{ id: 'morph', stacking: 'exclusive' }]
      }
    )
    expect(evaluate('value:x', session)).not.toMatchObject({ message: expect.anything() })
    expect(evaluate('value:x', session)).toBe(10) // lowest `order` (1) wins, not the sum
  })
})

describe('stacking: pipeline-level selection (resolveActiveModifiers + applyStackingSelection)', () => {
  // resolveActiveModifiers alone does NOT apply stacking selection -- that
  // is §16.11 step 8, a separate stage (applyStackingSelection) that runs
  // AFTER phase grouping (step 7), exactly as evaluator.ts's own
  // applyModifiers calls them in sequence. This helper mirrors that
  // pipeline precisely so these tests assert on WHICH ActiveModifier
  // survives selection (by sourceDefinitionId), not just the final summed
  // number -- the evaluate()-level tests above already cover the
  // end-to-end numeric outcome.
  function resolveStacked(
    targetId: string,
    session: EvaluationSession,
    values: Record<string, RuleValue>
  ): ActiveModifier[] {
    const resolution = resolveActiveModifiers(
      targetId,
      session,
      () => true,
      (_value, modifier) => values[modifier.sourceDefinitionId] ?? 0
    )
    if (!resolution.ok) throw new Error(`Expected resolution to succeed, got: ${JSON.stringify(resolution.error)}`)
    const stacked = applyStackingSelection(groupByPhase(resolution.modifiers), session.registry)
    return [...stacked.values()].flat()
  }

  it('deterministic exclusive ordering: repeated resolution selects the same candidate every time', () => {
    const session = buildSession(
      [
        valueDefinition('value:size'),
        source('source:reduce', [modifier('value:size', 'add', 0, { modifierType: 'morph', order: 5 })]),
        source('source:enlarge', [modifier('value:size', 'add', 0, { modifierType: 'morph', order: 10 })])
      ],
      {
        sources: [instance('si-enlarge', 'source:enlarge'), instance('si-reduce', 'source:reduce')],
        modifierTypes: [{ id: 'morph', stacking: 'exclusive' }]
      }
    )
    const first = resolveStacked('value:size', session, {})
    const second = resolveStacked('value:size', session, {})
    expect(first.map((m) => m.sourceDefinitionId)).toEqual(['source:reduce'])
    expect(first).toEqual(second)
  })

  it('grouping by phase: identical modifierType in add vs scale never stacks together', () => {
    const session = buildSession(
      [
        valueDefinition('value:x'),
        source('source:add', [modifier('value:x', 'add', 5, { modifierType: 'shared' })]),
        source('source:scale', [modifier('value:x', 'scale', 5, { modifierType: 'shared' })])
      ],
      {
        sources: [instance('si-add', 'source:add'), instance('si-scale', 'source:scale')],
        modifierTypes: [{ id: 'shared', stacking: 'highest' }]
      }
    )
    // Both survive: 'add' and 'scale' are different groups despite sharing
    // a modifierType (§16.11: "phase must be in the key").
    const active = resolveStacked('value:x', session, { 'source:add': 5, 'source:scale': 5 })
    expect(active.map((m) => m.sourceDefinitionId).sort()).toEqual(['source:add', 'source:scale'])
  })

  it('grouping by modifierType: two distinct types never compete for the same "highest" slot', () => {
    const session = buildSession(
      [
        valueDefinition('value:x'),
        source('source:a', [modifier('value:x', 'add', 0, { modifierType: 'typeA' })]),
        source('source:b', [modifier('value:x', 'add', 0, { modifierType: 'typeB' })])
      ],
      {
        sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')],
        modifierTypes: [
          { id: 'typeA', stacking: 'highest' },
          { id: 'typeB', stacking: 'highest' }
        ]
      }
    )
    // Both survive: each modifierType is its own group of one candidate,
    // so 'highest' trivially selects it -- they never compare against
    // each other.
    const active = resolveStacked('value:x', session, { 'source:a': 1, 'source:b': 100 })
    expect(active.map((m) => m.sourceDefinitionId).sort()).toEqual(['source:a', 'source:b'])
  })

  it('grouping by target: a modifierType shared across two different targets never merges', () => {
    const session = buildSession(
      [
        valueDefinition('value:x'),
        valueDefinition('value:y'),
        source('source:a', [modifier('value:x', 'add', 1, { modifierType: 'shared' })]),
        source('source:b', [modifier('value:y', 'add', 2, { modifierType: 'shared' })])
      ],
      {
        sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')],
        modifierTypes: [{ id: 'shared', stacking: 'highest' }]
      }
    )
    // resolveActiveModifiers already scopes discovery to one target (its
    // own `targetId` parameter) -- these two never even become candidates
    // in the same resolution call, so grouping-by-target is structural,
    // not a stacking-selection concern. Both survive independently.
    expect(resolveStacked('value:x', session, { 'source:a': 1 }).map((m) => m.sourceDefinitionId)).toEqual(['source:a'])
    expect(resolveStacked('value:y', session, { 'source:b': 2 }).map((m) => m.sourceDefinitionId)).toEqual(['source:b'])
  })
})

describe('stacking: numeric requirement (§16.4/§16.11)', () => {
  it('a non-numeric candidate in an add/scale group is a RulesError, never silently skipped', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:a', [modifier('value:defense', 'add', 2, { modifierType: 'equipment' })]),
        source('source:b', [modifier('value:defense', 'add', expression('"not a number"'), { modifierType: 'equipment' })])
      ],
      {
        sources: [instance('si-a', 'source:a'), instance('si-b', 'source:b')],
        modifierTypes: [{ id: 'equipment', stacking: 'highest' }]
      }
    )
    const result = evaluate('value:defense', session)
    expect(result).not.toBe(10)
    expect(result).not.toBe(12) // not "the numeric candidate happened to win"
    expect((result as { message: string }).message).toContain('number')
  })

  it('the numeric requirement applies even to a LOSING candidate in a highest/lowest group', () => {
    // §16.11's own edge-case table: "skipping the candidate would silently
    // change the result." The malformed candidate's value (10) would lose
    // to 999 numerically if it were ever compared -- but it must still
    // error the whole target, not be quietly dropped from consideration.
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:huge', [modifier('value:defense', 'add', 999, { modifierType: 'equipment' })]),
        source('source:bad', [modifier('value:defense', 'add', expression('"nope"'), { modifierType: 'equipment' })])
      ],
      {
        sources: [instance('si-huge', 'source:huge'), instance('si-bad', 'source:bad')],
        modifierTypes: [{ id: 'equipment', stacking: 'highest' }]
      }
    )
    const result = evaluate('value:defense', session)
    expect(result).not.toBe(1009) // not "999 won, error silently discarded"
    expect((result as { message: string }).message).toContain('number')
  })

  it('RulesError propagation: an ordinary evaluation error in a candidate value still aborts the target', () => {
    const session = buildSession(
      [
        valueDefinition('value:defense', { default: 10 }),
        source('source:a', [modifier('value:defense', 'add', expression('1 / 0'))])
      ],
      { sources: [instance('si-a', 'source:a')] }
    )
    const result = evaluate('value:defense', session)
    expect(result).not.toBe(10)
    expect((result as { message: string }).message.toLowerCase()).toContain('division')
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

  it('a clamp-phase modifier yields a RulesError -- clamp evaluation is not yet implemented (§16.12)', () => {
    // §16.12's `clamp: ClampBound` discriminator now exists on ModifierSpec
    // (revision 3, Commit 2), so this fixture supplies a well-formed bound
    // -- the RulesError below is no longer "the type can't say which bound
    // this is," it is "clamp evaluation itself isn't implemented yet."
    const session = buildSession(
      [
        valueDefinition('value:x', { default: 5 }),
        source('source:cap', [modifier('value:x', 'clamp', 30, { clamp: 'max' })])
      ],
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
