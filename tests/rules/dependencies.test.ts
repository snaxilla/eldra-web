// Unit tests for Rules Engine dependency extraction
// (app/lib/rules/dependencies.ts). These assert on the public API
// (extractDependencies) and structural result shape only.
//
// Most fixtures are parsed from real EEL text via parseExpression, matching
// tests/rules/parser.test.ts's convention. One scenario (a bracket-filtered
// collection reference immediately followed by a field-projecting `.path`,
// e.g. `@collection:equipment[weight > 0].weight`) is built as a hand-
// written AST literal instead: that exact surface syntax does not parse
// under the currently-committed grammar (parser.ts's `[predicate]` handling
// closes the call with `)` right after the bracket -- see the commit
// Summary's "Ambiguity" note), so it cannot be produced via parseExpression.
// Dependency extraction operates on RuleExpressionNode regardless of how
// that AST was produced, so testing it against a hand-built fixture is a
// correct, direct way to cover the extraction behavior the task's own
// example describes, independent of that unrelated parser gap.

import { describe, expect, it } from 'vitest'
import { extractDependencies, type Dependency } from '../../app/lib/rules/dependencies'
import { parseExpression } from '../../app/lib/rules/parser'
import type { RuleExpressionNode } from '../../app/lib/rules/ast'

function parseOk(text: string): RuleExpressionNode {
  const result = parseExpression(text)
  if (!result.ok) {
    throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
  }
  return result.ast
}

function deps(text: string): Dependency[] {
  return extractDependencies(parseOk(text))
}

function keys(text: string): string[] {
  return deps(text).map((d) => d.key)
}

describe('literals contribute no dependencies', () => {
  it('a bare number', () => {
    expect(deps('42')).toEqual([])
  })

  it('a bare string', () => {
    expect(deps('"hello"')).toEqual([])
  })

  it('a bare boolean', () => {
    expect(deps('true')).toEqual([])
  })

  it('an arithmetic expression over literals only', () => {
    expect(deps('(2 + 3) * 4')).toEqual([])
  })
})

describe('references', () => {
  it('a single value reference with a path', () => {
    expect(deps('@value:might')).toEqual([{ namespace: 'value', path: 'might', key: 'value:might' }])
  })

  it('a dotted reference path', () => {
    expect(deps('@value:might.mod')).toEqual([
      { namespace: 'value', path: 'might.mod', key: 'value:might.mod' }
    ])
  })

  it('a pathless reference (@sources)', () => {
    expect(deps('@sources')).toEqual([{ namespace: 'sources', path: undefined, key: 'sources' }])
  })

  it('every reference namespace is captured with its own key', () => {
    const ast: RuleExpressionNode = {
      kind: 'call',
      name: 'concat',
      args: [
        { kind: 'reference', namespace: 'value', path: 'might' },
        { kind: 'reference', namespace: 'collection', path: 'inventory' },
        { kind: 'reference', namespace: 'sources' },
        { kind: 'reference', namespace: 'choice', path: 'background' },
        { kind: 'reference', namespace: 'world', path: 'roadType.speedFactor' },
        { kind: 'reference', namespace: 'ctx', path: 'successes' }
      ]
    }
    expect(extractDependencies(ast)).toEqual([
      { namespace: 'value', path: 'might', key: 'value:might' },
      { namespace: 'collection', path: 'inventory', key: 'collection:inventory' },
      { namespace: 'sources', path: undefined, key: 'sources' },
      { namespace: 'choice', path: 'background', key: 'choice:background' },
      { namespace: 'world', path: 'roadType.speedFactor', key: 'world:roadType.speedFactor' },
      { namespace: 'ctx', path: 'successes', key: 'ctx:successes' }
    ])
  })
})

describe('nested expressions', () => {
  it('a reference nested inside unary, binary, and parenthesized arithmetic', () => {
    // floor((@value:might - 10) / 2) -- this task's own worked example.
    expect(keys('floor((@value:might - 10) / 2)')).toEqual(['value:might'])
  })

  it('two distinct references combined by a binary operator', () => {
    expect(keys('@value:rank * 6 + @value:hardiness.mod')).toEqual(['value:rank', 'value:hardiness.mod'])
  })

  it('unary minus over a reference', () => {
    expect(keys('-@value:might')).toEqual(['value:might'])
  })
})

describe('function calls', () => {
  it('collects references from every argument position', () => {
    expect(keys('clamp(@value:hp, 0, @value:maxHp)')).toEqual(['value:hp', 'value:maxHp'])
  })

  it('a call with zero arguments has no dependencies', () => {
    expect(deps('sqrt()')).toEqual([])
  })

  it('an unrecognized function name still yields the references inside it', () => {
    // Grammar-only, per parser.ts: `banana` is not a real function, but the
    // dependency walker does not care -- it only looks at node kinds, never
    // function names.
    expect(keys('banana(@value:x)')).toEqual(['value:x'])
  })

  it('a reference nested inside a call nested inside a call', () => {
    expect(keys('round(abs(@value:delta))')).toEqual(['value:delta'])
  })
})

