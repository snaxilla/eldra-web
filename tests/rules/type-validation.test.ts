// Unit tests for Rules Engine type validation
// (app/lib/rules/type-validation.ts). These assert on the public API
// (validateExpressionType) only.

import { describe, expect, it } from 'vitest'
import { validateExpressionType } from '../../app/lib/rules/type-validation'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type { RuleExpressionNode } from '../../app/lib/rules/ast'
import type {
  CollectionDefinition,
  Definition,
  ResourceDefinition,
  RulesPackageManifest,
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

function valueDefinition(id: string, valueType: ValueDefinition['valueType'] = 'number'): ValueDefinition {
  return { id, kind: 'value', valueType, storage: 'stored' }
}

function resourceDefinition(id: string): ResourceDefinition {
  return { id, kind: 'resource', max: 10 }
}

function collectionDefinition(id: string, itemSchema: CollectionDefinition['itemSchema']): CollectionDefinition {
  return { id, kind: 'collection', itemSchema }
}

function registryWith(definitions: Definition[]): RulesRegistry {
  const result = RulesRegistry.create(manifest(), definitions)
  if (!result.ok) {
    throw new Error(`Expected registry construction to succeed, got: ${JSON.stringify(result.errors)}`)
  }
  return result.registry
}

function ast(text: string): RuleExpressionNode {
  const result = parseExpression(text)
  if (!result.ok) {
    throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
  }
  return result.ast
}

const emptyRegistry = registryWith([])

describe('valid arithmetic', () => {
  it('number + number', () => {
    expect(validateExpressionType(ast('2 + 3'), emptyRegistry)).toEqual({ type: 'number', diagnostics: [] })
  })

  it('text + text (concatenation)', () => {
    expect(validateExpressionType(ast('"a" + "b"'), emptyRegistry)).toEqual({ type: 'text', diagnostics: [] })
  })

  it('subtraction, multiplication, division of numbers', () => {
    expect(validateExpressionType(ast('(10 - 2) * 3 / 4'), emptyRegistry)).toEqual({ type: 'number', diagnostics: [] })
  })

  it('unary minus over a number', () => {
    expect(validateExpressionType(ast('-5'), emptyRegistry)).toEqual({ type: 'number', diagnostics: [] })
  })

  it("the architecture's own worked example", () => {
    const registry = registryWith([valueDefinition('value:might')])
    expect(validateExpressionType(ast('floor((@value:might - 10) / 2)'), registry)).toEqual({
      type: 'number',
      diagnostics: []
    })
  })
})

describe('invalid arithmetic', () => {
  it('number + text is rejected', () => {
    const result = validateExpressionType(ast('2 + "x"'), emptyRegistry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-operator-types',
        message: "'+' requires Number + Number or Text + Text",
        expected: 'number+number or text+text',
        actual: 'number+text'
      }
    ])
  })

  it('text - text is rejected (subtraction is number-only)', () => {
    const result = validateExpressionType(ast('"a" - "b"'), emptyRegistry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-operator-types',
        message: "'-' requires Number - Number",
        expected: 'number',
        actual: 'text'
      }
    ])
  })

  it('unary minus over text is rejected', () => {
    const result = validateExpressionType(ast('-"x"'), emptyRegistry)
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-operator-types',
        message: "Unary '-' requires a number operand",
        expected: 'number',
        actual: 'text'
      }
    ])
  })
})

describe('comparisons', () => {
  it('number < number is valid and produces boolean', () => {
    expect(validateExpressionType(ast('3 < 5'), emptyRegistry)).toEqual({ type: 'boolean', diagnostics: [] })
  })

  it('text = text is valid and produces boolean', () => {
    expect(validateExpressionType(ast('"clean" = "clean"'), emptyRegistry)).toEqual({
      type: 'boolean',
      diagnostics: []
    })
  })

  it('ordering comparison rejects non-number operands but still produces boolean', () => {
    const result = validateExpressionType(ast('"a" < "b"'), emptyRegistry)
    expect(result.type).toBe('boolean')
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-operator-types',
        message: "'<' requires number operands",
        expected: 'number',
        actual: 'text < text'
      }
    ])
  })

  it('equality comparison rejects mismatched operand types but still produces boolean', () => {
    const result = validateExpressionType(ast('5 = "five"'), emptyRegistry)
    expect(result.type).toBe('boolean')
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-operator-types',
        message: "'=' requires both operands to have the same type",
        expected: 'number',
        actual: 'text'
      }
    ])
  })
})

