// Unit tests for the Eldra Expression Language parser
// (app/lib/rules/parser.ts). These assert on the parser's PUBLIC API
// (parseExpression) and structural AST shape only -- no internal parser
// state, no snapshots of the whole result where a targeted structural
// assertion is clearer.

import { describe, expect, it } from 'vitest'
import { parseExpression } from '../../app/lib/rules/parser'
import type { RuleExpressionNode } from '../../app/lib/rules/ast'

// Small helper: parse and assert success, returning the AST for further
// structural assertions. Fails loudly (with the diagnostic) if parsing
// unexpectedly failed, rather than a bare "expected true, got false".
function parseOk(text: string): RuleExpressionNode {
  const result = parseExpression(text)
  if (!result.ok) {
    throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
  }
  return result.ast
}

function numberLiteral(value: number) {
  return { kind: 'literal', valueType: 'number', value }
}

function textLiteral(value: string) {
  return { kind: 'literal', valueType: 'text', value }
}

function booleanLiteral(value: boolean) {
  return { kind: 'literal', valueType: 'boolean', value }
}

function valueRef(path?: string) {
  return path === undefined
    ? { kind: 'reference', namespace: 'value' }
    : { kind: 'reference', namespace: 'value', path }
}

describe('literals', () => {
  it('parses a number', () => {
    expect(parseOk('42')).toEqual(numberLiteral(42))
  })

  it('parses a decimal number', () => {
    expect(parseOk('3.5')).toEqual(numberLiteral(3.5))
  })

  it('parses a double-quoted string', () => {
    expect(parseOk('"hello"')).toEqual(textLiteral('hello'))
  })

  it('unescapes \\" and \\\\ inside a string', () => {
    expect(parseOk('"say \\"hi\\" \\\\ ok"')).toEqual(textLiteral('say "hi" \\ ok'))
  })

  it('parses the true keyword', () => {
    expect(parseOk('true')).toEqual(booleanLiteral(true))
  })

  it('parses the false keyword', () => {
    expect(parseOk('false')).toEqual(booleanLiteral(false))
  })

  it('treats a bare identifier as a text literal (item-field shorthand, §8.8)', () => {
    expect(parseOk('equipped')).toEqual(textLiteral('equipped'))
  })
})

describe('references (§8)', () => {
  it('parses @value:x with a single-segment path', () => {
    expect(parseOk('@value:might')).toEqual(valueRef('might'))
  })

  it('parses a multi-segment dotted path', () => {
    expect(parseOk('@value:hull.current')).toEqual(valueRef('hull.current'))
  })

  it('parses @world:x', () => {
    expect(parseOk('@world:roadType.speedFactor')).toEqual({
      kind: 'reference', namespace: 'world', path: 'roadType.speedFactor'
    })
  })

  it('parses @ctx:x', () => {
    expect(parseOk('@ctx:successes')).toEqual({ kind: 'reference', namespace: 'ctx', path: 'successes' })
  })

  it('parses @choice:x', () => {
    expect(parseOk('@choice:origin')).toEqual({ kind: 'reference', namespace: 'choice', path: 'origin' })
  })

  it('parses bare @sources with no path (§8.1)', () => {
    expect(parseOk('@sources')).toEqual({ kind: 'reference', namespace: 'sources', path: undefined })
  })

  it('parses bare @collection:x with no further path', () => {
    expect(parseOk('@collection:inventory')).toEqual({
      kind: 'reference', namespace: 'collection', path: 'inventory'
    })
  })

  it('rejects an unknown reference namespace as a syntax error', () => {
    const result = parseExpression('@banana:x')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics[0].message).toContain('Unknown reference namespace')
      expect(result.diagnostics[0].expected).toEqual(
        expect.arrayContaining(['value', 'collection', 'sources', 'choice', 'world', 'ctx'])
      )
    }
  })
})

