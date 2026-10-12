// Unit tests for app/lib/characters/currency.ts -- the pure currency model P8 adds alongside
// ability-scores.ts/rules-choices.ts/inventory.ts. Pure module, nothing to mock.

import { describe, expect, it } from 'vitest'

import {
  addCurrencyAmounts,
  clampAmount,
  emptyCurrency,
  normalizeStoredCurrency
} from '../../../app/lib/characters/currency'

describe('clampAmount', () => {
  it('clamps to a whole, non-negative number', () => {
    expect(clampAmount(1500)).toBe(1500)
    expect(clampAmount('75')).toBe(75)
    expect(clampAmount(2.7)).toBe(2)
    expect(clampAmount(-5)).toBe(0)
    expect(clampAmount(0)).toBe(0)
  })

  it('falls back to zero for anything unreadable', () => {
    for (const bad of [null, undefined, 'x', {}, NaN, Infinity, -Infinity]) {
      expect(clampAmount(bad)).toBe(0)
    }
  })
})

describe('normalizeStoredCurrency', () => {
  it('returns an empty amounts map for a well-formed empty envelope', () => {
    expect(normalizeStoredCurrency({ amounts: {} })).toEqual({ amounts: {} })
  })

  it('keeps a well-formed denomination amount', () => {
    expect(normalizeStoredCurrency({ amounts: { 'currency:xphb.copper': 1500 } }))
      .toEqual({ amounts: { 'currency:xphb.copper': 1500 } })
  })

  it('drops a zero-amount entry rather than storing an explicit zero', () => {
    expect(normalizeStoredCurrency({ amounts: { 'currency:xphb.copper': 0 } }))
      .toEqual({ amounts: {} })
  })

  it('drops a negative amount down to zero and then drops the entry', () => {
    expect(normalizeStoredCurrency({ amounts: { 'currency:xphb.copper': -50 } }))
      .toEqual({ amounts: {} })
  })

  it('drops an entry whose key is blank or not a string', () => {
    expect(normalizeStoredCurrency({ amounts: { '': 100 } })).toEqual({ amounts: {} })
  })

  it('returns null for a malformed envelope', () => {
    expect(normalizeStoredCurrency(null)).toBeNull()
    expect(normalizeStoredCurrency(undefined)).toBeNull()
    expect(normalizeStoredCurrency('x')).toBeNull()
    expect(normalizeStoredCurrency([])).toBeNull()
    expect(normalizeStoredCurrency({})).toBeNull()
    expect(normalizeStoredCurrency({ amounts: 'x' })).toBeNull()
    expect(normalizeStoredCurrency({ amounts: [] })).toBeNull()
  })
})

describe('addCurrencyAmounts', () => {
  it('starts a denomination at zero and adds the delta', () => {
    expect(addCurrencyAmounts(emptyCurrency(), { 'currency:xphb.copper': 1500 }))
      .toEqual({ amounts: { 'currency:xphb.copper': 1500 } })
  })

  it('accumulates across multiple calls, never replacing', () => {
    let currency = emptyCurrency()
    currency = addCurrencyAmounts(currency, { 'currency:xphb.copper': 1500 })
    currency = addCurrencyAmounts(currency, { 'currency:xphb.copper': 700 })
    expect(currency).toEqual({ amounts: { 'currency:xphb.copper': 2200 } })
  })

  it('tracks independent denominations independently', () => {
    const currency = addCurrencyAmounts(emptyCurrency(), { 'currency:xphb.copper': 100, 'currency:xphb.electrum': 5 })
    expect(currency).toEqual({ amounts: { 'currency:xphb.copper': 100, 'currency:xphb.electrum': 5 } })
  })

  it('a resulting zero is dropped, not stored as an explicit zero', () => {
    const currency = addCurrencyAmounts({ amounts: { 'currency:xphb.copper': 100 } }, { 'currency:xphb.copper': -100 })
    expect(currency).toEqual({ amounts: {} })
  })

  it('does not mutate the input', () => {
    const original = { amounts: { 'currency:xphb.copper': 100 } }
    addCurrencyAmounts(original, { 'currency:xphb.copper': 50 })
    expect(original).toEqual({ amounts: { 'currency:xphb.copper': 100 } })
  })
})
