// Rules Engine Expression AST.
// See .github/docs/architecture/rules-engine.md §14 for the canonical design.
//
// Phase 1 of the Rules Engine roadmap (see app/lib/rules/types.ts's own
// header for Phase 0, the core type contract). This file defines ONLY the
// canonical AST every expression compiles into -- no parser, no evaluator,
// no dependency extraction, no type checking, no validation, no visitors,
// no traversal helpers. Nothing here has executable behavior.
//
// This is the representation §14.1 describes as canonical: "Text is what
// humans edit and diff. AST is what the engine evaluates, hashes, extracts
// dependencies from, and what a future visual editor emits." A parser
// (a later Phase 1 commit) turns Expression.text into RuleExpressionNode;
// an evaluator (also later) walks RuleExpressionNode to produce an
// EvaluationResult.
//
// Reused from ./types, not redefined here: DefinitionId,
// UnresolvedExpressionNode (which becomes one variant of the union below,
// unchanged).
//
// This commit does not edit ./types.ts. Its existing `ExpressionNode` is a
// deliberately loose {kind: string, [key: string]: any} placeholder (see
// its own comment: "for the eventual parser/AST commit"). RuleExpressionNode
// below is that AST -- every node kind here already satisfies
// ExpressionNode's shape (same `kind`-discriminant pattern) -- but wiring
// Expression.ast to this stricter union is left to a later commit rather
// than bundled into this one, keeping this commit's diff scoped to exactly
// what it claims: the AST type system, and nothing that touches the
// already-approved, already-deployed core contract.

import type { DefinitionId, UnresolvedExpressionNode } from './types'

// ---------------------------------------------------------------------------
// References (§14.2)
// ---------------------------------------------------------------------------

// §14.2's bullet list is the complete enumerated set of reference
// namespaces: "@value:x, @collection:x, @sources, @choice:x -- actor state
// references", "@world:x -- World Configuration traits (§19)", "@ctx:x --
// evaluation context (§15.6)".
export type ReferenceNamespace = 'value' | 'collection' | 'sources' | 'choice' | 'world' | 'ctx'

// §14.2 shows `@value:might.mod`, `@world:roadType.speedFactor`,
// `@ctx:successes`, etc. -- always a static, literal dot-path, never itself
// computed. `path` is optional only because every worked `sources` example
// (`@sources[tag = "stressed"]`) uses the bare namespace token with no
// `:path` suffix, unlike the other five namespaces.
export type ReferenceExpressionNode = {
  kind: 'reference'
  namespace: ReferenceNamespace
  path?: string
}

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

// §14.3's type list minus the structural/runtime-only types (list, diceSpec,
// error), which are never authored as a literal token: lists come from
// collections, diceSpecs from DiceExpressionNode, error only from
// evaluation (§14.4) or §14.12.
export type LiteralValueType = 'number' | 'text' | 'boolean'

