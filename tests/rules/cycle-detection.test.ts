// Unit tests for Rules Engine static cycle detection
// (app/lib/rules/cycle-detection.ts). These assert on the public API
// (detectCycles) only. Per this task's own scope, topological ordering is
// not exercised here.

import { describe, expect, it } from 'vitest'
import { detectCycles } from '../../app/lib/rules/cycle-detection'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type { Definition, Expression, ModifierDefinition, RulesPackageManifest, ValueDefinition } from '../../app/lib/rules/types'

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

function modifierDefinition(id: string, target: string, conditionText?: string): ModifierDefinition {
  return { id, kind: 'modifier', target, phase: 'add', value: 1, condition: conditionText ? expression(conditionText) : undefined }
}

function graphOf(definitions: Definition[]): DependencyGraph {
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

describe('self cycle', () => {
  it('a Definition whose formula references itself is a one-node cycle', () => {
    const graph = graphOf([valueDefinition('value:x', '@value:x')])
    const result = detectCycles(graph)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.cycles).toEqual([{ path: ['value:x', 'value:x'] }])
    }
  })
})

describe('two-node cycle', () => {
  it('a -> b -> a is detected as a closed path', () => {
    const graph = graphOf([valueDefinition('value:a', '@value:b'), valueDefinition('value:b', '@value:a')])
    const result = detectCycles(graph)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.cycles).toHaveLength(1)
      const [cycle] = result.cycles
      expect(cycle!.path[0]).toBe(cycle!.path[cycle!.path.length - 1])
      expect(new Set(cycle!.path)).toEqual(new Set(['value:a', 'value:b']))
    }
  })
})

describe('three-node cycle', () => {
  it('a -> b -> c -> a is detected as one closed path covering all three nodes', () => {
    const graph = graphOf([
      valueDefinition('value:a', '@value:b'),
      valueDefinition('value:b', '@value:c'),
      valueDefinition('value:c', '@value:a')
    ])
    const result = detectCycles(graph)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.cycles).toHaveLength(1)
      const [cycle] = result.cycles
      expect(cycle!.path[0]).toBe(cycle!.path[cycle!.path.length - 1])
      expect(cycle!.path).toHaveLength(4)
      expect(new Set(cycle!.path)).toEqual(new Set(['value:a', 'value:b', 'value:c']))
    }
  })
})

describe('four-node modifier-mediated cycle', () => {
  it("the architecture's own worked example is detected via the inverted target edge", () => {
    // value:strength -> modifier:heroism -> value:attackBonus
    // -> value:strengthModifier -> value:strength
    const graph = graphOf([
      valueDefinition('value:attackBonus', '@value:strengthModifier'),
      valueDefinition('value:strengthModifier', '@value:strength'),
      valueDefinition('value:strength'),
      modifierDefinition('modifier:heroism', 'value:strength', '@value:attackBonus > 0')
    ])
    const result = detectCycles(graph)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.cycles).toHaveLength(1)
      const [cycle] = result.cycles
      expect(cycle!.path[0]).toBe(cycle!.path[cycle!.path.length - 1])
      expect(new Set(cycle!.path)).toEqual(
        new Set(['value:attackBonus', 'value:strengthModifier', 'value:strength', 'modifier:heroism'])
      )
    }
  })
})

describe('disconnected graph', () => {
  it('a cycle in one component does not prevent an unrelated acyclic component from passing', () => {
    const graph = graphOf([
      valueDefinition('value:a', '@value:b'),
      valueDefinition('value:b', '@value:a'),
      valueDefinition('value:x'),
      valueDefinition('value:y', '@value:x')
    ])
    const result = detectCycles(graph)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.cycles).toHaveLength(1)
      expect(new Set(result.cycles[0]!.path)).toEqual(new Set(['value:a', 'value:b']))
    }
  })

  it('a fully acyclic disconnected graph reports no cycles', () => {
    const graph = graphOf([
      valueDefinition('value:a1'),
      valueDefinition('value:a2', '@value:a1'),
      valueDefinition('value:b1'),
      valueDefinition('value:b2', '@value:b1')
    ])
    expect(detectCycles(graph)).toEqual({ ok: true })
  })
})

describe('shared dependency without cycle', () => {
  it('a diamond (two Definitions sharing one dependency) is not a false positive', () => {
    const graph = graphOf([
      valueDefinition('value:shared'),
      valueDefinition('value:x', '@value:shared'),
      valueDefinition('value:y', '@value:shared'),
      valueDefinition('value:root', '@value:x + @value:y')
    ])
    expect(detectCycles(graph)).toEqual({ ok: true })
  })
})

describe('multiple independent cycles', () => {
  it('two disjoint cycles in one package are both reported', () => {
    const graph = graphOf([
      valueDefinition('value:a', '@value:b'),
      valueDefinition('value:b', '@value:a'),
      valueDefinition('value:x', '@value:y'),
      valueDefinition('value:y', '@value:x')
    ])
    const result = detectCycles(graph)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.cycles).toHaveLength(2)
      const nodeSets = result.cycles.map((cycle) => new Set(cycle.path))
      expect(nodeSets).toContainEqual(new Set(['value:a', 'value:b']))
      expect(nodeSets).toContainEqual(new Set(['value:x', 'value:y']))
    }
  })

  it('overlapping back edges within one tangled component still produce distinct, non-duplicated reports', () => {
    // a -> b -> c -> a (3-cycle) and b -> a (direct 2-cycle): two real,
    // different-length cycles sharing nodes, not the same cycle discovered
    // twice.
    const graph = graphOf([
      valueDefinition('value:a', '@value:b'),
      valueDefinition('value:b', '@value:a + @value:c'),
      valueDefinition('value:c', '@value:a')
    ])
    const result = detectCycles(graph)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const nodeSets = result.cycles.map((cycle) => new Set(cycle.path))
      const uniqueNodeSets = new Set(nodeSets.map((set) => [...set].sort().join(',')))
      expect(uniqueNodeSets.size).toBe(result.cycles.length)
    }
  })
})

describe('deterministic diagnostics', () => {
  it('detecting cycles twice over the same graph yields identical results', () => {
    const graph = graphOf([
      valueDefinition('value:a', '@value:b'),
      valueDefinition('value:b', '@value:c'),
      valueDefinition('value:c', '@value:a')
    ])
    expect(detectCycles(graph)).toEqual(detectCycles(graph))
  })

  it('rebuilding an equivalent graph from scratch yields the same cycle report', () => {
    const definitions = [
      valueDefinition('value:a', '@value:b'),
      valueDefinition('value:b', '@value:a')
    ]
    const graph1 = graphOf(definitions)
    const graph2 = graphOf(definitions)
    expect(detectCycles(graph1)).toEqual(detectCycles(graph2))
  })
})
