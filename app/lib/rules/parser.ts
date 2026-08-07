// Eldra Expression Language (EEL) parser.
// See .github/docs/architecture/expression-language.md for the grammar this
// implements, and app/lib/rules/ast.ts for the canonical AST it produces.
//
// This module answers exactly one question: "is this syntactically valid
// EEL?" If yes, it produces a RuleExpressionNode. If not, it produces syntax
// diagnostics. It performs NO evaluation, NO dependency extraction, NO type
// checking, and NO semantic validation -- `banana(2)` parses successfully
// even though `banana` is not a real function (expression-language.md's own
// framing), and `@value:strength + "hello"` parses successfully even though
// later type checking will reject it. Only grammar is understood here.
//
// Hand-written recursive-descent, exactly as recommended by
// expression-language.md §15: one function per precedence level (§14),
// mapped directly and legibly rather than routed through a parser
// generator. No PEG/lexer/parser library is used.

import type {
  CollectionExpressionNode,
  CollectionOperation,
  ConditionalExpressionNode,
  DiceExpressionNode,
  FunctionCallExpressionNode,
  LookupExpressionNode,
  ReferenceExpressionNode,
  ReferenceNamespace,
  RuleExpressionNode
} from './ast'
import type { SourceSpan } from './types'
import { tokenize, type Token, type TokenKind } from './tokenizer'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// A syntax diagnostic. Deliberately not `RulesError` (types.ts): that shape
// requires a `definitionId` the raw parser never has -- it operates on bare
// Expression.text, before any Definition context exists. A future caller
// with that context (the package validator) is what turns a
// ParseDiagnostic into a full RulesError, attaching definitionId itself.
export type ParseDiagnostic = {
  message: string
  span: SourceSpan
  token: string
  expected?: string[]
}

export type ParseResult =
  | { ok: true; ast: RuleExpressionNode }
  | { ok: false; diagnostics: ParseDiagnostic[] }

// Parses one Expression.text into its canonical AST.
//
// Per expression-language.md §12's error philosophy: a syntax error stops
// parsing *this* expression entirely (no partial AST) and yields exactly
// one diagnostic. Collecting diagnostics across *many* expressions in a
// package is a future caller's job (this commit does not load Rule
// Packages), which is why `diagnostics` is an array here even though this
// implementation always produces at most one entry.
export function parseExpression(text: string): ParseResult {
  const tokens = tokenize(text)
  const parser = new Parser(tokens)

  try {
    const ast = parser.parse()
    return { ok: true, ast }
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { ok: false, diagnostics: [error.diagnostic] }
    }
    // A genuine bug in the parser itself, not an authoring mistake -- never
    // silently swallow it as if it were a diagnostic.
    throw error
  }
}

// ---------------------------------------------------------------------------
// Internal control-flow signal
// ---------------------------------------------------------------------------

// Thrown internally to unwind to parseExpression() on the first syntax
// error, matching "stop at first error, no partial AST" (§12). Never
// exported and never crosses the public API -- parseExpression() always
// returns a plain ParseResult value, consistent with how RulesError/
// RuleValue are values rather than exceptions elsewhere in the Rules
// Engine (types.ts §14.4). This is purely an implementation detail of how
// the recursive-descent parser aborts early.
class ParseFailure extends Error {
  diagnostic: ParseDiagnostic

  constructor(token: Token, message: string, expected?: string[]) {
    super(message)
    this.diagnostic = { message, span: token.span, token: token.text, expected }
  }
}

// ---------------------------------------------------------------------------
// Grammar-level closed vocabularies
// ---------------------------------------------------------------------------

// expression-language.md §8.1: the reference namespaces this parser accepts
// are a complete, closed enumeration (unlike function names -- see ast.ts's
// FunctionCallExpressionNode comment). An `@` followed by anything else is
// a syntax error, not a permissively-parsed unknown namespace.
//
// Six, not seven: `ast.ts`'s `ReferenceNamespace` gained `'source'` as its
// seventh member in revision 3's type-contract delta (§16.9, ADR-020), but
// grammar support for it is explicitly a separate, later commit ("Do not
// implement parser behavior yet") -- this list intentionally still reflects
// only what this parser can actually produce today, so `@source:x` is
// still a syntax error until that commit lands.
const REFERENCE_NAMESPACES: readonly ReferenceNamespace[] = [
  'value', 'collection', 'sources', 'choice', 'world', 'ctx'
]