describe('conditionals', () => {
  it('branches of the same type produce that shared type', () => {
    const registry = registryWith([valueDefinition('value:hp')])
    expect(validateExpressionType(ast('if(@value:hp <= 0, "Dead", "Alive")'), registry)).toEqual({
      type: 'text',
      diagnostics: []
    })
  })

  it('branches of different types are rejected', () => {
    const result = validateExpressionType(ast('if(true, 1, "no")'), emptyRegistry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'conditional-branch-mismatch',
        message: 'if(...) branches must produce the same type',
        expected: 'number',
        actual: 'text'
      }
    ])
  })

  it('a non-boolean condition is rejected independently of branch agreement', () => {
    const result = validateExpressionType(ast('if(1, "a", "b")'), emptyRegistry)
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-function-argument-types',
        message: 'if(...) condition must be boolean',
        expected: 'boolean',
        actual: 'number'
      }
    ])
    expect(result.type).toBe('text')
  })
})

describe('nested expressions', () => {
  it('a diagnostic several levels deep still surfaces', () => {
    const result = validateExpressionType(ast('floor(1 + (2 * "x"))'), emptyRegistry)
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-operator-types',
        message: "'*' requires Number * Number",
        expected: 'number',
        actual: 'text'
      }
    ])
  })

  it('a well-typed deeply nested expression produces no diagnostics', () => {
    const registry = registryWith([valueDefinition('value:might')])
    const text = 'floor(if(@value:might > 10, (clamp(@value:might, 0, 20) - 10) / 2, abs(-@value:might)))'
    expect(validateExpressionType(ast(text), registry)).toEqual({ type: 'number', diagnostics: [] })
  })
})

describe('references', () => {
  it('a value reference resolves to its declared valueType', () => {
    const registry = registryWith([valueDefinition('value:hardiness.mod', 'boolean')])
    expect(validateExpressionType(ast('@value:hardiness.mod'), registry)).toEqual({
      type: 'boolean',
      diagnostics: []
    })
  })

  it('a reference to a Resource Definition is typed number', () => {
    const registry = registryWith([resourceDefinition('value:vigor')])
    expect(validateExpressionType(ast('@value:vigor'), registry)).toEqual({ type: 'number', diagnostics: [] })
  })

  it('an unresolvable reference is silently unknown -- not this pass\'s diagnostic to raise', () => {
    expect(validateExpressionType(ast('@value:doesNotExist'), emptyRegistry)).toEqual({
      type: undefined,
      diagnostics: []
    })
  })

  it('@ctx/@world/@sources/@choice references are silently unknown, not flagged', () => {
    expect(validateExpressionType(ast('@ctx:successes'), emptyRegistry)).toEqual({ type: undefined, diagnostics: [] })
    expect(validateExpressionType(ast('@world:roadType.speedFactor'), emptyRegistry)).toEqual({
      type: undefined,
      diagnostics: []
    })
    expect(validateExpressionType(ast('@choice:background'), emptyRegistry)).toEqual({
      type: undefined,
      diagnostics: []
    })
  })

  it('a @value: reference resolving to a non-value/resource Definition is flagged', () => {
    const registry = registryWith([{ id: 'value:strike', kind: 'action' }])
    const result = validateExpressionType(ast('@value:strike'), registry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'unknown-return-type',
        message: "Reference '@value:strike' resolves to a 'action' Definition, which has no expression value type",
        expected: 'value | resource',
        actual: 'action'
      }
    ])
  })
})

