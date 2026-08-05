// Eldra Expression Language (EEL) tokenizer.
// See .github/docs/architecture/expression-language.md for the language
// specification this implements. Not (yet) a reusable subsystem in its own
// right, per the parser commit's own scope -- it exists to feed
// app/lib/rules/parser.ts and is exported mainly so it can be tested and
// debugged in isolation.
//
// Total function: `tokenize` never throws. Any character that doesn't match
// a known token shape becomes an `invalid` token carrying the offending
// text; the parser is what turns that into a diagnostic (a lexical error is
// a syntax error from the author's point of view -- see parser.ts).

import type { SourceSpan } from './types'

export type TokenKind =
  | 'number'
  | 'dice'
  | 'string'
  | 'identifier'
  | 'at'
  | 'colon'
  | 'dot'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'eof'
  | 'invalid'

export type Token = {
  kind: TokenKind
  text: string
  span: SourceSpan
  // Populated only for the token kinds that carry a parsed payload.
  numberValue?: number
  stringValue?: string
  diceCount?: number
  diceFaces?: number
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9'
}

function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    ch === '_'
  )
}

function isIdentPart(ch: string | undefined): boolean {
  return isIdentStart(ch) || isDigit(ch)
}

const SINGLE_CHAR_TOKENS: Record<string, TokenKind> = {
  '@': 'at',
  ':': 'colon',
  '.': 'dot',
  '(': 'lparen',
  ')': 'rparen',
  '[': 'lbracket',
  ']': 'rbracket',
  ',': 'comma',
  '+': 'plus',
  '-': 'minus',
  '*': 'star',
  '/': 'slash',
  '=': 'eq',
  '<': 'lt',
  '>': 'gt'
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const n = source.length
  let i = 0

  function push(kind: TokenKind, start: number, end: number, extra: Partial<Token> = {}) {
    tokens.push({ kind, text: source.slice(start, end), span: { start, end }, ...extra })
  }

  while (i < n) {
    const ch = source[i]
    // Unreachable given the `i < n` loop guard -- narrows `ch` from
    // `string | undefined` to `string` for the rest of the loop body
    // under this project's `noUncheckedIndexedAccess` setting.
    if (ch === undefined) break

    // Whitespace is insignificant everywhere, including newlines
    // (expression-language.md §5) -- there is no statement concept for a
    // newline to terminate.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // Dice literal (`2d6`) or plain number (`42`, `3.5`). Dice must be
    // recognized greedily before falling back to plain-number lexing, per
    // expression-language.md §15's parser note: `<digits>d<digits>` is
    // checked first so `2day` (not a dice literal -- 'a' isn't a digit)
    // correctly falls back to NUMBER(2) + IDENTIFIER(day) rather than
    // partially matching.
    if (isDigit(ch)) {
      const start = i
      let j = i
      while (isDigit(source[j])) j++

      if (source[j] === 'd' && isDigit(source[j + 1])) {
        const countText = source.slice(start, j)
        const facesStart = j + 1
        let k = facesStart
        while (isDigit(source[k])) k++
        push('dice', start, k, {
          diceCount: Number(countText),
          diceFaces: Number(source.slice(facesStart, k))
        })
        i = k
        continue
      }

      let end = j
      if (source[end] === '.' && isDigit(source[end + 1])) {
        end++
        while (isDigit(source[end])) end++
      }
      push('number', start, end, { numberValue: Number(source.slice(start, end)) })
      i = end
      continue
    }

    // Identifier -- the single grammar shared by reference path segments,
    // function/keyword names, and item-field names (expression-language.md
    // §10). ASCII-only, ties directly to that section's rationale.
    if (isIdentStart(ch)) {
      const start = i
      let j = i
      while (isIdentPart(source[j])) j++
      push('identifier', start, j)
      i = j
      continue
    }

    // String literal -- double-quoted only (§2.2), with the two minimal
    // escapes the grammar defines: \" and \\.
    if (ch === '"') {
      const start = i
      let j = i + 1
      let value = ''
      let closed = false
      while (j < n) {
        const c = source[j]
        if (c === '"') {
          closed = true
          j++
          break
        }
        if (c === '\\' && (source[j + 1] === '"' || source[j + 1] === '\\')) {
          value += source[j + 1]
          j += 2
          continue
        }
        value += c
        j++
      }
      if (closed) {
        push('string', start, j, { stringValue: value })
      } else {
        // Unterminated string -- reached EOF before a closing quote.
        push('invalid', start, j, { stringValue: value })
      }
      i = j
      continue
    }

    // `!=` is the only place `!` is valid EEL syntax at all -- there is no
    // unary `!` (expression-language.md §3.3/§3.4: negation is `not(x)`).
    if (ch === '!' && source[i + 1] === '=') {
      push('neq', i, i + 2)
      i += 2
      continue
    }
    if (ch === '<' && source[i + 1] === '=') {
      push('lte', i, i + 2)
      i += 2
      continue
    }
    if (ch === '>' && source[i + 1] === '=') {
      push('gte', i, i + 2)
      i += 2
      continue
    }

    const single = SINGLE_CHAR_TOKENS[ch]
    if (single) {
      push(single, i, i + 1)
      i++
      continue
    }

    // Anything else (e.g. a bare `!`, `&`, `%` pending expression-language.md
    // §9's proposed BinaryOperator addition, `^`, `$`, ...) is not part of
    // the language as currently specified.
    push('invalid', i, i + 1)
    i++
  }

  push('eof', n, n)
  return tokens
}
