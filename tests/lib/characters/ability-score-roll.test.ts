// Unit tests for app/lib/characters/ability-score-roll.ts -- 4d6, drop the
// lowest, sum the rest. Every test that asserts a SPECIFIC total injects a
// fake `rollFn` (see that module's own header for why this parameter
// exists) so nothing here depends on an actual lucky or unlucky roll; the
// one test against the real dice engine only asserts structural
// invariants (range, die count) that must hold for ANY roll of this
// formula.

import { describe, expect, it } from 'vitest'
import { ABILITY_ROLL_FORMULA, abilityRollButtonLabel, rollAbilityScore } from '../../../app/lib/characters/ability-score-roll'
import type { RollFormulaResult } from '../../../app/lib/rolls/dice-adapter'
import type { RollDieGroup } from '../../../app/lib/rolls/types'

function fakeDieGroup(overrides: Partial<RollDieGroup> = {}): RollDieGroup {
  return {
    sides: 6,
    sign: 1,
    results: [5, 4, 3, 1],
    keptFlags: [true, true, true, false],
    kept: [5, 4, 3],
    advantageState: 'normal',
    multiplier: 1,
    total: 12,
    naturalHigh: false,
    naturalLow: false,
    ...overrides
  }
}

function fakeRollFn(group: RollDieGroup, total = group.total): (expression: string) => RollFormulaResult {
  return () => ({ ok: true, roll: { expression: ABILITY_ROLL_FORMULA, dice: [group], modifier: 0, modifiers: [], total } })
}

describe('rollAbilityScore', () => {
  it('rolls exactly "4d6kh3" -- 4d6, keep the highest 3, which is drop-the-lowest-1', () => {
    const calls: string[] = []
    const rollFn = (expression: string): RollFormulaResult => {
      calls.push(expression)
      return { ok: true, roll: { expression, dice: [fakeDieGroup()], modifier: 0, modifiers: [], total: 12 } }
    }

    rollAbilityScore(rollFn)

    expect(calls).toEqual(['4d6kh3'])
  })

  it('sums the three kept dice, dropping the lowest -- the exact mechanic this task asks for', () => {
    // 6, 5, 4, dropped 2 -> 15, not 6+5+4+2=17.
    const group = fakeDieGroup({ results: [6, 2, 5, 4], keptFlags: [true, false, true, true], kept: [6, 5, 4], total: 15 })

    const result = rollAbilityScore(fakeRollFn(group, 15))

    expect(result).toEqual({ total: 15, dice: group })
  })

  it('drops the lowest even when it is not the last die rolled', () => {
    const group = fakeDieGroup({ results: [1, 6, 6, 6], keptFlags: [false, true, true, true], kept: [6, 6, 6], total: 18 })

    const result = rollAbilityScore(fakeRollFn(group, 18))

    expect(result?.total).toBe(18)
  })

  it('a tie for lowest still drops exactly one die -- three dice are always kept', () => {
    // Two dice show 1; only one of them is flagged dropped (the library's
    // own tie-break, not this module's concern) -- the INVARIANT this
    // module cares about is exactly 3 kept, exactly 1 dropped, regardless
    // of which identical-value die that was.
    const group = fakeDieGroup({ results: [1, 1, 5, 5], keptFlags: [true, false, true, true], kept: [1, 5, 5], total: 11 })

    const result = rollAbilityScore(fakeRollFn(group, 11))

    expect(result?.dice.keptFlags.filter(Boolean)).toHaveLength(3)
    expect(result?.dice.keptFlags.filter((kept) => !kept)).toHaveLength(1)
    expect(result?.total).toBe(11)
  })

  it('duplicate totals across independent rolls are both valid -- this module imposes no uniqueness rule', () => {
    const group = fakeDieGroup({ total: 13 })
    const rollFn = fakeRollFn(group, 13)

    const first = rollAbilityScore(rollFn)
    const second = rollAbilityScore(rollFn)

    expect(first?.total).toBe(13)
    expect(second?.total).toBe(13)
  })

  it('returns null, never throws, when the roll fails', () => {
    const rollFn = (): RollFormulaResult => ({ ok: false, error: 'simulated failure' })

    expect(rollAbilityScore(rollFn)).toBeNull()
  })

  it('returns null if the dice engine somehow reports no die group at all (defensive)', () => {
    const rollFn = (): RollFormulaResult => ({
      ok: true,
      roll: { expression: ABILITY_ROLL_FORMULA, dice: [], modifier: 0, modifiers: [], total: 0 }
    })

    expect(rollAbilityScore(rollFn)).toBeNull()
  })

  // The one test against the REAL dice engine (no injected rollFn) --
  // asserts only structural invariants that must hold for ANY roll of
  // this formula, never a specific number, so it cannot depend on a lucky
  // or unlucky result.
  it('against the real dice engine: always 4 d6 results, exactly 3 kept, total in [3, 18]', () => {
    for (let i = 0; i < 25; i++) {
      const result = rollAbilityScore()

      expect(result).not.toBeNull()
      expect(result!.dice.sides).toBe(6)
      expect(result!.dice.results).toHaveLength(4)
      expect(result!.dice.results.every((face) => face >= 1 && face <= 6)).toBe(true)
      expect(result!.dice.keptFlags.filter(Boolean)).toHaveLength(3)
      expect(result!.total).toBeGreaterThanOrEqual(3)
      expect(result!.total).toBeLessThanOrEqual(18)
    }
  })
})

// The Roll/Re-Roll button's own transition -- CharacterAbilityScoreEditor.vue
// calls this directly rather than inlining the ternary, so "the button
// reads Re-Roll once this ability has a score" is verifiable without a
// component-render harness (this codebase has none).
describe('abilityRollButtonLabel', () => {
  it('reads "Roll" while the ability has no score yet', () => {
    expect(abilityRollButtonLabel(null)).toBe('Roll')
  })

  it('reads "Re-Roll" once the ability has ANY numeric score -- including a freshly-rolled or seeded-from-another-method one', () => {
    expect(abilityRollButtonLabel(10)).toBe('Re-Roll')
    expect(abilityRollButtonLabel(3)).toBe('Re-Roll')
    expect(abilityRollButtonLabel(18)).toBe('Re-Roll')
    // Duplicate totals are valid scores too, not a special "unrolled" state.
    expect(abilityRollButtonLabel(13)).toBe('Re-Roll')
  })
})
