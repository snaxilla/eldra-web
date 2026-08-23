// Unit tests for app/lib/characters/ability-scores.ts -- the pure ability
// score domain behind Character Builder / Character Sheet Phase 3.
//
// Pure throughout: no Nuxt, no Vue, no Directus, no HTTP, no filesystem.
//
// The boundary these tests exist to defend is stated in the module's own
// header: Ability Scores are PLAYER DATA, ability score MODIFIERS are RULES.
// The last describe block asserts that boundary directly, so a future
// "just add a modifier helper, it's one line" fails here rather than
// silently relocating the Rules Engine into the Builder.

import { describe, expect, it } from 'vitest'

import {
  ABILITY_KEYS,
  ABILITY_SCORE_METHODS,
  MAX_STORED_ABILITY_SCORE,
  MIN_STORED_ABILITY_SCORE,
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
  canLowerPointBuy,
  canRaisePointBuy,
  canRepresent,
  defaultAssignmentForMethod,
  emptyAssignment,
  filledAssignment,
  isAbilityScoreMethodAvailable,
  isCompleteForMethod,
  isCompleteManual,
  isCompletePointBuy,
  isCompleteStandardArray,
  normalizeStoredAbilityScores,
  pointBuyCost,
  pointBuyRemaining,
  pointBuySpent,
  remainingStandardArrayValues,
  seedAssignmentForMethod,
  toAbilityScores,
  type AbilityScoreAssignment
} from '../../../app/lib/characters/ability-scores'

function assign(values: Partial<Record<string, number | null>>): AbilityScoreAssignment {
  return { ...emptyAssignment(), ...values } as AbilityScoreAssignment
}

const STANDARD_ARRAY_ASSIGNMENT = assign({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })

describe('the six abilities', () => {
  it('are exactly STR, DEX, CON, INT, WIS, CHA, in book order', () => {
    expect(ABILITY_KEYS).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha'])
  })
})

describe('Standard Array', () => {
  it('is the 2024 array', () => {
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8])
  })

  it('reports every value as remaining when nothing is assigned', () => {
    expect(remainingStandardArrayValues(emptyAssignment())).toEqual([15, 14, 13, 12, 10, 8])
  })

  it('removes each assigned value from the pool', () => {
    expect(remainingStandardArrayValues(assign({ str: 15, dex: 8 }))).toEqual([14, 13, 12, 10])
  })

  it('is complete only when the six values are exactly the array, in any order', () => {
    expect(isCompleteStandardArray(STANDARD_ARRAY_ASSIGNMENT)).toBe(true)
    // Order is the player's choice -- putting 15 in Charisma is the point.
    expect(isCompleteStandardArray(assign({ str: 8, dex: 10, con: 12, int: 13, wis: 14, cha: 15 }))).toBe(true)
  })

  it('is incomplete while any ability is unassigned', () => {
    expect(isCompleteStandardArray(assign({ str: 15, dex: 14, con: 13, int: 12, wis: 10 }))).toBe(false)
    expect(isCompleteStandardArray(emptyAssignment())).toBe(false)
  })

  it('rejects a set that reuses a value instead of using each once', () => {
    expect(isCompleteStandardArray(assign({ str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 }))).toBe(false)
  })

  it('rejects six values that are not the array at all', () => {
    expect(isCompleteStandardArray(filledAssignment(15))).toBe(false)
  })
})