describe('function signatures', () => {
  it('floor(Number) -> Number', () => {
    expect(validateExpressionType(ast('floor(3.5)'), emptyRegistry)).toEqual({ type: 'number', diagnostics: [] })
  })

  it('floor(Text) is a diagnostic', () => {
    const result = validateExpressionType(ast('floor("x")'), emptyRegistry)
    expect(result.type).toBe('number')
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-function-argument-types',
        message: "'floor' argument 1 must be number",
        expected: 'number',
        actual: 'text'
      }
    ])
  })

  it('an incorrect argument count is flagged', () => {
    const result = validateExpressionType(ast('floor(1, 2)'), emptyRegistry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'incorrect-argument-count',
        message: "'floor' expects 1 argument, got 2",
        expected: '1 argument',
        actual: '2 arguments'
      }
    ])
  })

  it('pow(Number, Number) -> Number', () => {
    expect(validateExpressionType(ast('pow(2, 8)'), emptyRegistry)).toEqual({ type: 'number', diagnostics: [] })
  })

  it('clamp(Number, Number, Number) -> Number', () => {
    const registry = registryWith([valueDefinition('value:hp'), valueDefinition('value:maxHp')])
    expect(validateExpressionType(ast('clamp(@value:hp, 0, @value:maxHp)'), registry)).toEqual({
      type: 'number',
      diagnostics: []
    })
  })

  it('not(Boolean) -> Boolean', () => {
    expect(validateExpressionType(ast('not(true)'), emptyRegistry)).toEqual({ type: 'boolean', diagnostics: [] })
  })

  it('concat(Text, Text, ...) -> Text', () => {
    expect(validateExpressionType(ast('concat("a", "b", "c")'), emptyRegistry)).toEqual({
      type: 'text',
      diagnostics: []
    })
  })

  it('toNumber accepts any single argument and returns Number', () => {
    expect(validateExpressionType(ast('toNumber(true)'), emptyRegistry)).toEqual({ type: 'number', diagnostics: [] })
  })

  it('an unrecognized function name is flagged as unknown-return-type', () => {
    const result = validateExpressionType(ast('banana(2)'), emptyRegistry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'unknown-return-type',
        message: "'banana' is not part of the approved function whitelist (rules-engine.md §14.5); its return type cannot be determined",
        expected: 'a whitelisted function name',
        actual: 'banana'
      }
    ])
  })
})

describe('dice', () => {
  it('a literal NdF dice token is typed diceSpec', () => {
    expect(validateExpressionType(ast('2d6'), emptyRegistry)).toEqual({ type: 'diceSpec', diagnostics: [] })
  })

  it('dice(count, faces) with a reference count is typed diceSpec', () => {
    const registry = registryWith([valueDefinition('value:pool')])
    expect(validateExpressionType(ast('dice(@value:pool, 6)'), registry)).toEqual({
      type: 'diceSpec',
      diagnostics: []
    })
  })

  it('dice + reference addition composes to Number', () => {
    const registry = registryWith([valueDefinition('value:might.mod')])
    // 2d6 + @value:might.mod -- the architecture's own worked example. Dice
    // is its own type, not Number, so this exercises the same "everything
    // else -> diagnostic" arithmetic rule as any other type mismatch.
    const result = validateExpressionType(ast('2d6 + @value:might.mod'), registry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-operator-types',
        message: "'+' requires Number + Number or Text + Text",
        expected: 'number+number or text+text',
        actual: 'diceSpec+number'
      }
    ])
  })

  it('a non-numeric dice count is flagged but the node still types as diceSpec', () => {
    const result = validateExpressionType(ast('dice("x", 6)'), emptyRegistry)
    expect(result.type).toBe('diceSpec')
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-function-argument-types',
        message: 'dice(count, faces) requires a numeric count',
        expected: 'number',
        actual: 'text'
      }
    ])
  })

  it('keepHighest(diceSpec, Number) -> diceSpec', () => {
    expect(validateExpressionType(ast('keepHighest(dice(4, 6), 3)'), emptyRegistry)).toEqual({
      type: 'diceSpec',
      diagnostics: []
    })
  })
})

