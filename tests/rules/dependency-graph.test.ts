// Unit tests for Rules Engine dependency graph construction
// (app/lib/rules/dependency-graph.ts). These assert on the public API
// (DependencyGraph.build and its instance methods) only. Per this task's
// own scope, cycles and ordering are not exercised here.

import { describe, expect, it } from 'vitest'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type {
  ActionCost,
  ActionDefinition,
  Definition,
  Expression,
  ModifierDefinition,
  ModifierReference,
  ModifierSpec,
  RollSpec,
  RulesPackageManifest,
  SourceDefinition,
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

function valueDefinition(id: string, formulaText?: string): ValueDefinition {
  return {
    id,
    kind: 'value',
    valueType: 'number',
    storage: formulaText ? 'derived' : 'stored',
    formula: formulaText ? expression(formulaText) : undefined
  }
}

// `ModifierDefinition` is discriminated on `phase` (revision 3, Commit 2 --
// a clamp Modifier must carry a `clamp` bound, §16.12). No call site in
// this file overrides `phase`, so the cast is a formality here, not a
// masked gap -- mirrors modifier-pipeline.test.ts's `modifier()` helper.
function modifierDefinition(
  id: string,
  target: string,
  overrides: Partial<ModifierSpec> = {}
): ModifierDefinition {
  return { id, kind: 'modifier', target, phase: 'add', value: 1, ...overrides } as ModifierDefinition
}

// Inline entries have no id/kind of their own (§16.1) -- ModifierSpec, not
// ModifierDefinition (revision 3, Commit 2's split). ModifierReference is
// included in the parameter type for shape-completeness with the real
// SourceDefinition.modifiers type, though no fixture in this file uses it.
function sourceDefinition(id: string, modifiers: Array<ModifierSpec | ModifierReference>): SourceDefinition {
  return { id, kind: 'source', modifiers }
}

function rollSpec(id: string): RollSpec {
  return { id, kind: 'roll', dice: expression('1d20'), successRule: { kind: 'atLeast' } }
}

function actionDefinition(
  id: string,
  overrides: Partial<Pick<ActionDefinition, 'roll' | 'costs'>> = {}
): ActionDefinition {
  return { id, kind: 'action', ...overrides }
}

function actionCost(resource: string, amountText = '1'): ActionCost {
  return { resource, amount: expression(amountText) }
}

function buildOk(definitions: Definition[]): DependencyGraph {
  const registryResult = RulesRegistry.create(manifest(), definitions)
  if (!registryResult.ok) {
    throw new Error(`Expected registry construction to succeed, got: ${JSON.stringify(registryResult.errors)}`)
  }
  const graphResult = DependencyGraph.build(registryResult.registry)
  if (!graphResult.ok) {
    throw new Error(`Expected graph construction to succeed, got: ${JSON.stringify(graphResult.errors)}`)
  }
  return graphResult.graph
}

function buildErrors(definitions: Definition[]) {
  const registryResult = RulesRegistry.create(manifest(), definitions)
  if (!registryResult.ok) {
    throw new Error(`Expected registry construction to succeed, got: ${JSON.stringify(registryResult.errors)}`)
  }
  const graphResult = DependencyGraph.build(registryResult.registry)
  if (graphResult.ok) {
    throw new Error('Expected graph construction to fail, but it succeeded')
  }
  return graphResult.errors
}

describe('isolated Definitions', () => {
  it('a single Definition with no formula has empty dependencies and dependents', () => {
    const graph = buildOk([valueDefinition('value:might')])
    expect(graph.getDependencies('value:might')).toEqual([])
    expect(graph.getDependents('value:might')).toEqual([])
    expect(graph.listNodes()).toEqual(['value:might'])
  })

  it('every Definition gets a node even with zero edges', () => {
    const graph = buildOk([valueDefinition('value:a'), valueDefinition('value:b')])
    expect(graph.has('value:a')).toBe(true)
    expect(graph.has('value:b')).toBe(true)
    expect(graph.getNode('value:a')).toEqual({ id: 'value:a', dependencies: [], dependents: [] })
  })
})

describe('linear chains', () => {
  it('a -> b -> c produces the expected forward and reverse edges', () => {
    const graph = buildOk([
      valueDefinition('value:a'),
      valueDefinition('value:b', '@value:a'),
      valueDefinition('value:c', '@value:b')
    ])
    expect(graph.getDependencies('value:c')).toEqual(['value:b'])
    expect(graph.getDependencies('value:b')).toEqual(['value:a'])
    expect(graph.getDependencies('value:a')).toEqual([])

    expect(graph.getDependents('value:a')).toEqual(['value:b'])
    expect(graph.getDependents('value:b')).toEqual(['value:c'])
    expect(graph.getDependents('value:c')).toEqual([])
  })
})

describe('branching dependencies', () => {
  it('one Definition depending on two others produces two outgoing edges', () => {
    const graph = buildOk([
      valueDefinition('value:a'),
      valueDefinition('value:b'),
      valueDefinition('value:root', '@value:a + @value:b')
    ])
    expect(graph.getDependencies('value:root')).toEqual(['value:a', 'value:b'])
    expect(graph.getDependents('value:a')).toEqual(['value:root'])
    expect(graph.getDependents('value:b')).toEqual(['value:root'])
  })
})

describe('shared dependencies', () => {
  it('two Definitions depending on the same target both appear as its dependents', () => {
    const graph = buildOk([
      valueDefinition('value:shared'),
      valueDefinition('value:x', '@value:shared'),
      valueDefinition('value:y', '@value:shared')
    ])
    expect(graph.getDependents('value:shared')).toEqual(['value:x', 'value:y'])
    expect(graph.getDependencies('value:x')).toEqual(['value:shared'])
    expect(graph.getDependencies('value:y')).toEqual(['value:shared'])
  })
})

describe('disconnected graphs', () => {
  it('two unrelated dependency chains coexist in one graph without cross-edges', () => {
    const graph = buildOk([
      valueDefinition('value:a1'),
      valueDefinition('value:a2', '@value:a1'),
      valueDefinition('value:b1'),
      valueDefinition('value:b2', '@value:b1')
    ])
    expect(graph.getDependencies('value:a2')).toEqual(['value:a1'])
    expect(graph.getDependencies('value:b2')).toEqual(['value:b1'])
    expect(graph.getDependents('value:a1')).toEqual(['value:a2'])
    expect(graph.getDependents('value:b1')).toEqual(['value:b2'])
    expect([...graph.listNodes()].sort()).toEqual(['value:a1', 'value:a2', 'value:b1', 'value:b2'])
  })
})

describe('duplicate edge suppression', () => {
  it('the same reference used twice in one formula produces exactly one edge', () => {
    const graph = buildOk([valueDefinition('value:a'), valueDefinition('value:b', '@value:a + @value:a')])
    expect(graph.getDependencies('value:b')).toEqual(['value:a'])
    expect(graph.getDependents('value:a')).toEqual(['value:b'])
  })

  it('the same reference appearing in two different formula fields still produces one edge', () => {
    const source: Definition = {
      id: 'source:brace',
      kind: 'source',
      modifiers: [
        { target: 'value:x', phase: 'add', value: expression('@value:a') },
        { target: 'value:x', phase: 'add', value: expression('@value:a'), condition: expression('@value:a > 0') }
      ]
    }
    const graph = buildOk([valueDefinition('value:a'), valueDefinition('value:x'), source])
    expect(graph.getDependencies('source:brace')).toEqual(['value:a'])
    expect(graph.getDependents('value:a')).toEqual(['source:brace'])
  })
})

describe('namespaces that never become graph edges', () => {
  it('@ctx/@sources/@world/@choice references produce no edges', () => {
    const graph = buildOk([valueDefinition('value:x', '@ctx:successes + toNumber(@sources) - toNumber(@choice:trained.climb) + @world:roadType.speedFactor')])
    expect(graph.getDependencies('value:x')).toEqual([])
  })

  it('a @world reference still produces no edges now that it resolves (world-configuration.md §F.9)', () => {
    // World Configuration Commit 1 gave @world real runtime semantics. It
    // must NOT have gained a graph edge with them: a trait is a session
    // constant, not a Definition node -- there is nothing to point an edge
    // at and nothing to invalidate within a session.
    const graph = buildOk([
      valueDefinition('value:x', '@world:rules.flanking'),
      valueDefinition('value:y', '@value:x + @world:roadType.quality')
    ])
    expect(graph.getDependencies('value:x')).toEqual([])
    expect(graph.getDependencies('value:y')).toEqual(['value:x'])
    expect(graph.getDependents('value:x')).toEqual(['value:y'])
  })
})

describe('deterministic graph construction', () => {
  it('building the same registry twice yields identical graphs', () => {
    const definitions = [
      valueDefinition('value:a'),
      valueDefinition('value:b', '@value:a'),
      valueDefinition('value:c', '@value:a + @value:b')
    ]
    const registryResult1 = RulesRegistry.create(manifest(), definitions)
    const registryResult2 = RulesRegistry.create(manifest(), definitions)
    if (!registryResult1.ok || !registryResult2.ok) throw new Error('registry construction failed')

    const graph1 = DependencyGraph.build(registryResult1.registry)
    const graph2 = DependencyGraph.build(registryResult2.registry)
    if (!graph1.ok || !graph2.ok) throw new Error('graph construction failed')

    expect(graph1.graph.listNodes()).toEqual(graph2.graph.listNodes())
    for (const id of graph1.graph.listNodes()) {
      expect(graph1.graph.getNode(id)).toEqual(graph2.graph.getNode(id))
    }
  })

  it('edge order reflects deterministic first-occurrence traversal', () => {
    const graph = buildOk([
      valueDefinition('value:z'),
      valueDefinition('value:a'),
      valueDefinition('value:m'),
      valueDefinition('value:root', '@value:z + @value:a + @value:m')
    ])
    expect(graph.getDependencies('value:root')).toEqual(['value:z', 'value:a', 'value:m'])
  })
})

describe('structural edges: modifier target direction', () => {
  it('a standalone modifier targeting a Value makes the Value depend on the modifier, not the reverse', () => {
    const graph = buildOk([valueDefinition('value:strength'), modifierDefinition('modifier:heroism', 'value:strength')])
    expect(graph.getDependencies('value:strength')).toEqual(['modifier:heroism'])
    expect(graph.getDependents('modifier:heroism')).toEqual(['value:strength'])
    // The inversion, stated explicitly: the modifier itself does not gain
    // the target as one of ITS dependencies merely because it targets it.
    expect(graph.getDependencies('modifier:heroism')).toEqual([])
    expect(graph.getDependents('value:strength')).toEqual([])
  })

  it('an inline modifier embedded in a Source attributes its target edge to the owning Source', () => {
    // No id/kind on the inline modifier -- matches the real authoring shape
    // (SourceDefinition.modifiers[] entries have no id of their own).
    const source = sourceDefinition('source:brace', [{ target: 'value:defense', phase: 'add', value: 1 }])
    const graph = buildOk([valueDefinition('value:defense'), source])
    expect(graph.getDependencies('value:defense')).toEqual(['source:brace'])
    expect(graph.getDependents('source:brace')).toEqual(['value:defense'])
  })
})

describe('structural edges: { ref } attachment (§16.10, revision 3, Commit 5)', () => {
  it('a { ref } entry adds source -> modifier, and the referenced modifier\'s own target -> source (§16.10 decision 8)', () => {
    // `modifier:armour` is ALSO a standalone top-level Definition, which
    // already (pre-revision-3, unchanged by this commit) gets its own
    // unconditional `target -> modifier` edge merely by existing --
    // "structural edges: modifier target direction" above covers that
    // case alone. Attaching it via { ref } adds two edges on top:
    // source -> modifier, and (mirroring an inline entry) target -> source.
    // All three coexist; this test isolates the two NEW ones.
    const graph = buildOk([
      valueDefinition('value:defense'),
      modifierDefinition('modifier:armour', 'value:defense'),
      sourceDefinition('source:brace', [{ ref: 'modifier:armour' }])
    ])
    // source -> modifier (new)
    expect(graph.getDependencies('source:brace')).toEqual(['modifier:armour'])
    // target -> source (new), alongside the pre-existing target -> modifier
    expect(graph.getDependencies('value:defense')).toEqual(expect.arrayContaining(['modifier:armour', 'source:brace']))
    expect(graph.getDependents('modifier:armour')).toEqual(expect.arrayContaining(['value:defense', 'source:brace']))
    expect(graph.getDependents('source:brace')).toEqual(expect.arrayContaining(['value:defense']))
  })

  it('the referenced modifier\'s own condition/value Expression dependencies remain visible on its own node', () => {
    const modifier = modifierDefinition('modifier:heroism', 'value:strength', {
      value: expression('@value:might'),
      condition: expression('@value:attackBonus > 0')
    })
    const graph = buildOk([
      valueDefinition('value:strength'),
      valueDefinition('value:might'),
      valueDefinition('value:attackBonus'),
      modifier,
      sourceDefinition('source:brace', [{ ref: 'modifier:heroism' }])
    ])
    expect(graph.getDependencies('modifier:heroism')).toEqual(['value:might', 'value:attackBonus'])
    expect(graph.getDependencies('source:brace')).toEqual(['modifier:heroism'])
  })

  it('mixed inline and referenced entries in one Source both contribute target -> source edges', () => {
    const graph = buildOk([
      valueDefinition('value:defense'),
      modifierDefinition('modifier:armour', 'value:defense'),
      sourceDefinition('source:brace', [
        { ref: 'modifier:armour' },
        { target: 'value:defense', phase: 'add', value: 1 }
      ])
    ])
    // Deduplicated to one target -> source edge regardless of how many of
    // the Source's entries target it (inline entry here, plus the
    // referenced one) -- alongside the standalone modifier's own
    // pre-existing direct edge (see the previous test's comment).
    expect(graph.getDependencies('value:defense')).toEqual(expect.arrayContaining(['modifier:armour', 'source:brace']))
    expect(graph.getDependencies('value:defense')).toHaveLength(2)
    expect(graph.getDependencies('source:brace')).toEqual(['modifier:armour'])
  })

  it('a { ref } naming a nonexistent Definition fails construction cleanly', () => {
    const errors = buildErrors([
      valueDefinition('value:defense'),
      sourceDefinition('source:brace', [{ ref: 'modifier:doesNotExist' }])
    ])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.message.includes('modifier:doesNotExist'))).toBe(true)
  })

  it('a { ref } naming a Definition that exists but is not kind "modifier" fails construction cleanly', () => {
    const errors = buildErrors([
      valueDefinition('value:defense'),
      valueDefinition('value:notAModifier'),
      sourceDefinition('source:brace', [{ ref: 'value:notAModifier' }])
    ])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.message.includes('not a Modifier'))).toBe(true)
  })

  it('a cycle routed entirely through a { ref }-attached modifier is fully represented in adjacency (§16.15 example 8)', () => {
    // value:strength -> source:brace -> modifier:heroism -> value:attackBonus
    // -> value:strengthModifier -> value:strength (plus the standalone
    // modifier's own pre-existing direct value:strength -> modifier:heroism
    // edge, which alone already made this a cycle even before { ref }
    // attachment existed -- the point of this test is that the NEW edges
    // do not break that existing detectability, not that they are what
    // first introduces it).
    const graph = buildOk([
      valueDefinition('value:attackBonus', '@value:strengthModifier'),
      valueDefinition('value:strengthModifier', '@value:strength'),
      valueDefinition('value:strength'),
      modifierDefinition('modifier:heroism', 'value:strength', { condition: expression('@value:attackBonus > 0') }),
      sourceDefinition('source:brace', [{ ref: 'modifier:heroism' }])
    ])
    expect(graph.getDependencies('value:attackBonus')).toEqual(['value:strengthModifier'])
    expect(graph.getDependencies('value:strengthModifier')).toEqual(['value:strength'])
    expect(graph.getDependencies('value:strength')).toEqual(expect.arrayContaining(['modifier:heroism', 'source:brace']))
    expect(graph.getDependencies('source:brace')).toEqual(['modifier:heroism'])
    expect(graph.getDependencies('modifier:heroism')).toEqual(['value:attackBonus'])
    // Not run here (cycle detection is a different module's job) -- this
    // only asserts the adjacency a future DFS would need to find it.
  })
})

