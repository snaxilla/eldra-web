// Unit tests for app/lib/characters/progression.ts -- the pure Character
// Progression model behind Character Progression Phase 1A's stored half.
//
// Pure module, nothing to mock. Mirrors spellcasting.test.ts's own coverage
// shape: a stored record is re-validated rather than trusted, and every
// derivation is a total, non-mutating function.

import { describe, expect, it } from 'vitest'

import {
  emptyCharacterProgression,
  isValidClassLevel,
  normalizeStoredProgression,
  totalCharacterLevel,
  type StoredCharacterProgression
} from '../../../app/lib/characters/progression'

const REF = { packageId: 'eldra.content.xphb', slug: 'wizard-xphb' }

describe('emptyCharacterProgression', () => {
  it('starts with no class entries', () => {
    expect(emptyCharacterProgression()).toEqual({ classes: [] })
  })
})

describe('isValidClassLevel', () => {
  it('accepts 1 through 20', () => {
    for (let level = 1; level <= 20; level++) {
      expect(isValidClassLevel(level)).toBe(true)
    }
  })

  it('rejects 0, 21, negatives, fractions, and non-numbers', () => {
    for (const value of [0, 21, -1, 1.5, 'five', null, undefined]) {
      expect(isValidClassLevel(value)).toBe(false)
    }
  })
})

describe('normalizeStoredProgression', () => {
  it('returns null for a malformed envelope', () => {
    expect(normalizeStoredProgression(null)).toBeNull()
    expect(normalizeStoredProgression('nope')).toBeNull()
    expect(normalizeStoredProgression({})).toBeNull()
  })

  it('reads back a well-formed record unchanged', () => {
    const stored: StoredCharacterProgression = { classes: [{ classRef: REF, level: 5 }] }
    expect(normalizeStoredProgression(stored)).toEqual(stored)
  })

  it('drops one malformed entry without failing the whole record', () => {
    const result = normalizeStoredProgression({
      classes: [{ classRef: REF, level: 5 }, { classRef: REF, level: 'nope' }]
    })
    expect(result?.classes).toHaveLength(1)
  })

  it('drops an entry with a half-written classRef', () => {
    const result = normalizeStoredProgression({
      classes: [{ classRef: { packageId: 'x' }, level: 5 }]
    })
    expect(result?.classes).toEqual([])
  })

  it('drops an entry whose level is out of the 1-20 range', () => {
    const result = normalizeStoredProgression({
      classes: [{ classRef: REF, level: 25 }]
    })
    expect(result?.classes).toEqual([])
  })

  it('accepts multiple class entries -- the multiclass-ready shape', () => {
    const stored = {
      classes: [
        { classRef: REF, level: 3 },
        { classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 2 }
      ]
    }
    expect(normalizeStoredProgression(stored)).toEqual(stored)
  })
})

describe('totalCharacterLevel', () => {
  it('defaults to 1 for null (never recorded) -- the same number value:level\'s own Rules Engine default produces', () => {
    expect(totalCharacterLevel(null)).toBe(1)
    expect(totalCharacterLevel(undefined)).toBe(1)
  })

  it('defaults to 1 for an empty classes array', () => {
    expect(totalCharacterLevel({ classes: [] })).toBe(1)
  })

  it('is the class level for a single-class character', () => {
    expect(totalCharacterLevel({ classes: [{ classRef: REF, level: 7 }] })).toBe(7)
  })

  it('is the SUM across every class entry -- the multiclass-ready reading', () => {
    expect(totalCharacterLevel({
      classes: [
        { classRef: REF, level: 5 },
        { classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 3 }
      ]
    })).toBe(8)
  })
})