describe('Point Buy', () => {
  it('uses the 2024 cost table, which is non-linear above 13', () => {
    expect(pointBuyCost(8)).toBe(0)
    expect(pointBuyCost(13)).toBe(5)
    // The two steps that make a formula wrong: 14 costs 2 more than 13, and
    // 15 costs 2 more than 14.
    expect(pointBuyCost(14)).toBe(7)
    expect(pointBuyCost(15)).toBe(9)
  })

  it('reports null (not zero) for a score outside the buyable range', () => {
    expect(pointBuyCost(7)).toBeNull()
    expect(pointBuyCost(16)).toBeNull()
    expect(pointBuyCost(13.5)).toBeNull()
    expect(pointBuyCost(null)).toBeNull()
  })

  it('starts at the floor with the whole budget unspent', () => {
    const start = defaultAssignmentForMethod('point-buy')

    expect(start).toEqual(filledAssignment(POINT_BUY_MIN))
    expect(pointBuySpent(start)).toBe(0)
    expect(pointBuyRemaining(start)).toBe(POINT_BUY_BUDGET)
  })

  it('spends the budget exactly on a canonical 27-point spread', () => {
    // 15/15/15/8/8/8 -> 9+9+9 = 27.
    const spread = assign({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })

    expect(pointBuySpent(spread)).toBe(27)
    expect(pointBuyRemaining(spread)).toBe(0)
    expect(isCompletePointBuy(spread)).toBe(true)
  })

  it('will not raise past the ceiling', () => {
    const atMax = assign({ ...filledAssignment(POINT_BUY_MIN), str: POINT_BUY_MAX })
    expect(canRaisePointBuy(atMax, 'str')).toBe(false)
  })

  it('will not raise when the NEXT STEP costs more than the remaining budget', () => {
    // 26 of 27 spent, str at 13. The step to 14 costs 2, not 1, so a naive
    // `remaining > 0` check would wrongly allow it.
    const nearlySpent = assign({ str: 13, dex: 15, con: 15, int: 9, wis: 8, cha: 8 })

    expect(pointBuySpent(nearlySpent)).toBe(5 + 9 + 9 + 1 + 0 + 0)
    expect(pointBuyRemaining(nearlySpent)).toBe(3)
    expect(canRaisePointBuy(nearlySpent, 'str')).toBe(true)

    const exactlyOneLeft = assign({ str: 13, dex: 15, con: 15, int: 11, wis: 8, cha: 8 })
    expect(pointBuyRemaining(exactlyOneLeft)).toBe(1)
    expect(canRaisePointBuy(exactlyOneLeft, 'str')).toBe(false)
    // But a step that really does cost 1 is still allowed.
    expect(canRaisePointBuy(exactlyOneLeft, 'wis')).toBe(true)
  })

  it('will not lower past the floor', () => {
    expect(canLowerPointBuy(filledAssignment(POINT_BUY_MIN), 'str')).toBe(false)
    expect(canLowerPointBuy(filledAssignment(10), 'str')).toBe(true)
  })

  it('is incomplete when any ability is out of the buyable range', () => {
    expect(isCompletePointBuy(assign({ ...filledAssignment(8), str: 18 }))).toBe(false)
  })

  it('is incomplete when the spread costs more than the budget', () => {
    const overspent = filledAssignment(15)
    expect(pointBuySpent(overspent)).toBe(54)
    expect(isCompletePointBuy(overspent)).toBe(false)
  })
})

describe('Manual entry', () => {
  it('accepts any whole number within the storage bounds', () => {
    expect(isCompleteManual(filledAssignment(10))).toBe(true)
    expect(isCompleteManual(filledAssignment(MIN_STORED_ABILITY_SCORE))).toBe(true)
    expect(isCompleteManual(filledAssignment(MAX_STORED_ABILITY_SCORE))).toBe(true)
    // Deliberately permissive: 18 is not point-buy legal, and Manual exists
    // precisely to record a rolled or GM-granted score.
    expect(isCompleteManual(assign({ str: 18, dex: 17, con: 16, int: 9, wis: 7, cha: 3 }))).toBe(true)
  })

  it('rejects out-of-bounds, fractional, and unassigned values', () => {
    expect(isCompleteManual(filledAssignment(0))).toBe(false)
    expect(isCompleteManual(filledAssignment(31))).toBe(false)
    expect(isCompleteManual(filledAssignment(10.5))).toBe(false)
    expect(isCompleteManual(assign({ str: 10 }))).toBe(false)
  })
})

describe('Roll (stubbed)', () => {
  it('is declared as a method but reported unavailable', () => {
    expect(ABILITY_SCORE_METHODS).toContain('roll')
    expect(isAbilityScoreMethodAvailable('roll')).toBe(false)
    expect(isAbilityScoreMethodAvailable('manual')).toBe(true)
  })

  it('can never be complete, so it cannot gate a character into a saveable state', () => {
    expect(isCompleteForMethod('roll', filledAssignment(12))).toBe(false)
  })
})

describe('switching methods without losing data', () => {
  it('carries a completed Standard Array into Manual, which can represent anything', () => {
    expect(canRepresent('manual', STANDARD_ARRAY_ASSIGNMENT)).toBe(true)
    expect(seedAssignmentForMethod('manual', STANDARD_ARRAY_ASSIGNMENT)).toEqual(STANDARD_ARRAY_ASSIGNMENT)
  })

  it('carries a legal point-buy spread into Point Buy', () => {
    const spread = assign({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })
    // The standard array happens to also be a legal 27-point buy.
    expect(pointBuySpent(spread)).toBe(27)
    expect(seedAssignmentForMethod('point-buy', spread)).toEqual(spread)
  })

  it('refuses to carry numbers a method cannot represent, opening at its own default instead', () => {
    // 18 is outside the buyable range: seeding Point Buy with it would
    // either silently clamp the player's number or open in an illegal state.
    const rolled = assign({ str: 18, dex: 16, con: 15, int: 12, wis: 10, cha: 8 })

    expect(canRepresent('point-buy', rolled)).toBe(false)
    expect(seedAssignmentForMethod('point-buy', rolled)).toEqual(defaultAssignmentForMethod('point-buy'))

    // ...and a non-array set cannot become a Standard Array.
    expect(canRepresent('standard-array', rolled)).toBe(false)
    expect(seedAssignmentForMethod('standard-array', rolled)).toEqual(emptyAssignment())
  })

  it('never seeds from an incomplete assignment', () => {
    expect(seedAssignmentForMethod('manual', assign({ str: 15 }))).toEqual(defaultAssignmentForMethod('manual'))
  })

  it('never carries anything into the stubbed Roll method', () => {
    expect(canRepresent('roll', STANDARD_ARRAY_ASSIGNMENT)).toBe(false)
  })
})

