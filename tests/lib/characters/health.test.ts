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
  applyDamage,
  applyHealing,
  emptyCharacterHealth,
  normalizeStoredCharacterHealth,
  resetDeathSaves,
  spendHitDie,
  takeLongRest,
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

// ---------------------------------------------------------------------------
// Recovery -- pure mutations
// ---------------------------------------------------------------------------

function health(overrides: Partial<StoredCharacterHealth> = {}): StoredCharacterHealth {
  return {
    currentHp: 10,
    temporaryHp: 0,
    hitDiceSpent: 0,
    deathSaves: { successes: 0, failures: 0 },
    ...overrides
  }
}

describe('applyDamage', () => {
  it('reduces current HP directly when there is no temporary HP', () => {
    expect(applyDamage(health({ currentHp: 10 }), 4).currentHp).toBe(6)
  })

  it('absorbs damage into temporary HP first', () => {
    const result = applyDamage(health({ currentHp: 10, temporaryHp: 5 }), 3)
    expect(result.temporaryHp).toBe(2)
    expect(result.currentHp).toBe(10)
  })

  it('spills over into current HP once temporary HP is exhausted', () => {
    const result = applyDamage(health({ currentHp: 10, temporaryHp: 5 }), 8)
    expect(result.temporaryHp).toBe(0)
    expect(result.currentHp).toBe(7) // 8 - 5 absorbed = 3 spillover
  })

  it('floors current HP at zero rather than going negative', () => {
    expect(applyDamage(health({ currentHp: 3 }), 10).currentHp).toBe(0)
  })

  it('never mutates the input record', () => {
    const original = health({ currentHp: 10, temporaryHp: 5 })
    const frozen = JSON.stringify(original)
    applyDamage(original, 3)
    expect(JSON.stringify(original)).toBe(frozen)
  })

  it('needs no Rules Engine input -- works with plain numbers alone', () => {
    // No maxHp, no registry, no formula -- confirmed by the function's own
    // signature taking only (health, amount).
    expect(applyDamage(health(), 1)).toBeDefined()
  })
})

describe('applyHealing', () => {
  it('increases current HP by the healed amount', () => {
    expect(applyHealing(health({ currentHp: 5 }), 3, 20).currentHp).toBe(8)
  })

  it('never exceeds Maximum HP', () => {
    expect(applyHealing(health({ currentHp: 18 }), 10, 20).currentHp).toBe(20)
  })

  it('does not touch temporary HP', () => {
    expect(applyHealing(health({ currentHp: 5, temporaryHp: 4 }), 3, 20).temporaryHp).toBe(4)
  })

  it('never mutates the input record', () => {
    const original = health({ currentHp: 5 })
    const frozen = JSON.stringify(original)
    applyHealing(original, 3, 20)
    expect(JSON.stringify(original)).toBe(frozen)
  })
})

describe('spendHitDie', () => {
  it('increments hitDiceSpent and heals by the average roll', () => {
    const result = spendHitDie(health({ currentHp: 5, hitDiceSpent: 0 }), 3, 8, 20)
    expect(result.hitDiceSpent).toBe(1)
    expect(result.currentHp).toBe(13)
  })

  it('caps healing at Maximum HP, same as applyHealing', () => {
    const result = spendHitDie(health({ currentHp: 18, hitDiceSpent: 0 }), 3, 8, 20)
    expect(result.currentHp).toBe(20)
  })

  it('is a no-op when every Hit Die is already spent', () => {
    const result = spendHitDie(health({ currentHp: 5, hitDiceSpent: 3 }), 3, 8, 20)
    expect(result).toEqual(health({ currentHp: 5, hitDiceSpent: 3 }))
  })

  it('never mutates the input record', () => {
    const original = health({ currentHp: 5, hitDiceSpent: 0 })
    const frozen = JSON.stringify(original)
    spendHitDie(original, 3, 8, 20)
    expect(JSON.stringify(original)).toBe(frozen)
  })
})

describe('takeLongRest', () => {
  it('restores current HP to the Maximum', () => {
    expect(takeLongRest(health({ currentHp: 4 }), 22, 2).currentHp).toBe(22)
  })

  it('clears temporary HP', () => {
    expect(takeLongRest(health({ temporaryHp: 6 }), 22, 2).temporaryHp).toBe(0)
  })

  it('recovers spent Hit Dice up to the Rules Engine\'s own recovery amount', () => {
    expect(takeLongRest(health({ hitDiceSpent: 5 }), 22, 3).hitDiceSpent).toBe(2)
  })

  it('never recovers below zero spent, even if recovery exceeds what was spent', () => {
    expect(takeLongRest(health({ hitDiceSpent: 1 }), 22, 3).hitDiceSpent).toBe(0)
  })

  it('clears death save marks', () => {
    const result = takeLongRest(health({ deathSaves: { successes: 2, failures: 1 } }), 22, 2)
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 })
  })

  it('never mutates the input record', () => {
    const original = health({ currentHp: 4, hitDiceSpent: 5 })
    const frozen = JSON.stringify(original)
    takeLongRest(original, 22, 3)
    expect(JSON.stringify(original)).toBe(frozen)
  })
})

describe('resetDeathSaves', () => {
  it('clears both marks without touching anything else', () => {
    const result = resetDeathSaves(health({ currentHp: 0, deathSaves: { successes: 2, failures: 1 } }))
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 })
    expect(result.currentHp).toBe(0)
  })

  it('never mutates the input record', () => {
    const original = health({ deathSaves: { successes: 2, failures: 1 } })
    const frozen = JSON.stringify(original)
    resetDeathSaves(original)
    expect(JSON.stringify(original)).toBe(frozen)
  })
})
