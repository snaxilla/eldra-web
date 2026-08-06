// Unit tests for Rules Engine dependency graph construction
// (app/lib/rules/dependency-graph.ts). These assert on the public API
// (DependencyGraph.build and its instance methods) only. Per this task's
// own scope, cycles and ordering are not exercised here.

import { describe, expect, it } from 'vitest'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type { Definition, Expression, RulesPackageManifest, ValueDefinition } from '../../app/lib/rules/types'

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
