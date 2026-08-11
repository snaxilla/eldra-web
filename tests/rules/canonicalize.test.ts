// Unit tests for canonical serialization (app/lib/rules/canonicalize.ts).

import { describe, expect, it } from 'vitest'
import { canonicalize } from '../../app/lib/rules/canonicalize'

describe('canonicalize', () => {
  it('is deterministic for the same input', () => {
    const value = { b: 1, a: { z: [1, 2, 3], y: 'text' } }
    expect(canonicalize(value)).toBe(canonicalize(value))
  })

  it('produces identical output for two structurally-identical objects built independently', () => {
    const a = { name: 'roll:luck', dice: { text: '1d20' }, surfaces: ['sheet', 'gm-toolbar'] }
    const b = { surfaces: ['sheet', 'gm-toolbar'], dice: { text: '1d20' }, name: 'roll:luck' }
    expect(canonicalize(a)).toBe(canonicalize(b))
  })

  it('sorts object keys regardless of insertion order', () => {
    const inOrder = { a: 1, b: 2, c: 3 }
    const reversed = { c: 3, b: 2, a: 1 }
    expect(canonicalize(inOrder)).toBe(canonicalize(reversed))
    expect(canonicalize(inOrder)).toBe('{"a":1,"b":2,"c":3}')
  })

  it('sorts nested object keys recursively, at every depth', () => {
    const value = {
      outer: { z: 1, a: { y: 2, b: 3 } }
    }
    expect(canonicalize(value)).toBe('{"outer":{"a":{"b":3,"y":2},"z":1}}')
  })

  it('preserves array element order -- arrays are never sorted', () => {
    const value = [3, 1, 2]
    expect(canonicalize(value)).toBe('[3,1,2]')
  })

  it('preserves the order of objects within an array while sorting each object\'s own keys', () => {
    const value = [{ b: 1, a: 2 }, { d: 3, c: 4 }]
    expect(canonicalize(value)).toBe('[{"a":2,"b":1},{"c":4,"d":3}]')
  })

  it('a reordered-but-equivalent definitions array canonicalizes differently -- array order is content', () => {
    const first = [{ id: 'value:str' }, { id: 'value:dex' }]
    const second = [{ id: 'value:dex' }, { id: 'value:str' }]
    expect(canonicalize(first)).not.toBe(canonicalize(second))
  })

  it('omits undefined object properties, matching JSON.stringify', () => {
    const value = { a: 1, b: undefined }
    expect(canonicalize(value)).toBe('{"a":1}')
  })

  it('serializes undefined array elements as null, matching JSON.stringify', () => {
    const value = [1, undefined, 3]
    expect(canonicalize(value)).toBe('[1,null,3]')
  })

  it('serializes null directly', () => {
    expect(canonicalize(null)).toBe('null')
  })

  it('serializes strings with proper escaping', () => {
    expect(canonicalize('hello "world"')).toBe('"hello \\"world\\""')
  })

  it('serializes booleans and numbers', () => {
    expect(canonicalize(true)).toBe('true')
    expect(canonicalize(false)).toBe('false')
    expect(canonicalize(42)).toBe('42')
    expect(canonicalize(3.14)).toBe('3.14')
  })

  it('serializes non-finite numbers as null, matching JSON.stringify', () => {
    expect(canonicalize(Number.NaN)).toBe('null')
    expect(canonicalize(Number.POSITIVE_INFINITY)).toBe('null')
  })

  it('throws for values with no JSON representation (functions)', () => {
    expect(() => canonicalize(() => {})).toThrow(TypeError)
  })

  it('produces a stable string across many repeated calls (determinism under repetition)', () => {
    const value = { id: 'roll:luck', dice: { text: '1d20', modifiers: [1, 2, 3] } }
    const outputs = Array.from({ length: 25 }, () => canonicalize(value))
    expect(new Set(outputs).size).toBe(1)
  })
})