describe('collections', () => {
  const inventorySchema: CollectionDefinition['itemSchema'] = [
    { key: 'weightEach', valueType: 'number' },
    { key: 'quantity', valueType: 'number' },
    { key: 'equipped', valueType: 'boolean' },
    { key: 'tag', valueType: 'text' }
  ]

  it("the architecture's own sum/aggregate example type-checks as Number", () => {
    const registry = registryWith([collectionDefinition('collection:inventory', inventorySchema)])
    const result = validateExpressionType(
      ast('sum(@collection:inventory[equipped], "weightEach" * "quantity")'),
      registry
    )
    expect(result).toEqual({ type: 'number', diagnostics: [] })
  })

  it('count(source) -> Number, no aggregate required', () => {
    const registry = registryWith([collectionDefinition('collection:inventory', inventorySchema)])
    expect(validateExpressionType(ast('count(@collection:inventory[equipped])'), registry)).toEqual({
      type: 'number',
      diagnostics: []
    })
  })

  it('a numeric predicate over an unmodeled source (@sources) still type-checks', () => {
    // No item schema exists for @sources -- the bare identifier falls back
    // to ordinary text-literal typing, so a numeric predicate on it cannot
    // be verified either way; it is not rejected for that reason.
    const result = validateExpressionType(ast('count(@sources[tag = "stressed"])'), emptyRegistry)
    expect(result).toEqual({ type: 'number', diagnostics: [] })
  })

  it('sum requires an aggregate expression', () => {
    const registry = registryWith([collectionDefinition('collection:inventory', inventorySchema)])
    const result = validateExpressionType(ast('sum(@collection:inventory[equipped])'), registry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'incorrect-argument-count',
        message: "'sum' requires an aggregate expression identifying which item field to use",
        expected: '2 arguments (source, aggregate)',
        actual: '1 argument (source only)'
      }
    ])
  })

  it('sum with a non-numeric aggregate field is flagged', () => {
    const registry = registryWith([collectionDefinition('collection:inventory', inventorySchema)])
    const result = validateExpressionType(ast('sum(@collection:inventory, "tag")'), registry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-function-argument-types',
        message: "'sum' requires a numeric aggregate expression",
        expected: 'number',
        actual: 'text'
      }
    ])
  })

  it('any/all produce Boolean', () => {
    const registry = registryWith([collectionDefinition('collection:inventory', inventorySchema)])
    expect(validateExpressionType(ast('any(@collection:inventory[equipped])'), registry)).toEqual({
      type: 'boolean',
      diagnostics: []
    })
    expect(validateExpressionType(ast('all(@collection:inventory[equipped])'), registry)).toEqual({
      type: 'boolean',
      diagnostics: []
    })
  })

  it('first/filter have no representable RuleValueType and are flagged unknown-return-type', () => {
    const registry = registryWith([collectionDefinition('collection:inventory', inventorySchema)])
    const first = validateExpressionType(ast('first(@collection:inventory[equipped])'), registry)
    expect(first.type).toBeUndefined()
    expect(first.diagnostics[0]!.kind).toBe('unknown-return-type')

    const filtered = validateExpressionType(ast('filter(@collection:inventory[equipped])'), registry)
    expect(filtered.type).toBeUndefined()
    expect(filtered.diagnostics[0]!.kind).toBe('unknown-return-type')
  })
})

describe('lookup', () => {
  it("lookup's return type is unknown (Table is unmodeled) but produces no diagnostic", () => {
    const registry = registryWith([valueDefinition('value:level')])
    expect(validateExpressionType(ast('lookup(table:proficiency, @value:level)'), registry)).toEqual({
      type: undefined,
      diagnostics: []
    })
  })

  it("an internal error inside lookup's key expression still surfaces", () => {
    const result = validateExpressionType(ast('lookup(table:proficiency, 1 + "x")'), emptyRegistry)
    expect(result.type).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        kind: 'incompatible-operator-types',
        message: "'+' requires Number + Number or Text + Text",
        expected: 'number+number or text+text',
        actual: 'number+text'
      }
    ])
  })
})

describe('diagnostics', () => {
  it('every diagnostic states expected and actual', () => {
    const result = validateExpressionType(ast('2 + "x"'), emptyRegistry)
    for (const diagnostic of result.diagnostics) {
      expect(diagnostic.expected).toBeDefined()
      expect(diagnostic.actual).toBeDefined()
    }
  })

  it('location is always undefined today (no span-carrying AST yet)', () => {
    const result = validateExpressionType(ast('2 + "x"'), emptyRegistry)
    expect(result.diagnostics[0]!.location).toBeUndefined()
  })

  it('validating the same expression twice yields identical, deterministic results', () => {
    const registry = registryWith([valueDefinition('value:might')])
    const expression = ast('floor((@value:might - 10) / 2)')
    expect(validateExpressionType(expression, registry)).toEqual(validateExpressionType(expression, registry))
  })
})
