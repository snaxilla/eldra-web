// Unit tests for app/lib/characters/health.ts -- the player-authored side
// of the Health System.
//
// Pure module, nothing to mock. Health is the fifth member of the
// app/lib/characters family (ability-scores, rules-choices, inventory,
// character-notes, health) and follows the same contract: re-validated on
// read, never trusted, computing nothing. These tests focus on what makes
// Health different from its siblings -- there is no upper bound to enforce
// against Maximum HP, because this module structurally cannot see it.

import { describe, expect, it } from 'vitest'

import {
  MAX_DEATH_SAVE_MARKS,
  emptyCharacterHealth,
  normalizeStoredCharacterHealth,
  type StoredCharacterHealth
} from '../../../app/lib/characters/health'

describe('emptyCharacterHealth', () => {
  it('is every field present at zero', () => {
    expect(emptyCharacterHealth()).toEqual({
      currentHp: 0,
      temporaryHp: 0,
      hitDiceSpent: 0,
      deathSaves: { successes: 0, failures: 0 }
    })
  })
})

describe('normalizeStoredCharacterHealth', () => {
  it('reads a well-formed record', () => {
    const stored: StoredCharacterHealth = {
      currentHp: 15,
      temporaryHp: 3,
      hitDiceSpent: 2,
      deathSaves: { successes: 1, failures: 0 }
    }
    expect(normalizeStoredCharacterHealth(stored)).toEqual(stored)
  })

  it('returns null for anything that is not an object envelope', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(normalizeStoredCharacterHealth(bad)).toBeNull()
    }
  })

  it('an empty object is a legal envelope -- every field reads as its zero default', () => {
    expect(normalizeStoredCharacterHealth({})).toEqual(emptyCharacterHealth())
  })

  it('coerces a negative number to zero rather than rejecting the whole record', () => {
    const result = normalizeStoredCharacterHealth({ currentHp: -5, temporaryHp: 3, hitDiceSpent: 1 })
    expect(result?.currentHp).toBe(0)
    expect(result?.temporaryHp).toBe(3)
    expect(result?.hitDiceSpent).toBe(1)
  })

  it('accepts a numeric string, matching an <input> round-trip', () => {
    expect(normalizeStoredCharacterHealth({ currentHp: '12' })?.currentHp).toBe(12)
  })

  it('truncates a fractional value rather than rounding or rejecting', () => {
    expect(normalizeStoredCharacterHealth({ currentHp: 7.9 })?.currentHp).toBe(7)
  })

  it('coerces a non-numeric field to zero', () => {
    expect(normalizeStoredCharacterHealth({ currentHp: 'not a number' })?.currentHp).toBe(0)
    expect(normalizeStoredCharacterHealth({ currentHp: null })?.currentHp).toBe(0)
  })

  it('reads deathSaves as an empty record when missing or malformed', () => {
    expect(normalizeStoredCharacterHealth({ currentHp: 5 })?.deathSaves).toEqual({ successes: 0, failures: 0 })
    expect(normalizeStoredCharacterHealth({ currentHp: 5, deathSaves: 'bad' })?.deathSaves)
      .toEqual({ successes: 0, failures: 0 })
    expect(normalizeStoredCharacterHealth({ currentHp: 5, deathSaves: [1, 2] })?.deathSaves)
      .toEqual({ successes: 0, failures: 0 })
  })

  it('clamps death save marks to the 3-mark cap rather than rejecting', () => {
    const result = normalizeStoredCharacterHealth({ deathSaves: { successes: 7, failures: -2 } })
    expect(result?.deathSaves.successes).toBe(MAX_DEATH_SAVE_MARKS)
    expect(result?.deathSaves.failures).toBe(0)
  })

  it('round-trips a full record unchanged', () => {
    const built: StoredCharacterHealth = {
      currentHp: 22, temporaryHp: 5, hitDiceSpent: 3,
      deathSaves: { successes: 2, failures: 1 }
    }
    expect(normalizeStoredCharacterHealth(normalizeStoredCharacterHealth(built))).toEqual(built)
  })
})

describe('no upper bound against Maximum HP -- this module cannot see it', () => {
  it('a currentHp far above any plausible maximum is accepted as-is', () => {
    // This module is pure and registry-free (no Rules Engine import); it
    // cannot know what a character's derived maximum is, so it does not
    // pretend to enforce one. See this file's own header note.
    expect(normalizeStoredCharacterHealth({ currentHp: 9999 })?.currentHp).toBe(9999)
  })
})

describe('nothing here computes a rules consequence', () => {
  it('every field is a plain number or a pair of numbers -- no formula, no reference', () => {
    const health = normalizeStoredCharacterHealth({ currentHp: 10 })!
    expect(typeof health.currentHp).toBe('number')
    expect(typeof health.temporaryHp).toBe('number')
    expect(typeof health.hitDiceSpent).toBe('number')
    expect(typeof health.deathSaves.successes).toBe('number')
    expect(typeof health.deathSaves.failures).toBe('number')
  })
})