describe('structural edges: modifier condition/value dependencies coexist with the inverted target edge', () => {
  it('a modifier with both a condition/value Expression dependency and a target produces both edges', () => {
    const modifier = modifierDefinition('modifier:heroism', 'value:strength', {
      value: expression('@value:might'),
      condition: expression('@value:attackBonus > 0')
    })
    const graph = buildOk([
      valueDefinition('value:strength'),
      valueDefinition('value:might'),
      valueDefinition('value:attackBonus'),
      modifier
    ])
    // The modifier's own outgoing edges: Expression-derived only (its
    // condition/value references), never its own target (that edge is
    // inverted onto the target, not attributed to the modifier itself).
    expect(graph.getDependencies('modifier:heroism')).toEqual(['value:might', 'value:attackBonus'])
    // The target's incoming edge: the modifier, via the inverted structural
    // edge -- independent of, and alongside, the modifier's own Expression
    // dependencies.
    expect(graph.getDependencies('value:strength')).toEqual(['modifier:heroism'])
  })
})

describe('structural edges: action -> roll dependency', () => {
  it('an Action with a roll depends on that Roll Spec', () => {
    const graph = buildOk([rollSpec('roll:attack'), actionDefinition('action:strike', { roll: 'roll:attack' })])
    expect(graph.getDependencies('action:strike')).toEqual(['roll:attack'])
    expect(graph.getDependents('roll:attack')).toEqual(['action:strike'])
  })
})