describe('operators and precedence (§14)', () => {
  it('applies * before + (left-to-right precedence)', () => {
    expect(parseOk('1 + 2 * 3')).toEqual({
      kind: 'binary', operator: '+',
      left: numberLiteral(1),
      right: { kind: 'binary', operator: '*', left: numberLiteral(2), right: numberLiteral(3) }
    })
  })

  it('parentheses override precedence', () => {
    expect(parseOk('(1 + 2) * 3')).toEqual({
      kind: 'binary', operator: '*',
      left: { kind: 'binary', operator: '+', left: numberLiteral(1), right: numberLiteral(2) },
      right: numberLiteral(3)
    })
  })

  it('+ and - are left-associative', () => {
    expect(parseOk('10 - 3 - 2')).toEqual({
      kind: 'binary', operator: '-',
      left: { kind: 'binary', operator: '-', left: numberLiteral(10), right: numberLiteral(3) },
      right: numberLiteral(2)
    })
  })

  it('unary minus binds tighter than binary operators', () => {
    expect(parseOk('-2 + 3')).toEqual({
      kind: 'binary', operator: '+',
      left: { kind: 'unary', operator: '-', operand: numberLiteral(2) },
      right: numberLiteral(3)
    })
  })

  it('whitespace is insignificant (§5)', () => {
    expect(parseOk('1+2')).toEqual(parseOk('1 + 2'))
  })

  it('parses every comparison operator', () => {
    const cases: Array<[string, string]> = [
      ['1 = 2', '='], ['1 != 2', '!='], ['1 < 2', '<'],
      ['1 <= 2', '<='], ['1 > 2', '>'], ['1 >= 2', '>=']
    ]
    for (const [text, operator] of cases) {
      expect(parseOk(text)).toEqual({
        kind: 'binary', operator, left: numberLiteral(1), right: numberLiteral(2)
      })
    }
  })

  it('rejects chained comparisons (§3.2 -- non-associative)', () => {
    const result = parseExpression('1 < 2 < 3')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics[0].message.toLowerCase()).toContain('chain')
    }
  })
})

describe('function calls (§4)', () => {
  it('parses the canonical floor((@value:might - 10) / 2) example', () => {
    expect(parseOk('floor((@value:might - 10) / 2)')).toEqual({
      kind: 'call',
      name: 'floor',
      args: [{
        kind: 'binary', operator: '/',
        left: { kind: 'binary', operator: '-', left: valueRef('might'), right: numberLiteral(10) },
        right: numberLiteral(2)
      }]
    })
  })

  it('parses a call with zero arguments', () => {
    // sqrt (not one of the collection-operation keywords, which
    // structurally require a source argument) genuinely accepts zero args.
    expect(parseOk('sqrt()')).toEqual({ kind: 'call', name: 'sqrt', args: [] })
  })

  it('parses multiple comma-separated arguments', () => {
    expect(parseOk('max(1, 2, 3)')).toEqual({
      kind: 'call', name: 'max',
      args: [numberLiteral(1), numberLiteral(2), numberLiteral(3)]
    })
  })

  it('allows an unrecognized function name -- grammar only, not semantics (task spec)', () => {
    expect(parseOk('banana(2)')).toEqual({ kind: 'call', name: 'banana', args: [numberLiteral(2)] })
  })

  it('allows unrestricted nesting', () => {
    const ast = parseOk('floor(toNumber(concat("a", "b")))') as any
    expect(ast.kind).toBe('call')
    expect(ast.name).toBe('floor')
    expect(ast.args[0].kind).toBe('call')
    expect(ast.args[0].name).toBe('toNumber')
    expect(ast.args[0].args[0]).toEqual({ kind: 'call', name: 'concat', args: [textLiteral('a'), textLiteral('b')] })
  })

  it('parses logical and/or/not as ordinary function calls, not operators', () => {
    expect(parseOk('and(true, not(false))')).toEqual({
      kind: 'call', name: 'and',
      args: [booleanLiteral(true), { kind: 'call', name: 'not', args: [booleanLiteral(false)] }]
    })
  })
})

describe('conditional expressions (§7)', () => {
  it('parses the canonical if(condition, a, b) example', () => {
    expect(parseOk('if(@value:hp <= 0, "Dead", "Alive")')).toEqual({
      kind: 'conditional',
      condition: { kind: 'binary', operator: '<=', left: valueRef('hp'), right: numberLiteral(0) },
      whenTrue: textLiteral('Dead'),
      whenFalse: textLiteral('Alive')
    })
  })

  it('allows nested conditionals', () => {
    const ast = parseOk('if(true, if(false, 1, 2), 3)') as any
    expect(ast.kind).toBe('conditional')
    expect(ast.whenTrue).toEqual({ kind: 'conditional', condition: booleanLiteral(false), whenTrue: numberLiteral(1), whenFalse: numberLiteral(2) })
  })
})