describe('collection expressions', () => {
  it('a reference as the collection source', () => {
    // count(@sources[tag = "stressed"]) -- rules-engine.md §14.2's own
    // worked example.
    expect(keys('count(@sources[tag = "stressed"])')).toEqual(['sources'])
  })

  it('a bare field name inside the predicate is not itself a dependency', () => {
    // `weight` parses as a text literal (parser.ts's parseIdentifierAtom),
    // not a reference -- §14.7: "collection filters create a dependency on
    // the whole collection," not on fields mentioned inside the filter.
    expect(keys('any(@collection:equipment[weight > 0])')).toEqual(['collection:equipment'])
  })

  it('a reference nested inside the predicate contributes its own dependency', () => {
    expect(keys('count(@collection:inventory[tag = @choice:selectedTag])')).toEqual([
      'collection:inventory',
      'choice:selectedTag'
    ])
  })

  it('a reference nested inside the aggregate contributes its own dependency', () => {
    expect(keys('sum(@collection:inventory[equipped], "weightEach" * @value:loadFactor)')).toEqual([
      'collection:inventory',
      'value:loadFactor'
    ])
  })

  it('source, predicate, and aggregate references are all collected together', () => {
    // Hand-built fixture -- see the file header note on why this scenario
    // (matching the task's own `@collection:equipment[weight > 0].weight`
    // example in spirit: a filtered collection whose per-item aggregate
    // targets a specific field) is not round-tripped through the parser.
    const ast: RuleExpressionNode = {
      kind: 'collection',
      operation: 'sum',
      source: { kind: 'reference', namespace: 'collection', path: 'equipment' },
      predicate: {
        kind: 'binary',
        operator: '>',
        left: { kind: 'literal', valueType: 'text', value: 'weight' },
        right: { kind: 'literal', valueType: 'number', value: 0 }
      },
      aggregate: { kind: 'literal', valueType: 'text', value: 'weight' }
    }
    expect(extractDependencies(ast)).toEqual([
      { namespace: 'collection', path: 'equipment', key: 'collection:equipment' }
    ])
  })
})

describe('conditional expressions', () => {
  it('collects references from condition, whenTrue, and whenFalse', () => {
    // if(@value:hp <= 0, @value:deadLabel, @value:aliveLabel)
    expect(keys('if(@value:hp <= 0, @value:deadLabel, @value:aliveLabel)')).toEqual([
      'value:hp',
      'value:deadLabel',
      'value:aliveLabel'
    ])
  })

  it('branches with no references contribute nothing', () => {
    expect(keys('if(@value:hp <= 0, "Dead", "Alive")')).toEqual(['value:hp'])
  })
})

describe('lookup expressions', () => {
  it('collects the key reference but not the bare table DefinitionId', () => {
    // lookup(table:proficiency, @value:level) -- rules-engine.md §14.2.
    // table:proficiency is a bare DefinitionId, not a ReferenceExpressionNode
    // (ast.ts's LookupExpressionNode comment); see dependencies.ts's doc
    // comment for why this is a known, deliberate gap, not an oversight.
    expect(keys('lookup(table:proficiency, @value:level)')).toEqual(['value:level'])
  })
})

describe('dice construction', () => {
  it('a reference used as the dice count', () => {
    expect(keys('dice(@value:pool, 6)')).toEqual(['value:pool'])
  })

  it('a reference added to a literal dice roll', () => {
    // 2d6 + @value:might.mod
    expect(keys('2d6 + @value:might.mod')).toEqual(['value:might.mod'])
  })

  it('a literal NdF dice token alone has no dependencies', () => {
    expect(deps('2d6')).toEqual([])
  })
})

describe('duplicate references', () => {
  it('the same reference used twice is reported once', () => {
    expect(keys('@value:might + @value:might')).toEqual(['value:might'])
  })

  it('the same reference reached through different syntactic positions is still reported once', () => {
    expect(keys('if(@value:hp > 0, @value:hp, 0)')).toEqual(['value:hp'])
  })

  it('references that share a namespace but differ by path are distinct dependencies', () => {
    expect(keys('@value:might + @value:might.mod')).toEqual(['value:might', 'value:might.mod'])
  })
})

describe('deep nesting', () => {
  it('a reference buried under many layers of calls, arithmetic, and conditionals', () => {
    const text =
      'floor(if(@value:might > 10, (clamp(@value:might, 0, 20) - 10) / 2, abs(-@value:might)))'
    expect(keys(text)).toEqual(['value:might'])
  })

  it('several distinct references spread across a deeply nested tree, each reported once', () => {
    const text = 'sum(@collection:inventory[tag = @choice:activeTag], @value:weightPerItem * @world:loadScale)'
    expect(keys(text)).toEqual([
      'collection:inventory',
      'choice:activeTag',
      'value:weightPerItem',
      'world:loadScale'
    ])
  })
})

describe('unresolved nodes', () => {
  it('contribute no dependency edges (§14.12), even via their hint', () => {
    const ast: RuleExpressionNode = {
      kind: 'unresolved',
      reason: 'sheet-worker-logic',
      note: 'Derived from Roll20 worker on change:strength',
      hint: { text: 'floor((@value:strength - 10) / 2)', ast: { kind: 'literal', valueType: 'number', value: 0 } }
    }
    expect(extractDependencies(ast)).toEqual([])
  })
})

describe('determinism', () => {
  it('extracting from the same AST twice yields identical, order-stable results', () => {
    const ast = parseOk('sum(@collection:inventory[tag = @choice:activeTag], @value:weightPerItem * @world:loadScale)')
    const first = extractDependencies(ast)
    const second = extractDependencies(ast)
    expect(first).toEqual(second)
  })

  it('re-parsing identical text produces an identical dependency result', () => {
    const text = 'clamp(@value:hp, @value:minHp, @value:maxHp) + @ctx:bonus'
    const first = extractDependencies(parseOk(text))
    const second = extractDependencies(parseOk(text))
    expect(first).toEqual(second)
  })

  it('dependency order reflects first-occurrence traversal order, not insertion coincidence', () => {
    expect(keys('@ctx:z + @value:a + @ctx:z + @world:m')).toEqual(['ctx:z', 'value:a', 'world:m'])
  })
})