describe('structural edges: action -> resource dependency through costs', () => {
  it('an Action with a cost depends on that cost\'s Resource', () => {
    const graph = buildOk([
      valueDefinition('value:stress'),
      actionDefinition('action:rage', { costs: [actionCost('value:stress')] })
    ])
    expect(graph.getDependencies('action:rage')).toEqual(['value:stress'])
    expect(graph.getDependents('value:stress')).toEqual(['action:rage'])
  })

  it('multiple costs referencing the same Resource deduplicate to one edge', () => {
    const graph = buildOk([
      valueDefinition('value:stress'),
      actionDefinition('action:rage', {
        costs: [actionCost('value:stress', '1'), actionCost('value:stress', '2')]
      })
    ])
    expect(graph.getDependencies('action:rage')).toEqual(['value:stress'])
  })
})

describe('structural and Expression-derived edges converging on the same target deduplicate', () => {
  it('an Action whose roll id also appears via an Expression dependency still produces one edge', () => {
    // Roll Specs cannot themselves be @value:/@collection: referenced (no
    // such worked example exists), so this exercises convergence the
    // realistic way: an Action's prerequisite Expression and its own
    // `roll` field both pointing at the same Value/Resource-shaped target
    // is not representable (roll targets a RollSpec, prerequisites can
    // only reference @value:/@collection:) -- convergence is instead
    // exercised via cost + a prerequisite Expression both naming the same
    // Resource.
    const action: ActionDefinition = {
      id: 'action:rage',
      kind: 'action',
      costs: [actionCost('value:stress')],
      prerequisites: [expression('@value:stress > 0')]
    }
    const graph = buildOk([valueDefinition('value:stress'), action])
    expect(graph.getDependencies('action:rage')).toEqual(['value:stress'])
    expect(graph.getDependents('value:stress')).toEqual(['action:rage'])
  })
})

