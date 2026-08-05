// Rules Engine Type Validation.
// See .github/docs/architecture/rules-engine.md §14.3 (type system), §14.5
// (function whitelist), §14.6 (dice are values), §8.8-8.9 of
// expression-language.md (collection filter/aggregate item-field scoping),
// and this task's own worked examples for the design this implements.
//
// This module answers exactly what this task's RESPONSIBILITY section
// names: what type does an expression produce, are operators/function
// arguments legal, do conditional branches agree, does every function
// return a known type. It does NOT evaluate, does NOT fold constants, does
// NOT build a dependency graph, and does NOT re-validate reference
// existence (that is reference-validation.ts's job -- an unresolved
// reference here silently yields "type unknown," it does not produce a new
// diagnostic).
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS AND GAPS FOUND (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. RuleValueType (types.ts) cannot represent every expression shape.
//    rules-engine.md §14.3's full type system is "number, text, boolean,
//    enum<...>, ref, list<T>, diceSpec, error" -- but types.ts's own
//    RuleValueType (the authorable-field-type union this task explicitly
//    says every node must return) is narrower: 'number'|'text'|'boolean'|
//    'enum'|'ref'|'diceSpec', with no 'list' and no 'error' member. Three
//    concrete places this bites, all resolved the same way -- report
//    'unknown-return-type' (one of this task's own five diagnostic
//    categories was clearly built to hold exactly this) and propagate
//    `undefined` rather than inventing a member RuleValueType doesn't have:
//      - `filter(...)` and `first(...)` produce a collection/item-shaped
//        result, not a scalar.
//      - `lookup(...)`'s return type depends on a Table Definition's
//        declared value type, and Table is explicitly unmodeled (types.ts:
//        "Table, Progression, and ChoiceSet are deliberately NOT modeled").
//        Unlike filter/first, this is NOT flagged as a diagnostic -- see
//        decision 3 below on the distinction.
//      - `@world:x`, `@ctx:x`, `@sources`, `@choice:x` references (see
//        decision 3).
//
// 2. A Definition resolving to `kind: 'resource'` (ResourceDefinition) has
//    no `valueType` field at all -- §12.5 describes it as "declared sugar
//    the loader expands into two Values," and no loader exists yet (this
//    task's own non-goal: "no package loading"). Since every worked
//    Resource example (health/mana/stamina-style pools) is a numeric
//    quantity, and `max: Expression | RuleValue` implies a numeric ceiling,
//    a reference resolving to a ResourceDefinition is typed 'number' here
//    -- an inferred convention, not a stated rule, flagged in the Summary.
//
// 3. Two different reasons a type can be "unknown," treated differently:
//      - A LEGITIMATE part of the language the current model simply
//        doesn't cover yet (@world/@ctx/@sources/@choice references,
//        lookup()'s return, an unresolved reference deferred to
//        reference-validation.ts) -- silently `undefined`, no diagnostic.
//        These are not authoring mistakes.
//      - Something that IS a genuine violation given what the model can
//        already check: an unrecognized function name (§14.5's whitelist
//        is closed and versioned), a `@value:`/`@collection:` reference
//        resolving to a Definition of the wrong kind, or filter/first's
//        structurally unrepresentable result -- these get an
//        'unknown-return-type' diagnostic.
//
// 4. Collection item-field scoping (expression-language.md §8.8-8.9): a
//    bare identifier (`equipped`, `tag`) or a string literal used inside a
//    CollectionExpressionNode's predicate/aggregate means "read this field
//    of the current item," reinterpreted from an ordinary
//    LiteralExpressionNode{valueType:'text'} -- both forms are IDENTICAL
//    once parsed (parser.ts's parseIdentifierAtom produces the exact same
//    node shape for a bare word as for a quoted string), so this module
//    resolves a text literal's *value* against the source collection's
//    itemSchema (CollectionDefinition.itemSchema, ./types.ts) when one is
//    known; a match yields that field's declared valueType, a non-match
//    stays an ordinary 'text' literal. This is necessary, not cosmetic:
//    the architecture's own canonical aggregate example,
//    `sum(@collection:inventory[equipped], "weightEach" * "quantity")`,
//    would otherwise type-check as Text * Text (illegal) instead of the
//    intended Number * Number. Item-schema resolution only happens when
//    the collection's `source` is literally a `@collection:x` reference
//    that resolves to a CollectionDefinition in the registry; any other
//    source shape (`@sources`, or anything else) falls back to ordinary
//    literal typing, since no item schema exists to check field names
//    against -- flagged as a known limitation in the Summary, not silently
//    assumed correct.
//
// 5. Collection operation semantics (§14.5's eight names, no other
//    signature detail given): `sum`/`max_of`/`min_of` require a numeric
//    aggregate argument (grounded -- every worked example includes one;
//    "sum" of nothing is not a coherent operation) and return 'number'.
//    `count` returns 'number', `any`/`all` return 'boolean' by definition
//    of what those words mean, none of the three require or forbid an
//    aggregate (the grammar already makes it optional for all eight ops
//    uniformly -- parser.ts's finishCollection -- and nothing in either
//    architecture document says count/any/all's optional aggregate is
//    disallowed, so it is not rejected here). `first`/`filter` are handled
//    per decision 1/3 above.
//
// 6. Collection predicates are NOT required to type as 'boolean', unlike
//    `if(...)`'s condition. §8.8's bare-field shorthand is described as
//    "where the current item's `equipped` field is truthy," and §14.4
//    establishes every type has its own "type-appropriate zero" (falsy
//    value) -- "truthy" is deliberately type-agnostic language, unlike
//    `if(...)`, where every worked example's condition is a genuine
//    boolean-producing comparison and no "truthy" framing appears anywhere.
//    Enforcing strict boolean on predicates would incorrectly reject a
//    legitimate bare-field predicate over a non-boolean field (e.g.
//    `[quantity]` meaning "where quantity is nonzero"), so this module
//    does not check predicate result type at all -- only that whatever is
//    inside it is itself internally well-typed.

import type {
  BinaryExpressionNode,
  CollectionExpressionNode,
  ConditionalExpressionNode,
  DiceExpressionNode,
  FunctionCallExpressionNode,
  ReferenceExpressionNode,
  RuleExpressionNode,
  UnaryExpressionNode
} from './ast'
import type { RulesRegistry } from './registry'
import type { CollectionFieldDefinition, RuleValueType } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type TypeDiagnosticKind =
  | 'incompatible-operator-types'
  | 'incompatible-function-argument-types'
  | 'incorrect-argument-count'
  | 'conditional-branch-mismatch'
  | 'unknown-return-type'

export type TypeDiagnostic = {
  kind: TypeDiagnosticKind
  message: string
  expected?: string
  actual?: string
  // Always undefined today: RuleExpressionNode carries no source position
  // once parsed (only parser.ts's Token/ParseDiagnostic do -- see
  // dependencies.ts's own prior note on this same limitation). Typed here
  // so a future span-carrying AST can populate it without an API change.
  location?: { start: number; end: number }
}

// `type` is the best-effort resulting RuleValueType (undefined when it
// cannot be determined -- see design decision 3). `diagnostics` is the
// list of genuine violations found; an expression with `diagnostics: []`
// is not rejected, regardless of whether `type` itself is undefined.
export type TypeValidationResult = {
  type: RuleValueType | undefined
  diagnostics: TypeDiagnostic[]
}

export function validateExpressionType(ast: RuleExpressionNode, registry: RulesRegistry): TypeValidationResult {
  const diagnostics: TypeDiagnostic[] = []
  const type = typeOf(ast, registry, undefined, diagnostics)
  return { type, diagnostics }
}

// ---------------------------------------------------------------------------
// Item-field scope (design decision 4)
// ---------------------------------------------------------------------------

type ItemScope = readonly CollectionFieldDefinition[] | undefined

function resolveItemScope(source: RuleExpressionNode, registry: RulesRegistry): ItemScope {
  if (source.kind !== 'reference' || source.namespace !== 'collection' || source.path === undefined) {
    return undefined
  }
  const definition = registry.getById(`collection:${source.path}`)
  if (!definition || definition.kind !== 'collection') return undefined
  return definition.itemSchema
}

// ---------------------------------------------------------------------------
// Core recursive walker
// ---------------------------------------------------------------------------

function typeOf(
  node: RuleExpressionNode,
  registry: RulesRegistry,
  itemScope: ItemScope,
  diagnostics: TypeDiagnostic[]
): RuleValueType | undefined {
  switch (node.kind) {
    case 'literal': {
      if (node.valueType === 'text' && itemScope) {
        const field = itemScope.find((f) => f.key === node.value)
        if (field) return field.valueType
      }
      return node.valueType
    }

    case 'reference':
      return typeOfReference(node, registry, diagnostics)

    case 'unary':
      return typeOfUnary(node, registry, itemScope, diagnostics)

    case 'binary':
      return typeOfBinary(node, registry, itemScope, diagnostics)

    case 'call':
      return typeOfCall(node, registry, itemScope, diagnostics)

    case 'conditional':
      return typeOfConditional(node, registry, itemScope, diagnostics)

    case 'collection':
      return typeOfCollection(node, registry, diagnostics)

    case 'lookup':
      // node.table is a bare DefinitionId, not modeled (Table is
      // unmodeled -- design decision 1); node.key is still walked so
      // internal errors inside it are still caught.
      typeOf(node.key, registry, itemScope, diagnostics)
      return undefined

    case 'dice':
      return typeOfDice(node, registry, itemScope, diagnostics)

    case 'unresolved':
      // §14.12 "type-checks as error" -- RuleValueType has no 'error'
      // member (design decision 1). Not diagnosed here: an unresolved
      // node is a translation gap already handled elsewhere (§11.8 blocks
      // it from publication independently), not an authoring mistake this
      // pass should flag.
      return undefined

    default: {
      const exhaustive: never = node
      return exhaustive
    }
  }
}

function typeOfReference(
  node: ReferenceExpressionNode,
  registry: RulesRegistry,
  diagnostics: TypeDiagnostic[]
): RuleValueType | undefined {
  if (node.namespace !== 'value' && node.namespace !== 'collection') {
    // sources / choice / world / ctx -- not type-modeled (design decision 3).
    return undefined
  }

  const id = node.path === undefined ? node.namespace : `${node.namespace}:${node.path}`
  const definition = registry.getById(id)
  if (!definition) {
    // Existence is reference-validation.ts's job; silently propagate
    // "unknown" rather than re-diagnosing non-existence here.
    return undefined
  }

  if (definition.kind === 'value') return definition.valueType
  if (definition.kind === 'resource') return 'number' // design decision 2

  diagnostics.push({
    kind: 'unknown-return-type',
    message: `Reference '@${node.namespace}${node.path ? ':' + node.path : ''}' resolves to a '${definition.kind}' Definition, which has no expression value type`,
    expected: 'value | resource',
    actual: definition.kind
  })
  return undefined
}

function typeOfUnary(
  node: UnaryExpressionNode,
  registry: RulesRegistry,
  itemScope: ItemScope,
  diagnostics: TypeDiagnostic[]
): RuleValueType | undefined {
  const operandType = typeOf(node.operand, registry, itemScope, diagnostics)

  if (node.operator !== '-') {
    diagnostics.push({
      kind: 'incompatible-operator-types',
      message: `Unknown unary operator '${node.operator}'`,
      expected: "'-'",
      actual: node.operator
    })
    return undefined
  }

  if (operandType === undefined) return undefined
  if (operandType !== 'number') {
    diagnostics.push({
      kind: 'incompatible-operator-types',
      message: "Unary '-' requires a number operand",
      expected: 'number',
      actual: operandType
    })
    return undefined
  }
  return 'number'
}

const NUMBER_ONLY_ARITHMETIC: readonly string[] = ['-', '*', '/']
const ORDERING_COMPARISON: readonly string[] = ['<', '<=', '>', '>=']
const EQUALITY_COMPARISON: readonly string[] = ['=', '!=']

function typeOfBinary(
  node: BinaryExpressionNode,
  registry: RulesRegistry,
  itemScope: ItemScope,
  diagnostics: TypeDiagnostic[]
): RuleValueType | undefined {
  const leftType = typeOf(node.left, registry, itemScope, diagnostics)
  const rightType = typeOf(node.right, registry, itemScope, diagnostics)
  const operator = node.operator

  if (operator === '+') {
    if (leftType === undefined || rightType === undefined) return undefined
    if (leftType === 'number' && rightType === 'number') return 'number'
    if (leftType === 'text' && rightType === 'text') return 'text'
    diagnostics.push({
      kind: 'incompatible-operator-types',
      message: "'+' requires Number + Number or Text + Text",
      expected: 'number+number or text+text',
      actual: `${leftType}+${rightType}`
    })
    return undefined
  }

  if (NUMBER_ONLY_ARITHMETIC.includes(operator)) {
    if (leftType === undefined || rightType === undefined) return undefined
    if (leftType === 'number' && rightType === 'number') return 'number'
    diagnostics.push({
      kind: 'incompatible-operator-types',
      message: `'${operator}' requires Number ${operator} Number`,
      expected: 'number',
      actual: leftType !== 'number' ? leftType : rightType
    })
    return undefined
  }

  // Comparisons unconditionally produce boolean (this task's own "Comparison
  // -> Boolean" rule) -- operand incompatibility is reported as an
  // additional diagnostic, not a reason to withhold the result type.
  if (ORDERING_COMPARISON.includes(operator)) {
    const bothNumber = (leftType === undefined || leftType === 'number') && (rightType === undefined || rightType === 'number')
    if (!bothNumber) {
      diagnostics.push({
        kind: 'incompatible-operator-types',
        message: `'${operator}' requires number operands`,
        expected: 'number',
        actual: `${leftType ?? 'unknown'} ${operator} ${rightType ?? 'unknown'}`
      })
    }
    return 'boolean'
  }

  if (EQUALITY_COMPARISON.includes(operator)) {
    if (leftType !== undefined && rightType !== undefined && leftType !== rightType) {
      diagnostics.push({
        kind: 'incompatible-operator-types',
        message: `'${operator}' requires both operands to have the same type`,
        expected: leftType,
        actual: rightType
      })
    }
    return 'boolean'
  }

  diagnostics.push({
    kind: 'incompatible-operator-types',
    message: `Unknown binary operator '${operator}'`,
    expected: '+ - * / = != < <= > >=',
    actual: operator
  })
  return undefined
}

function typeOfConditional(
  node: ConditionalExpressionNode,
  registry: RulesRegistry,
  itemScope: ItemScope,
  diagnostics: TypeDiagnostic[]
): RuleValueType | undefined {
  const conditionType = typeOf(node.condition, registry, itemScope, diagnostics)
  if (conditionType !== undefined && conditionType !== 'boolean') {
    diagnostics.push({
      kind: 'incompatible-function-argument-types',
      message: 'if(...) condition must be boolean',
      expected: 'boolean',
      actual: conditionType
    })
  }

  const trueType = typeOf(node.whenTrue, registry, itemScope, diagnostics)
  const falseType = typeOf(node.whenFalse, registry, itemScope, diagnostics)

  if (trueType === undefined || falseType === undefined) return undefined
  if (trueType !== falseType) {
    diagnostics.push({
      kind: 'conditional-branch-mismatch',
      message: 'if(...) branches must produce the same type',
      expected: trueType,
      actual: falseType
    })
    return undefined
  }
  return trueType
}

function typeOfDice(
  node: DiceExpressionNode,
  registry: RulesRegistry,
  itemScope: ItemScope,
  diagnostics: TypeDiagnostic[]
): RuleValueType {
  const countType = typeOf(node.count, registry, itemScope, diagnostics)
  const facesType = typeOf(node.faces, registry, itemScope, diagnostics)

  if (countType !== undefined && countType !== 'number') {
    diagnostics.push({
      kind: 'incompatible-function-argument-types',
      message: 'dice(count, faces) requires a numeric count',
      expected: 'number',
      actual: countType
    })
  }
  if (facesType !== undefined && facesType !== 'number') {
    diagnostics.push({
      kind: 'incompatible-function-argument-types',
      message: 'dice(count, faces) requires numeric faces',
      expected: 'number',
      actual: facesType
    })
  }

  // Unconditional, matching Comparison's own "always produces its type"
  // shape -- "Dice remains a first-class type until evaluation" (this
  // task's own framing), regardless of whether count/faces validated.
  return 'diceSpec'
}

function typeOfCollection(
  node: CollectionExpressionNode,
  registry: RulesRegistry,
  diagnostics: TypeDiagnostic[]
): RuleValueType | undefined {
  const itemScope = resolveItemScope(node.source, registry)

  if (node.predicate) typeOf(node.predicate, registry, itemScope, diagnostics)
  const aggregateType = node.aggregate ? typeOf(node.aggregate, registry, itemScope, diagnostics) : undefined

  switch (node.operation) {
    case 'sum':
    case 'max_of':
    case 'min_of':
      if (!node.aggregate) {
        diagnostics.push({
          kind: 'incorrect-argument-count',
          message: `'${node.operation}' requires an aggregate expression identifying which item field to use`,
          expected: '2 arguments (source, aggregate)',
          actual: '1 argument (source only)'
        })
        return undefined
      }
      if (aggregateType !== undefined && aggregateType !== 'number') {
        diagnostics.push({
          kind: 'incompatible-function-argument-types',
          message: `'${node.operation}' requires a numeric aggregate expression`,
          expected: 'number',
          actual: aggregateType
        })
        return undefined
      }
      return 'number'

    case 'count':
      return 'number'

    case 'any':
    case 'all':
      return 'boolean'

    case 'first':
    case 'filter':
      diagnostics.push({
        kind: 'unknown-return-type',
        message: `'${node.operation}' produces a ${node.operation === 'first' ? 'collection item' : 'filtered collection'}-shaped result, which is not representable as a RuleValueType in the current model`,
        expected: 'a scalar RuleValueType',
        actual: node.operation === 'first' ? 'collection item' : 'collection'
      })
      return undefined

    default: {
      const exhaustive: never = node.operation
      return exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// Function whitelist signatures (§14.5)
// ---------------------------------------------------------------------------

function describeArity(min: number, max: number | undefined): string {
  if (max === undefined) return `at least ${min} argument${min === 1 ? '' : 's'}`
  if (min === max) return `${min} argument${min === 1 ? '' : 's'}`
  return `${min}-${max} arguments`
}

function requireArgCount(
  name: string,
  args: readonly unknown[],
  min: number,
  max: number | undefined,
  diagnostics: TypeDiagnostic[]
): boolean {
  if (args.length < min || (max !== undefined && args.length > max)) {
    diagnostics.push({
      kind: 'incorrect-argument-count',
      message: `'${name}' expects ${describeArity(min, max)}, got ${args.length}`,
      expected: describeArity(min, max),
      actual: `${args.length} argument${args.length === 1 ? '' : 's'}`
    })
    return false
  }
  return true
}

function requireArgType(
  name: string,
  argTypes: ReadonlyArray<RuleValueType | undefined>,
  index: number,
  expected: RuleValueType,
  diagnostics: TypeDiagnostic[]
): void {
  const actual = argTypes[index]
  if (actual !== undefined && actual !== expected) {
    diagnostics.push({
      kind: 'incompatible-function-argument-types',
      message: `'${name}' argument ${index + 1} must be ${expected}`,
      expected,
      actual
    })
  }
}

function typeOfCall(
  node: FunctionCallExpressionNode,
  registry: RulesRegistry,
  itemScope: ItemScope,
  diagnostics: TypeDiagnostic[]
): RuleValueType | undefined {
  const argTypes = node.args.map((arg) => typeOf(arg, registry, itemScope, diagnostics))
  const name = node.name

  switch (name) {
    case 'floor':
    case 'ceil':
    case 'round':
    case 'abs':
    case 'sqrt':
    case 'sign':
      if (!requireArgCount(name, node.args, 1, 1, diagnostics)) return undefined
      requireArgType(name, argTypes, 0, 'number', diagnostics)
      return 'number'

    case 'pow':
      if (!requireArgCount(name, node.args, 2, 2, diagnostics)) return undefined
      requireArgType(name, argTypes, 0, 'number', diagnostics)
      requireArgType(name, argTypes, 1, 'number', diagnostics)
      return 'number'

    case 'clamp':
      if (!requireArgCount(name, node.args, 3, 3, diagnostics)) return undefined
      argTypes.forEach((_, index) => requireArgType(name, argTypes, index, 'number', diagnostics))
      return 'number'

    case 'min':
    case 'max':
      if (!requireArgCount(name, node.args, 1, undefined, diagnostics)) return undefined
      argTypes.forEach((_, index) => requireArgType(name, argTypes, index, 'number', diagnostics))
      return 'number'

    case 'not':
      if (!requireArgCount(name, node.args, 1, 1, diagnostics)) return undefined
      requireArgType(name, argTypes, 0, 'boolean', diagnostics)
      return 'boolean'

    case 'and':
    case 'or':
      if (!requireArgCount(name, node.args, 1, undefined, diagnostics)) return undefined
      argTypes.forEach((_, index) => requireArgType(name, argTypes, index, 'boolean', diagnostics))
      return 'boolean'

    case 'concat':
      if (!requireArgCount(name, node.args, 1, undefined, diagnostics)) return undefined
      argTypes.forEach((_, index) => requireArgType(name, argTypes, index, 'text', diagnostics))
      return 'text'

    case 'lower':
    case 'upper':
      if (!requireArgCount(name, node.args, 1, 1, diagnostics)) return undefined
      requireArgType(name, argTypes, 0, 'text', diagnostics)
      return 'text'

    case 'toNumber':
      if (!requireArgCount(name, node.args, 1, 1, diagnostics)) return undefined
      return 'number'

    case 'toText':
      if (!requireArgCount(name, node.args, 1, 1, diagnostics)) return undefined
      return 'text'

    case 'keepHighest':
    case 'keepLowest':
      if (!requireArgCount(name, node.args, 2, 2, diagnostics)) return undefined
      requireArgType(name, argTypes, 0, 'diceSpec', diagnostics)
      requireArgType(name, argTypes, 1, 'number', diagnostics)
      return 'diceSpec'

    case 'explode':
    case 'reroll':
      if (!requireArgCount(name, node.args, 1, undefined, diagnostics)) return undefined
      requireArgType(name, argTypes, 0, 'diceSpec', diagnostics)
      return 'diceSpec'

    default:
      diagnostics.push({
        kind: 'unknown-return-type',
        message: `'${name}' is not part of the approved function whitelist (rules-engine.md §14.5); its return type cannot be determined`,
        expected: 'a whitelisted function name',
        actual: name
      })
      return undefined
  }
}