export type LiteralExpressionNode = {
  kind: 'literal'
  valueType: LiteralValueType
  value: number | string | boolean
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

// ARCHITECTURAL AMBIGUITY: no unary operator syntax appears anywhere in the
// architecture document. §14.5's function whitelist models logical negation
// as `not(x)`, a function call, not a unary token, and no example anywhere
// shows a leading arithmetic `-`. This task's design requirements name
// "unary operators" as a required category regardless. `operator` is left
// as an open `string` (not invented as a closed union) rather than guessing
// a vocabulary the architecture never specifies; see the commit Summary.
export type UnaryExpressionNode = {
  kind: 'unary'
  operator: string
  operand: RuleExpressionNode
}

// Grounded directly in worked examples: arithmetic (`(@value:might - 10) /
// 2`, `@value:rank * 6 + @value:hardiness.mod`, `"weightEach" * "quantity"`)
// and §14.5's explicit "Comparison: = != < <= > >=" bullet, under a section
// whose own heading states "Closed set, versioned with the engine."
// Logical and/or are deliberately NOT operators here: §14.5 lists them
// under "Logic: if not and or" alongside `if`/`not` -- i.e. as function
// calls (`and(a, b)`) -- and no example anywhere shows infix `and`/`or`.
export type BinaryOperator = '+' | '-' | '*' | '/' | '=' | '!=' | '<' | '<=' | '>' | '>='

export type BinaryExpressionNode = {
  kind: 'binary'
  operator: BinaryOperator
  left: RuleExpressionNode
  right: RuleExpressionNode
}

// ---------------------------------------------------------------------------
// Function calls (§14.5)
// ---------------------------------------------------------------------------

// The function whitelist (§14.5) minus `if`, `dice`, `lookup`, and the eight
// collection functions -- each pulled into its own dedicated node kind
// below because this task's design requirements name "conditional
// expressions", "dice construction expressions", "lookup expressions", and
// "collection expressions" as distinct required categories. What remains
// here is arithmetic, logic (not/and/or), text, conversion, and the four
// named "dice construction" helpers (keepHighest/keepLowest/explode/
// reroll) -- kept as ordinary function calls rather than folded into
// DiceExpressionNode, since the architecture never shows how they compose
// with `dice(n, faces)` syntactically; see the commit Summary.
//
// No longer used to type FunctionCallExpressionNode.name (see below) --
// kept exported as the reference vocabulary a future semantic/type-checking
// phase validates function names against. The parser does not perform that
// check (rules-engine.md §14.11's validation happens "at import," not at
// parse time), so it cannot be the type of `name` itself.
export type RuleFunctionName =
  | 'floor' | 'ceil' | 'round' | 'abs' | 'min' | 'max' | 'clamp' | 'pow' | 'sqrt' | 'sign'
  | 'not' | 'and' | 'or'
  | 'concat' | 'lower' | 'upper'
  | 'toNumber' | 'toText'
  | 'keepHighest' | 'keepLowest' | 'explode' | 'reroll'

// AST CHANGE (parser commit): `name` was `RuleFunctionName` (closed) when
// this file was first committed. Widened to `string` because the parser
// commit's own explicit spec requires `banana(2)` to parse successfully
// even though `banana` is not a real function -- "the parser only
// understands grammar" (not semantics), and a closed literal union cannot
// hold an arbitrary unrecognized name. Whether `name` is one of
// RuleFunctionName's members is exactly the kind of check deferred to a
// later semantic-validation phase, never the parser's job.
export type FunctionCallExpressionNode = {
  kind: 'call'
  name: string
  args: RuleExpressionNode[]
}

// ---------------------------------------------------------------------------
// Conditional expressions
// ---------------------------------------------------------------------------

// §14.2: `if(@value:hull.current <= 0, "defeated", "active")`. Given its
// own node kind (rather than folded into FunctionCallExpressionNode) per
// this task's explicit "conditional expressions" category.
export type ConditionalExpressionNode = {
  kind: 'conditional'
  condition: RuleExpressionNode
  whenTrue: RuleExpressionNode
  whenFalse: RuleExpressionNode
}

// ---------------------------------------------------------------------------
// Collection expressions (§14.2, §14.5)
// ---------------------------------------------------------------------------

export type CollectionOperation = 'sum' | 'count' | 'any' | 'all' | 'first' | 'max_of' | 'min_of' | 'filter'

// Grounded in `sum(@collection:inventory[equipped], "weightEach" *
// "quantity")` and `count(@sources[tag = "stressed"])`: `source` is the
// (typically Reference) expression being aggregated over, `predicate` is
// the optional `[...]` filter -- a bare field name or a full comparison,
// both just a RuleExpressionNode -- and `aggregate` is the optional
// per-item expression for sum/max_of/min_of. Per §14.2's own note ("'key'
// inside an aggregate -- the item field being aggregated"), a text literal
// inside `aggregate` means "read this field from the current item" rather
// than a literal string. That is an evaluator-time interpretation rule for
// LiteralExpressionNode, not a distinct AST shape.
export type CollectionExpressionNode = {
  kind: 'collection'
  operation: CollectionOperation
  source: RuleExpressionNode
  predicate?: RuleExpressionNode
  aggregate?: RuleExpressionNode
}

// ---------------------------------------------------------------------------
// Lookup expressions
// ---------------------------------------------------------------------------

// §14.2: `lookup(table:proficiency, @value:level)`. `table:proficiency` is
// written bare, with no `@` sigil -- unlike every ReferenceExpressionNode
// namespace -- so it is modeled as a direct DefinitionId rather than a
// ReferenceExpressionNode.
export type LookupExpressionNode = {
  kind: 'lookup'
  table: DefinitionId
  key: RuleExpressionNode
}

// ---------------------------------------------------------------------------
// Dice construction expressions (§14.6, §14.5)
// ---------------------------------------------------------------------------

// "Dice are values, not evaluation" (this task's own framing, and §14.6):
// `2d6 + @value:might.mod` and `dice(@value:pool, 6)` both compile to this
// same node -- the AST does not preserve which surface spelling was used
// (Expression.text does, verbatim). Evaluating this node produces a
// DiceSpec-shaped RuleValue (see ./types); it is never itself a roll.
export type DiceExpressionNode = {
  kind: 'dice'
  count: RuleExpressionNode
  faces: RuleExpressionNode
}

// ---------------------------------------------------------------------------
// The canonical union
// ---------------------------------------------------------------------------

// Every node kind this commit defines, plus UnresolvedExpressionNode
// (§14.12, imported from ./types rather than redefined). This is what a
// future parser produces and a future evaluator/dependency extractor/trace
// builder walks.
export type RuleExpressionNode =
  | LiteralExpressionNode
  | ReferenceExpressionNode
  | UnaryExpressionNode
  | BinaryExpressionNode
  | FunctionCallExpressionNode
  | ConditionalExpressionNode
  | CollectionExpressionNode
  | LookupExpressionNode
  | DiceExpressionNode
  | UnresolvedExpressionNode
