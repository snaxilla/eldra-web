// Roll System -- pure roll REQUEST construction (as opposed to
// format.ts's display formatting of an already-returned RollEventRecord,
// or history.ts's insertion logic). Eldra Roll System Phase 4B.7
// (Roll Tray Manual Dice Controls,
// .github/docs/architecture/eldra-roll-system.md,
// adr-024-authored-dice-presentation.md).
//
// `buildCustomRollRequestBody` moved here from
// app/components/admin/health/rollSandbox.ts, which now re-exports it
// unchanged -- the same "extract to app/lib/rolls/ once a second,
// non-admin consumer needs it" move Phase 2C already made for
// formatRollDieGroup/formatRollModifiers/extractServerErrorMessage (see
// app/lib/rolls/format.ts's own header). The manual dice rack below is
// that second consumer.
//
// EVERYTHING HERE ONLY EVER BUILDS A REQUEST -- it never sends one, never
// rolls anything, and never reads a result. `useWorldRolls().requestRoll`
// remains the one function that actually POSTs.

import type { RollRequestInput } from '~/composables/useWorldRolls'
import type { RollVisibility } from '~/lib/rolls/types'

// ---------------------------------------------------------------------------
// Custom roll requests -- Phase 2A/2C (Developer Sandbox), moved here
// unchanged from rollSandbox.ts.
// ---------------------------------------------------------------------------

// `sourceType: 'custom'` is the one thing every caller of this function
// wants hardcoded -- this helper exists so nothing downstream has to spell
// out the request shape by hand.
export type CustomRollFormInput = {
  expression: string
  visibility: RollVisibility
  label: string
}

export function buildCustomRollRequestBody(input: CustomRollFormInput): RollRequestInput {
  const expression = input.expression.trim()
  const label = input.label.trim()

  return {
    sourceType: 'custom',
    expression,
    visibility: input.visibility,
    // Omitted rather than sent empty -- the server already defaults an
    // absent label to the expression itself
    // (server/api/worlds/[id]/rolls/index.post.ts), so sending `''` would
    // only make this caller's own guess worse than the server's.
    ...(label ? { label } : {})
  }
}

// ---------------------------------------------------------------------------
// Manual dice rack -- Phase 4B.7. Real tabletop play frequently needs a
// roll that doesn't originate from any Character Sheet mechanic ("roll a
// d4 for gold," "everybody roll a d20," "roll me a d100 for the Wild
// Magic table"). This is the pure, testable data behind
// WorldManualDiceRack.vue: which seven dice it offers, what expression
// each sends, and what label each produces in history. It performs NO
// roll math and NEVER touches Math.random() -- every entry here only
// ever feeds `sourceType: 'custom'` into the SAME already-proven pipeline
// `buildCustomRollRequestBody` above already uses; there is no second
// roll system, only a second UI in front of the first one.
//
// ONE CLICK, ONE DIE, ON PURPOSE (this phase's own explicit scope: no
// quantity selection, no modifiers, no custom-expression UI). `expression`
// is already a plain notation STRING -- exactly what a future
// quantity/modifier control would also produce (e.g. "2d6", "3d8+4") --
// so extending this table, or replacing a single entry with a computed
// expression, is the entire integration surface a later phase needs;
// nothing about the server, the request shape, or this module's own
// contract changes when that happens.
// ---------------------------------------------------------------------------

export type ManualDieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'

export type ManualDieOption = {
  type: ManualDieType
  sides: number
  // The one thing actually sent to the server -- always exactly "1<sides>".
  // d100 is a literal 1d100 (a single 1-100 die, the tabletop
  // percentile/table-lookup convention), never reinterpreted as 2d10 or a
  // tens-and-ones pair -- OpenDice/server authority validates and rolls
  // this expression exactly as written, same as every other entry here.
  expression: string
  // The default label a manual roll produces in history, e.g. "d4 Roll".
  label: string
  // The accessible name for this die's control, e.g. "Roll a d4".
  ariaLabel: string
}

function manualDie(sides: number): ManualDieOption {
  const type = `d${sides}` as ManualDieType
  return {
    type,
    sides,
    expression: `1d${sides}`,
    label: `${type} Roll`,
    ariaLabel: `Roll a ${type}`
  }
}

// Exactly the seven dice a physical tabletop set contains, in the order a
// player would reach for them -- ascending, with d100 last as the
// deliberate outlier. This exact set and order is this phase's own
// PRODUCT GOAL.
export const MANUAL_DICE: readonly ManualDieOption[] = [4, 6, 8, 10, 12, 20, 100].map(manualDie)

// Builds the exact request body useWorldRolls().requestRoll() expects.
// Visibility is never a second selector here -- it is always whatever the
// Roll Tray's OWN existing Private/Table control (owned by the page that
// mounts the tray, e.g. sheet-v2.vue's `rollVisibility`) currently holds,
// passed in by the caller.
export function buildManualRollRequestBody(die: ManualDieOption, visibility: RollVisibility): RollRequestInput {
  return buildCustomRollRequestBody({
    expression: die.expression,
    visibility,
    label: die.label
  })
}