describe('collection expressions (§8.8, §8.9)', () => {
  it('parses sum(...) with a bracket predicate and a multiplied aggregate', () => {
    expect(parseOk('sum(@collection:inventory[equipped], "weightEach" * "quantity")')).toEqual({
      kind: 'collection',
      operation: 'sum',
      source: { kind: 'reference', namespace: 'collection', path: 'inventory' },
      predicate: textLiteral('equipped'),
      aggregate: { kind: 'binary', operator: '*', left: textLiteral('weightEach'), right: textLiteral('quantity') }
    })
  })

  it('parses count(...) with a comparison predicate and no aggregate', () => {
    expect(parseOk('count(@sources[tag = "stressed"])')).toEqual({
      kind: 'collection',
      operation: 'count',
      source: { kind: 'reference', namespace: 'sources', path: undefined },
      predicate: { kind: 'binary', operator: '=', left: textLiteral('tag'), right: textLiteral('stressed') },
      aggregate: undefined
    })
  })

  it('parses a collection operation with no predicate at all', () => {
    expect(parseOk('count(@sources)')).toEqual({
      kind: 'collection', operation: 'count',
      source: { kind: 'reference', namespace: 'sources', path: undefined },
      predicate: undefined, aggregate: undefined
    })
  })

  it('rejects [predicate] used outside a collection operation call (§8.8 scoping)', () => {
    const result = parseExpression('floor(@collection:x[equipped])')
    expect(result.ok).toBe(false)
  })
})

describe('lookup expressions (§8.9)', () => {
  it('parses lookup(table:slug, key)', () => {
    expect(parseOk('lookup(table:proficiency, @value:level)')).toEqual({
      kind: 'lookup', table: 'table:proficiency', key: valueRef('level')
    })
  })
})

describe('dice construction (§6)', () => {
  it('parses NdF shorthand', () => {
    expect(parseOk('2d6')).toEqual({
      kind: 'dice', count: numberLiteral(2), faces: numberLiteral(6)
    })
  })

  it('parses the general dice(count, faces) form', () => {
    expect(parseOk('dice(2, 6)')).toEqual({
      kind: 'dice', count: numberLiteral(2), faces: numberLiteral(6)
    })
  })

  it('NdF and dice(n, faces) desugar to the identical AST (§6)', () => {
    expect(parseOk('2d6')).toEqual(parseOk('dice(2, 6)'))
  })

  it('dice() accepts a referenced (non-literal) count -- the general form (§6)', () => {
    expect(parseOk('dice(@value:pool, 6)')).toEqual({
      kind: 'dice', count: valueRef('pool'), faces: numberLiteral(6)
    })
  })

  it('parses the canonical 2d6 + 3 -> Binary(Dice, Literal) shape', () => {
    expect(parseOk('2d6 + 3')).toEqual({
      kind: 'binary', operator: '+',
      left: { kind: 'dice', count: numberLiteral(2), faces: numberLiteral(6) },
      right: numberLiteral(3)
    })
  })

  it('does not lex 2day as a dice literal (§15 lexer note)', () => {
    // "2day" -> NUMBER(2) IDENTIFIER(day) -- two atoms with nothing
    // combining them is a syntax error (trailing input after "2").
    const result = parseExpression('2day')
    expect(result.ok).toBe(false)
  })
})

describe('malformed syntax', () => {
  it('reports unexpected EOF for empty input', () => {
    const result = parseExpression('')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics[0].message.toLowerCase()).toContain('end of input')
    }
  })

  it('reports unexpected EOF for a trailing operator', () => {
    const result = parseExpression('1 +')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics[0].message.toLowerCase()).toContain('end of input')
    }
  })

  it('reports a missing closing paren', () => {
    const result = parseExpression('(1 + 2')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics[0].message).toContain("')'")
    }
  })

  it('reports an unexpected token after a complete expression', () => {
    const result = parseExpression('1 2')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics[0].message).toContain('Unexpected token')
    }
  })

  it('reports an unexpected trailing comma in a call', () => {
    const result = parseExpression('max(1, 2,)')
    expect(result.ok).toBe(false)
  })

  it('reports an unknown lexical token', () => {
    const result = parseExpression('1 $ 2')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics[0].message).toContain('Unknown lexical token')
      expect(result.diagnostics[0].token).toBe('$')
    }
  })

  it('reports an unterminated string literal', () => {
    const result = parseExpression('"unterminated')
    expect(result.ok).toBe(false)
  })

  it('reports a diagnostic with a span pointing at the offending token', () => {
    const result = parseExpression('1 + $')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const [diag] = result.diagnostics
      expect(diag.span).toEqual({ start: 4, end: 5 })
      expect(diag.token).toBe('$')
    }
  })

  it('does not throw for arbitrary garbage input', () => {
    expect(() => parseExpression(')))+++,,,')).not.toThrow()
  })
})
