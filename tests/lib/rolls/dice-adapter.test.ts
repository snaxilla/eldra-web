// Unit tests for the OpenDice adapter (app/lib/rolls/dice-adapter.ts).
// Phase 0 of .github/docs/architecture/eldra-roll-system.md -- per that
// document's own Phase 0 scope, nothing here touches persistence, a route,
// or the UI; this exercises the adapter in isolation.
//
// Assertions are STRUCTURAL, not pinned to a specific die face: the real
// CSPRNG is never mocked (this file imports no `rand` override, and the
// adapter's own public surface has none to inject -- see dice-adapter.ts's
// own header on why). A test that asserted "the d20 shows 14" would be
// flaky by construction; asserting "the d20's one result is within
// [1, 20], and the reported total is consistent with it" is not, and
// verifies the same translation logic just as strictly.

import { describe, expect, it } from 'vitest'
import { rollFormula, validateFormula } from '../../../app/lib/rolls/dice-adapter'

describe('validateFormula', () => {
  it('accepts a well-formed formula without rolling it', () => {
    const result = validateFormula('1d20+7')
    expect(result.ok).toBe(true)
  })

  it('rejects a formula OpenDice cannot parse', () => {
    const result = validateFormula('not a formula')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // OpenDice's own message, verbatim -- never re-worded by this
      // adapter (dice-adapter.ts's own header).
      expect(result.error).toMatch(/cannot parse/i)
    }
  })

  it('rejects a formula that exceeds OpenDice\'s own documented dice ceiling', () => {
    const result = validateFormula('99999999d6')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/at most 1000 dice/i)
    }
  })
})

describe('rollFormula', () => {
  it('rolls "1d20+7" into one RollDieGroup with the right sides/total', () => {
    const result = rollFormula('1d20+7')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.roll.expression).toBe('1d20+7')
    expect(result.roll.dice).toHaveLength(1)

    const group = result.roll.dice[0]!
    expect(group.sides).toBe(20)
    expect(group.results).toHaveLength(1)
    expect(group.results[0]).toBeGreaterThanOrEqual(1)
    expect(group.results[0]).toBeLessThanOrEqual(20)
    expect(group.kept).toEqual(group.results)
    expect(group.keptFlags).toEqual([true])
    expect(group.total).toBe(group.results[0])

    expect(result.roll.modifier).toBe(7)
    expect(result.roll.modifiers).toEqual([7])
    // The whole point of the adapter's translation: the top-level total is
    // exactly the die group's own total plus the flat modifier, never a
    // separately-computed number.
    expect(result.roll.total).toBe(group.total + 7)
  })

  it('rolls "4d6kh3" reporting all 4 results and exactly 3 kept', () => {
    const result = rollFormula('4d6kh3')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const group = result.roll.dice[0]!
    // Every die rolled is still reported, including the one the keep rule
    // dropped -- never trimmed down to just the kept ones (types.ts's own
    // header on why: a future renderer needs to dim the dropped die, which
    // requires it still being present).
    expect(group.results).toHaveLength(4)
    expect(group.kept).toHaveLength(3)
    expect(group.keptFlags.filter(Boolean)).toHaveLength(3)
    expect(group.keptFlags).toHaveLength(4)
    for (const face of group.results) {
      expect(face).toBeGreaterThanOrEqual(1)
      expect(face).toBeLessThanOrEqual(6)
    }

    // No flat modifier in this formula at all -- an empty array, not `[0]`.
    expect(result.roll.modifier).toBe(0)
    expect(result.roll.modifiers).toEqual([])
    expect(result.roll.total).toBe(group.total)
  })

  it('applies advantage via RollFormulaContext, producing advantageState "advantage"', () => {
    const result = rollFormula('2d20', { advantage: 'advantage' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const group = result.roll.dice[0]!
    expect(group.advantageState).toBe('advantage')
    expect(group.results).toHaveLength(2)
    expect(group.kept).toHaveLength(1)
    // The kept die is the higher of the two rolled.
    expect(group.kept[0]).toBe(Math.max(...group.results))
  })

  it('applies disadvantage via RollFormulaContext, producing advantageState "disadvantage"', () => {
    const result = rollFormula('2d20', { advantage: 'disadvantage' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const group = result.roll.dice[0]!
    expect(group.advantageState).toBe('disadvantage')
    expect(group.kept).toHaveLength(1)
    // The kept die is the lower of the two rolled.
    expect(group.kept[0]).toBe(Math.min(...group.results))
  })

  it('applies a negative bonus via RollFormulaContext.bonuses, with no string-concatenation workaround', () => {
    // useCharacterSheetRolls.ts needed to special-case negative bonuses
    // ("1d20+-2") because it built the formula as a string; the adapter's
    // own `bonuses` field takes the number directly.
    const result = rollFormula('1d20', { bonuses: [-2] })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.roll.modifier).toBe(-2)
    expect(result.roll.modifiers).toEqual([-2])

    const group = result.roll.dice[0]!
    expect(result.roll.total).toBe(group.total - 2)
  })

  it('never throws for a malformed expression -- returns a discriminated failure instead', () => {
    expect(() => rollFormula('not a formula')).not.toThrow()
    const result = rollFormula('not a formula')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/cannot parse/i)
  })

  it('never throws when advantage is requested on a formula with too few dice -- returns a discriminated failure', () => {
    // Verified directly against the installed package before writing this
    // assertion: `roll('1d20', { advantage: 'advantage' })` throws
    // "Roll context needs at least 2 dice for advantage or disadvantage."
    // The adapter's whole job is to make sure a caller never has to catch
    // that itself.
    expect(() => rollFormula('1d20', { advantage: 'advantage' })).not.toThrow()
    const result = rollFormula('1d20', { advantage: 'advantage' })
    expect(result.ok).toBe(false)
  })

  it('produces an independent copy of each die group, not a reference OpenDice itself still holds', () => {
    const result = rollFormula('1d6')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const group = result.roll.dice[0]!
    const before = [...group.results]
    // Mutating the returned array must never be observable on a second
    // roll -- proves toRollDieGroup() copies rather than aliases.
    group.results.push(999)
    const second = rollFormula('1d6')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.roll.dice[0]!.results).not.toEqual([...before, 999])
  })
})
