// Rolling for Ability Scores -- 4d6, drop the lowest, sum the rest. One
// ability at a time (see app/lib/characters/ability-scores.ts's own
// isCompleteRoll/canRepresent for the entry-constraint rules this
// produces data for, and CharacterAbilityScoreEditor.vue for where a
// player actually triggers this).
//
// WHY THIS IS A SEPARATE FILE FROM ability-scores.ts: that module's own
// header draws a hard line -- "no I/O, no Vue, no Directus, no framework"
// -- around the six-number MODEL (completeness, the point-buy cost table,
// standard-array multiset matching). Rolling is a distinct concern, HOW a
// number gets produced rather than what shape it must have once it
// exists, and it depends on app/lib/rolls/dice-adapter.ts, the one
// sanctioned entry point into the OpenDice engine. Keeping that import out
// of ability-scores.ts keeps that file's own "pure, zero dependency beyond
// its own types" claim literally true.
//
// "4d6kh3" -- OpenDice's own keep-highest-N notation (its README: "Roll
// four d6, keep the highest 3") -- means exactly "roll four, drop the
// lowest one, sum what's left." No hand-rolled dice math needed here.
import { rollFormula, type RollFormulaResult } from '~/lib/rolls/dice-adapter'
import type { RollDieGroup } from '~/lib/rolls/types'

export const ABILITY_ROLL_FORMULA = '4d6kh3'

export type AbilityRollResult = {
  total: number
  // The single die group OpenDice reports for this formula -- `results`
  // (all four faces, in roll order) and `keptFlags` (which three were
  // kept) are exactly what a compact dice visual needs to show the
  // dropped die distinctly from the kept ones, without this module
  // knowing anything about how that is drawn.
  dice: RollDieGroup
}

// `rollFn` defaults to the real dice engine; tests substitute a fake
// returning a pinned result -- dice-adapter.ts's own header is explicit
// that a caller needing a deterministic result should either call
// OpenDice's own `roll()` directly with its own `rand`, in a test, or
// this module gains "a clearly-separate, explicitly test-only export"
// scoped to the one caller that needs it. This parameter IS that: it
// widens nothing about rollFormula's own public contract, which still
// has no `rand` anywhere a request body could ever reach.
//
// Never throws. "4d6kh3" is a fixed, always-valid formula, so
// `rollFn(...).ok` failing would mean a genuine library defect, not a bad
// input -- this function returns null in that case rather than
// propagating, and the Builder UI treats null exactly like "nothing
// rolled yet," the same as any other not-yet-populated ability.
export function rollAbilityScore(
  rollFn: (expression: string) => RollFormulaResult = rollFormula
): AbilityRollResult | null {
  const result = rollFn(ABILITY_ROLL_FORMULA)
  if (!result.ok) return null

  const [group] = result.roll.dice
  if (!group) return null

  return { total: result.roll.total, dice: group }
}

// The one decision CharacterAbilityScoreEditor.vue's Roll button makes --
// extracted as a pure function (the same "small, named, directly-tested
// decision" shape app/lib/characters/ability-scores.ts already uses for
// canRaisePointBuy/canLowerPointBuy/canStepManual) so "the button reads
// Re-Roll once this ability has a score" is a unit-testable fact, not
// only an inline template ternary a browser test would be needed to see.
export function abilityRollButtonLabel(currentScore: number | null): 'Roll' | 'Re-Roll' {
  return typeof currentScore === 'number' ? 'Re-Roll' : 'Roll'
}