function isReferenceNamespace(value: string): value is ReferenceNamespace {
  return (REFERENCE_NAMESPACES as readonly string[]).includes(value)
}

// The eight collection operations (§14.5's "Collections" bullet) are what
// distinguish a CollectionExpressionNode call from an ordinary
// FunctionCallExpressionNode -- a grammar-level dispatch (different argument
// shape: optional `[predicate]` on the source, optional aggregate), not a
// semantic one, exactly like recognizing `if`/`dice`/`lookup` below.
const COLLECTION_OPERATIONS: readonly CollectionOperation[] = [
  'sum', 'count', 'any', 'all', 'first', 'max_of', 'min_of', 'filter'
]

function isCollectionOperation(value: string): value is CollectionOperation {
  return (COLLECTION_OPERATIONS as readonly string[]).includes(value)
}

const COMPARISON_OPERATORS: Partial<Record<TokenKind, '=' | '!=' | '<' | '<=' | '>' | '>='>> = {
  eq: '=',
  neq: '!=',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>='
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private readonly tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  // `tokenize()` always appends a trailing 'eof' token, and this parser
  // never advances past it (nothing ever calls `expect('eof', ...)`), so
  // `this.pos` is always a valid index at runtime. The non-null assertions
  // below exist only to satisfy `noUncheckedIndexedAccess`.
  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private advance(): Token {
    return this.tokens[this.pos++]!
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind
  }

  private expect(kind: TokenKind, expectedDescription: string): Token {
    const token = this.peek()
    if (token.kind !== kind) {
      throw this.unexpected(token, [expectedDescription])
    }
    return this.advance()
  }

  private unexpected(token: Token, expected?: string[]): ParseFailure {
    if (token.kind === 'invalid') {
      return new ParseFailure(token, `Unknown lexical token '${token.text}'`, expected)
    }
    if (token.kind === 'eof') {
      return new ParseFailure(
        token,
        expected?.length ? `Unexpected end of input, expected ${expected.join(' or ')}` : 'Unexpected end of input',
        expected
      )
    }
    return new ParseFailure(
      token,
      expected?.length ? `Unexpected token '${token.text}', expected ${expected.join(' or ')}` : `Unexpected token '${token.text}'`,
      expected
    )
  }

  // Top-level entry: parse one complete expression, then require nothing
  // but EOF remains -- trailing input (e.g. a stray extra `)`) is a syntax
  // error, not silently ignored.
  parse(): RuleExpressionNode {
    const node = this.parseComparison()
    if (!this.check('eof')) {
      throw this.unexpected(this.peek(), ['end of input'])
    }
    return node
  }

  // -------------------------------------------------------------------------
  // Precedence chain (expression-language.md §14). Five levels, tightest to
  // loosest is parseAtom -> parseUnary -> parseMultiplicative ->
  // parseAdditive -> parseComparison; called here loosest-first per the
  // usual recursive-descent shape.
  // -------------------------------------------------------------------------

  private parseComparison(): RuleExpressionNode {
    const left = this.parseAdditive()
    const operator = COMPARISON_OPERATORS[this.peek().kind]
    if (!operator) return left

    this.advance()
    const right = this.parseAdditive()

    // Comparisons are non-associative -- no chaining (§3.2). A second
    // comparison operator immediately following is a syntax error, not
    // "whatever left-to-right evaluation happens to produce."
    const next = COMPARISON_OPERATORS[this.peek().kind]
    if (next) {
      throw this.unexpected(this.peek(), ['and(...) to combine comparisons, not chaining'])
    }

    return { kind: 'binary', operator, left, right }
  }

  private parseAdditive(): RuleExpressionNode {
    let node = this.parseMultiplicative()
    while (this.check('plus') || this.check('minus')) {
      const opToken = this.advance()
      const right = this.parseMultiplicative()
      node = { kind: 'binary', operator: opToken.kind === 'plus' ? '+' : '-', left: node, right }
    }
    return node
  }

  private parseMultiplicative(): RuleExpressionNode {
    let node = this.parseUnary()
    // `%` is proposed but not yet part of BinaryOperator (ast.ts) or this
    // grammar's implementation -- expression-language.md §9 flags it as
    // pending approval. Only `*`/`/` are recognized here.
    while (this.check('star') || this.check('slash')) {
      const opToken = this.advance()
      const right = this.parseUnary()
      node = { kind: 'binary', operator: opToken.kind === 'star' ? '*' : '/', left: node, right }
    }
    return node
  }

  private parseUnary(): RuleExpressionNode {
    if (this.check('minus')) {
      this.advance()
      const operand = this.parseUnary()
      return { kind: 'unary', operator: '-', operand }
    }
    return this.parseAtom()
  }

  private parseAtom(): RuleExpressionNode {
    const token = this.peek()

    if (token.kind === 'number') {
      this.advance()
      return { kind: 'literal', valueType: 'number', value: token.numberValue! }
    }

    if (token.kind === 'dice') {
      this.advance()
      return {
        kind: 'dice',
        count: { kind: 'literal', valueType: 'number', value: token.diceCount! },
        faces: { kind: 'literal', valueType: 'number', value: token.diceFaces! }
      }
    }

    if (token.kind === 'string') {
      this.advance()
      return { kind: 'literal', valueType: 'text', value: token.stringValue! }
    }

    if (token.kind === 'lparen') {
      this.advance()
      const inner = this.parseComparison()
      this.expect('rparen', "')'")
      return inner
    }

    if (token.kind === 'at') {
      return this.parseReference()
    }

    if (token.kind === 'identifier') {
      return this.parseIdentifierAtom()
    }

    throw this.unexpected(token, ['an expression'])
  }

  // -------------------------------------------------------------------------
  // References (§8): `@` namespace (`:` path)? -- `[predicate]` filtering is
  // deliberately NOT parsed here; it is only valid immediately as a
  // collection operation's source (see parseCollectionSource), matching
  // §8.8's framing -- bracket filtering is not a general postfix operator.
  // -------------------------------------------------------------------------

  private parseReference(): ReferenceExpressionNode {
    this.advance() // consume '@'
    const namespaceToken = this.expect('identifier', 'a reference namespace')

    if (!isReferenceNamespace(namespaceToken.text)) {
      throw new ParseFailure(
        namespaceToken,
        `Unknown reference namespace '${namespaceToken.text}'`,
        [...REFERENCE_NAMESPACES]
      )
    }

    const namespace: ReferenceNamespace = namespaceToken.text

    let path: string | undefined
    if (this.check('colon')) {
      this.advance()
      path = this.parsePathSegments()
    }

    return { kind: 'reference', namespace, path }
  }

  // identifier ('.' identifier)* -- used both for reference paths
  // (@value:might.mod) and for the slug half of a `table:slug` lookup
  // reference (parseTableReference).
  private parsePathSegments(): string {
    const first = this.expect('identifier', 'a path segment')
    let path = first.text
    while (this.check('dot')) {
      this.advance()
      const segment = this.expect('identifier', 'a path segment')
      path += `.${segment.text}`
    }
    return path
  }

  // -------------------------------------------------------------------------
  // Identifiers: keywords (true/false), calls, or bare item-field text
  // -------------------------------------------------------------------------

  private parseIdentifierAtom(): RuleExpressionNode {
    const token = this.advance()
    const name = token.text

    if (name === 'true') return { kind: 'literal', valueType: 'boolean', value: true }
    if (name === 'false') return { kind: 'literal', valueType: 'boolean', value: false }

    if (this.check('lparen')) {
      return this.parseCall(name)
    }

    // A bare identifier that isn't a call is a text literal, per
    // expression-language.md §8.8/§8.9: inside a filter or aggregate, a
    // bare word means "the current item's field," which is an
    // *evaluator-time* interpretation of an ordinary text literal, not a
    // distinct AST shape. The parser has no notion of "currently inside a
    // filter" (it is grammar-only, context-free in that sense) -- it
    // applies this reading uniformly to every bare identifier, wherever it
    // appears.
    return { kind: 'literal', valueType: 'text', value: name }
  }

  // -------------------------------------------------------------------------
  // Calls: `name(` has already been confirmed; consumes through the
  // matching `)`. Dispatches to a dedicated node kind for the keywords the
  // grammar shapes differently (if/dice/lookup/the 8 collection ops);
  // everything else becomes a generic FunctionCallExpressionNode with an
  // unchecked name (see ast.ts's FunctionCallExpressionNode comment --
  // `banana(2)` parses successfully on purpose).
  // -------------------------------------------------------------------------

  private parseCall(name: string): RuleExpressionNode {
    this.advance() // consume '('

    if (name === 'if') return this.finishConditional()
    if (name === 'dice') return this.finishDiceCall()
    if (name === 'lookup') return this.finishLookup()
    if (isCollectionOperation(name)) return this.finishCollection(name)

    return this.finishGenericCall(name)
  }

  // `if` produces a ConditionalExpressionNode whose three fields are fixed
  // by the AST's own shape -- exactly 3 comma-separated arguments are
  // structurally required to build one at all, unlike a generic call's
  // open-ended `args[]`. This is a grammar requirement (the node cannot be
  // constructed otherwise), not a semantic arity check.
  private finishConditional(): ConditionalExpressionNode {
    const condition = this.parseComparison()
    this.expect('comma', "','")
    const whenTrue = this.parseComparison()
    this.expect('comma', "','")
    const whenFalse = this.parseComparison()
    this.expect('rparen', "')'")
    return { kind: 'conditional', condition, whenTrue, whenFalse }
  }

  // `dice(count, faces)` -- the general form (§6), for when either operand
  // needs to be a full expression rather than a literal `NdF` token.
  private finishDiceCall(): DiceExpressionNode {
    const count = this.parseComparison()
    this.expect('comma', "','")
    const faces = this.parseComparison()
    this.expect('rparen', "')'")
    return { kind: 'dice', count, faces }
  }

  // `lookup(table:slug, key)` -- the first argument is a bare `table:slug`
  // reference (§8.9), not a general expression: it is written with no `@`
  // sigil, unlike every ReferenceExpressionNode namespace, so it is parsed
  // as a plain DefinitionId string rather than through parseComparison.
  private finishLookup(): LookupExpressionNode {
    const table = this.parseTableReference()
    this.expect('comma', "','")
    const key = this.parseComparison()
    this.expect('rparen', "')'")
    return { kind: 'lookup', table, key }
  }

  private parseTableReference(): string {
    const first = this.expect('identifier', "a table reference (e.g. 'table:slug')")
    this.expect('colon', "':'")
    const path = this.parsePathSegments()
    return `${first.text}:${path}`
  }

  // All eight collection operations share one argument shape: a source
  // (optionally `[predicate]`-filtered), then an optional aggregate
  // expression. Which specific operation (sum vs. count vs. ...) actually
  // *uses* the aggregate is a semantic question -- e.g. `count(@sources[x],
  // "y")` parses successfully here even though `count` has no real use for
  // an aggregate, exactly per this task's "grammar only" framing.
  private finishCollection(operation: CollectionOperation): CollectionExpressionNode {
    const { source, predicate } = this.parseCollectionSource()

    let aggregate: RuleExpressionNode | undefined
    if (this.check('comma')) {
      this.advance()
      aggregate = this.parseComparison()
    }

    this.expect('rparen', "')'")
    return { kind: 'collection', operation, source, predicate, aggregate }
  }

  // `[predicate]` bracket filtering (§8.8) is deliberately scoped to this
  // one position only -- immediately after a collection operation's source
  // argument -- not offered as a general postfix operator elsewhere in the
  // grammar. `floor(@collection:x[y])` is therefore a syntax error here
  // (the `[` is unexpected once control returns to finishGenericCall),
  // matching every worked example, none of which use `[...]` outside a
  // collection-operation call.
  private parseCollectionSource(): { source: RuleExpressionNode; predicate?: RuleExpressionNode } {
    const source = this.parseComparison()
    let predicate: RuleExpressionNode | undefined
    if (this.check('lbracket')) {
      this.advance()
      predicate = this.parseComparison()
      this.expect('rbracket', "']'")
    }
    return { source, predicate }
  }

  // Every unrecognized call name -- `floor`, `toNumber`, `banana`, anything
  // -- becomes this. Zero or more comma-separated arguments; no arity
  // constraint at all, since FunctionCallExpressionNode.args is an open
  // array and this task's spec explicitly requires unrecognized names to
  // parse (ast.ts's FunctionCallExpressionNode comment).
  private finishGenericCall(name: string): FunctionCallExpressionNode {
    const args: RuleExpressionNode[] = []
    if (!this.check('rparen')) {
      args.push(this.parseComparison())
      while (this.check('comma')) {
        this.advance()
        args.push(this.parseComparison())
      }
    }
    this.expect('rparen', "')'")
    return { kind: 'call', name, args }
  }
}
