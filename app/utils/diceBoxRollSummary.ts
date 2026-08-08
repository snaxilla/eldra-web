// Pure helper for EldraDiceBox.client.vue's RollEvent-consuming path
// (its `rollResult` method). Extracted into its own module rather than
// staying inline in the .vue SFC specifically so it is independently
// unit-testable: this repo's Vitest setup (vitest.config.ts) has no Vue
// SFC/DOM support, so anything living inside a .vue <script setup> block
// cannot be imported by a test directly (the same reason
// app/composables/useCharacterSheetRolls.ts exists as its own file).
//
// This module knows nothing about Vue, the DOM, or the dice-box physics
// library. It turns an already-computed RollResult into the same summary
// shape EldraDiceBox's `latestRoll` state already used before this commit
// (see `summarizeRoll` in EldraDiceBox.client.vue, left unchanged for the
// still-unmigrated notation-only roll path). Every number here comes from
// the `result` argument -- nothing is computed, guessed, or rerolled.

export type DiceBoxRollSummary = {
  id: string
  label: string
  kind: string
  notation: string
  diceNotation: string
  total: number | null
  diceTotal: number | null
  diceValues: number[]
  modifier: number
  criticalOutcome: '' | 'nat20' | 'nat1'
  raw: unknown
  rolledAt: string
}

function criticalOutcomeForD20(faces: number | undefined, diceValues: number[]): '' | 'nat20' | 'nat1' {
  if (faces !== 20 || !diceValues.length) return ''
  if (diceValues.includes(20)) return 'nat20'
  if (diceValues.includes(1)) return 'nat1'
  return ''
}

// `result` is a RollResult (app/lib/rules/roll-engine.ts), typed loosely
// here (matching this component's own existing `any`-typed roll state) so
// this module has no compile-time dependency on the Rules Engine's types,
// mirroring how EldraDiceBox itself never imports Rules Engine types.
export function summarizeRollEvent(id: string, label: string, result: any): DiceBoxRollSummary {
  const dice = result?.dice
  const diceValues: number[] = Array.isArray(result?.rolls) ? result.rolls : []
  const modifier = Number(dice?.modifier || 0)
  const signedModifier = `${modifier >= 0 ? '+' : ''}${modifier}`

  return {
    id,
    label,
    kind: label,
    notation: dice ? `${dice.count}d${dice.faces}${modifier ? signedModifier : ''}` : 'manual',
    diceNotation: dice ? `${dice.count}d${dice.faces}` : '',
    total: result?.total ?? null,
    diceTotal: Array.isArray(result?.kept) ? result.kept.reduce((sum: number, value: number) => sum + value, 0) : null,
    diceValues,
    modifier,
    criticalOutcome: criticalOutcomeForD20(dice?.faces, diceValues),
    raw: result,
    rolledAt: new Date().toISOString()
  }
}
