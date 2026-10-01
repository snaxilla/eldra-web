// Unit tests for app/lib/characters/resources.ts -- D&D 2024 Character
// Rules Phase 2A.2, GENERIC CHARACTER RESOURCES. Pure module; no mocks.

import { describe, expect, it } from 'vitest'
import {
  applyResourceRecovery,
  clampExpendedToMaximum,
  emptyCharacterResources,
  expendResource,
  normalizeStoredResources,
  restoreResource
} from '../../../app/lib/characters/resources'

describe('normalizeStoredResources', () => {
  it('reads a well-formed record', () => {
    expect(normalizeStoredResources({ expended: { 'resource:barbarian.rage': 2 } }))
      .toEqual({ expended: { 'resource:barbarian.rage': 2 } })
  })

  it('returns null for anything that is not an envelope object', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(normalizeStoredResources(bad)).toBeNull()
    }
  })

  it('drops a non-positive or non-finite expended count rather than failing the whole record', () => {
    expect(normalizeStoredResources({
      expended: { 'resource:a': 0, 'resource:b': -1, 'resource:c': Number.NaN, 'resource:d': 3 }
    })).toEqual({ expended: { 'resource:d': 3 } })
  })

  it('truncates a fractional count', () => {
    expect(normalizeStoredResources({ expended: { 'resource:a': 2.9 } }))
      .toEqual({ expended: { 'resource:a': 2 } })
  })

  it('UNRESOLVED RESOURCE IDS -- never rejects an unfamiliar key; this function has no registry to check against', () => {
    expect(normalizeStoredResources({ expended: { 'resource:no-longer-exists': 1 } }))
      .toEqual({ expended: { 'resource:no-longer-exists': 1 } })
  })

  it('an absent `expended` key normalizes to {}', () => {
    expect(normalizeStoredResources({})).toEqual({ expended: {} })
  })
})

describe('expendResource', () => {
  it('increments by 1 by default', () => {
    expect(expendResource({}, 'resource:a', 3)).toEqual({ 'resource:a': 1 })
  })

  it('cannot exceed the authoritative maximum', () => {
    expect(expendResource({ 'resource:a': 3 }, 'resource:a', 3)).toEqual({ 'resource:a': 3 })
  })

  it('supports a multi-unit amount (action consumption), still capped at max', () => {
    expect(expendResource({ 'resource:a': 1 }, 'resource:a', 3, 2)).toEqual({ 'resource:a': 3 })
    expect(expendResource({ 'resource:a': 1 }, 'resource:a', 3, 5)).toEqual({ 'resource:a': 3 })
  })

  it('a non-positive amount is a no-op', () => {
    expect(expendResource({ 'resource:a': 1 }, 'resource:a', 3, 0)).toEqual({ 'resource:a': 1 })
  })
})

describe('restoreResource', () => {
  it('decrements by 1 by default and deletes the key at zero', () => {
    expect(restoreResource({ 'resource:a': 1 }, 'resource:a')).toEqual({})
  })

  it('cannot restore below zero', () => {
    expect(restoreResource({}, 'resource:a')).toEqual({})
    expect(restoreResource({ 'resource:a': 1 }, 'resource:a', 5)).toEqual({})
  })
})

describe('clampExpendedToMaximum -- LEVEL SCALING / MAX-CHANGE SAFETY', () => {
  it('leaves expended unchanged when it is at or below max', () => {
    expect(clampExpendedToMaximum(2, 4)).toBe(2)
    expect(clampExpendedToMaximum(4, 4)).toBe(4)
  })

  it('clamps expended DOWN when a reduced maximum now sits below it -- never produces a negative remaining', () => {
    expect(clampExpendedToMaximum(5, 3)).toBe(3)
  })

  it('a max increase preserves expenditure exactly (no re-derivation, no reset)', () => {
    expect(clampExpendedToMaximum(2, 10)).toBe(2)
  })

  it('never returns negative even for a malformed max', () => {
    expect(clampExpendedToMaximum(2, -1)).toBe(0)
    expect(clampExpendedToMaximum(2, Number.NaN)).toBe(0)
  })
})

describe('applyResourceRecovery -- generic rest trigger application', () => {
  it('"full" zeroes the entry outright', () => {
    expect(applyResourceRecovery({ 'resource:a': 3 }, [{ resourceId: 'resource:a', amount: 'full' }]))
      .toEqual({})
  })

  it('a numeric amount reduces by that many, never below zero', () => {
    expect(applyResourceRecovery({ 'resource:a': 2 }, [{ resourceId: 'resource:a', amount: 1 }]))
      .toEqual({ 'resource:a': 1 })
    expect(applyResourceRecovery({ 'resource:a': 2 }, [{ resourceId: 'resource:a', amount: 10 }]))
      .toEqual({})
  })

  it('a resource with no matching recovery entry is left completely untouched', () => {
    expect(applyResourceRecovery({ 'resource:a': 2, 'resource:b': 1 }, [{ resourceId: 'resource:a', amount: 'full' }]))
      .toEqual({ 'resource:b': 1 })
  })

  it('applies several resources in one call, independently', () => {
    expect(applyResourceRecovery(
      { 'resource:a': 3, 'resource:b': 2 },
      [{ resourceId: 'resource:a', amount: 1 }, { resourceId: 'resource:b', amount: 'full' }]
    )).toEqual({ 'resource:a': 2 })
  })
})

describe('emptyCharacterResources', () => {
  it('is the canonical empty state', () => {
    expect(emptyCharacterResources()).toEqual({ expended: {} })
  })
})