describe('structural edges fail cleanly on a missing target', () => {
  it('a modifier targeting a nonexistent Definition fails construction', () => {
    const errors = buildErrors([modifierDefinition('modifier:heroism', 'value:missing')])
    expect(errors).toEqual([
      {
        message: "Modifier 'modifier:heroism' targets 'value:missing', which does not exist in the registry",
        definitionId: 'modifier:heroism',
        dependencyKey: 'value:missing'
      }
    ])
  })

  it('an action referencing a nonexistent Roll fails construction', () => {
    const errors = buildErrors([actionDefinition('action:strike', { roll: 'roll:missing' })])
    expect(errors).toEqual([
      {
        message: "Action 'action:strike' uses Roll 'roll:missing', which does not exist in the registry",
        definitionId: 'action:strike',
        dependencyKey: 'roll:missing'
      }
    ])
  })

  it('an action cost referencing a nonexistent Resource fails construction', () => {
    const errors = buildErrors([actionDefinition('action:rage', { costs: [actionCost('value:missing')] })])
    expect(errors).toEqual([
      {
        message: "Action 'action:rage' has a cost referencing Resource 'value:missing', which does not exist in the registry",
        definitionId: 'action:rage',
        dependencyKey: 'value:missing'
      }
    ])
  })
})

describe('the four-node modifier-mediated cycle is fully represented in adjacency', () => {
  it('every edge of the cycle described in the task exists, in the correct direction', () => {
    // value:attackBonus -> value:strengthModifier -> value:strength
    // -> modifier:heroism -> value:attackBonus (via condition)
    const graph = buildOk([
      valueDefinition('value:attackBonus', '@value:strengthModifier'),
      valueDefinition('value:strengthModifier', '@value:strength'),
      valueDefinition('value:strength'),
      modifierDefinition('modifier:heroism', 'value:strength', {
        condition: expression('@value:attackBonus > 0')
      })
    ])

    expect(graph.getDependencies('value:attackBonus')).toEqual(['value:strengthModifier'])
    expect(graph.getDependencies('value:strengthModifier')).toEqual(['value:strength'])
    expect(graph.getDependencies('value:strength')).toEqual(['modifier:heroism'])
    expect(graph.getDependencies('modifier:heroism')).toEqual(['value:attackBonus'])

    // Not run here (cycle detection is a later commit's job) -- this only
    // asserts the adjacency a future DFS would need to actually find it.
  })
})

describe('fails cleanly when prerequisite validation has not succeeded', () => {
  it('a dependency that does not resolve in the registry fails construction with a collected error', () => {
    const registryResult = RulesRegistry.create(manifest(), [valueDefinition('value:b', '@value:missing')])
    if (!registryResult.ok) throw new Error('registry construction failed')

    const result = DependencyGraph.build(registryResult.registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toEqual([
        {
          message:
            "Definition 'value:b' depends on 'value:missing', which does not exist in the registry -- graph construction requires reference validation to have already passed",
          definitionId: 'value:b',
          dependencyKey: 'value:missing'
        }
      ])
    }
  })
})