describe('toAbilityScores', () => {
  it('returns the six numbers once every ability is assigned', () => {
    expect(toAbilityScores(STANDARD_ARRAY_ASSIGNMENT)).toEqual({
      str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8
    })
  })

  it('returns null -- never a row of zeroes -- while anything is unassigned', () => {
    expect(toAbilityScores(assign({ str: 15, dex: 14, con: 13, int: 12, wis: 10 }))).toBeNull()
  })
})

describe('normalizeStoredAbilityScores -- the server-side validator', () => {
  const valid = { method: 'point-buy', scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }

  it('accepts a well-formed record and preserves the method as provenance', () => {
    expect(normalizeStoredAbilityScores(valid)).toEqual(valid)
  })

  it('coerces numeric strings, which an <input type="number"> round-trip produces', () => {
    const result = normalizeStoredAbilityScores({
      method: 'manual',
      scores: { str: '15', dex: '14', con: '13', int: '12', wis: '10', cha: '8' }
    })

    expect(result?.scores).toEqual({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })
  })

  it('rejects a record missing any ability rather than defaulting it', () => {
    expect(normalizeStoredAbilityScores({ method: 'manual', scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10 } })).toBeNull()
  })

  it('rejects non-integer, out-of-bounds, and non-numeric values', () => {
    const bad = [
      { ...valid.scores, str: 10.5 },
      { ...valid.scores, str: 0 },
      { ...valid.scores, str: 31 },
      { ...valid.scores, str: 'strong' },
      { ...valid.scores, str: null },
      { ...valid.scores, str: Number.NaN },
      { ...valid.scores, str: Number.POSITIVE_INFINITY }
    ]

    for (const scores of bad) {
      expect(normalizeStoredAbilityScores({ method: 'manual', scores })).toBeNull()
    }
  })

  it('rejects a payload that is not an object carrying `scores`', () => {
    for (const value of [null, undefined, 'nope', 42, [], {}, { scores: null }, { scores: [] }]) {
      expect(normalizeStoredAbilityScores(value)).toBeNull()
    }
  })

  it('degrades an unreadable method to manual rather than losing the scores', () => {
    // The SCORES are the player's data and must survive; the method is
    // provenance metadata.
    expect(normalizeStoredAbilityScores({ method: 'telepathy', scores: valid.scores })?.method).toBe('manual')
    expect(normalizeStoredAbilityScores({ scores: valid.scores })?.method).toBe('manual')
  })

  it('does NOT re-litigate point-buy legality on a stored record', () => {
    // A GM nudging a point-buy character's Strength to 18 has not made the
    // record invalid -- "store exactly what the player entered".
    const nudged = { method: 'point-buy', scores: { ...valid.scores, str: 18 } }
    expect(normalizeStoredAbilityScores(nudged)).toEqual(nudged)
  })
})

describe('the player-data / rules boundary', () => {
  it('exports no derivation helper of any kind', async () => {
    const module = await import('../../../app/lib/characters/ability-scores')
    const exported = Object.keys(module).join(' ').toLowerCase()

    // Modifiers, saves, skills, AC, HP, initiative are the Rules Engine's.
    // If one of these ever appears here, the boundary has moved and this
    // test is the place that should stop it.
    for (const forbidden of ['modifier', 'savingthrow', 'skillbonus', 'armorclass', 'hitpoint', 'initiative', 'proficiencybonus']) {
      expect(exported).not.toContain(forbidden)
    }
  })

  it('imports nothing from the Rules Engine, and contains no modifier formula', async () => {
    const { readFileSync } = await import('node:fs')
    const raw = readFileSync('app/lib/characters/ability-scores.ts', 'utf8')

    // Comments are stripped first: the module's header deliberately WRITES
    // OUT the modifier formula in order to say it does not implement it, and
    // a naive scan of the whole file would flag that sentence.
    const code = raw
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')

    expect(code).not.toMatch(/from ['"].*lib\/rules/)
    // The canonical 5e modifier formula: Math.floor((score - 10) / 2).
    expect(code).not.toMatch(/-\s*10\s*\)\s*\/\s*2/)
    expect(code).not.toMatch(/Math\.floor/)
  })
})
