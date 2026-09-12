// Roll System -- the OpenDice adapter. Phase 0 of
// .github/docs/architecture/eldra-roll-system.md (see that document's §1
// for the OpenDice research this implements against, and its Phase 0 entry,
// §14, for this file's exact scope: a thin, pure wrapper, no persistence,
// no route, no UI).
//
// THIS IS THE ONE FILE IN THE APP ALLOWED TO IMPORT `opendice`. Every other
// module -- present and future -- imports `RollDieGroup`/`RolledFormula`
// from here (or from ./types), never `DieGroup`/`RollResult` from the
// package directly. If OpenDice ever changes its exports, its result
// shape, or its error behavior, this file is the only one that needs to
// change to keep every caller's contract stable -- that promise is the
// entire reason this module exists rather than every future call site
// importing `roll`/`parseFormula` itself.
//
// COMPUTES NOTHING GAME-SPECIFIC. Matching `characterDerivedValues.ts`'s
// own discipline for Rules Engine output, and OpenDice's own README
// ("It has no rules of its own... whether a total passes or fails -- all
// of that is the caller's"): this module knows dice notation and nothing
// else. No ability name, no skill name, no critical-hit rule, no advantage
// SOURCE (a condition, a spell) is named or inferred here -- a caller
// (eldra-roll-system.md's future §3 derivation logic) decides those; this
// file only executes the formula it's handed and reports what happened.
//
// NO-THROW, MATCHING THE ROLL-ADJACENT CONVENTION ALREADY ESTABLISHED IN
// THIS CODEBASE. `app/lib/rules/roll-service.ts`'s own header states its
// rule plainly: "Never throws; always returns a RollEvent." OpenDice itself
// throws on a malformed formula (by design -- see its own README, quoted in
// eldra-roll-system.md §1: "anything a formula cannot mean throws"). This
// adapter is where that impedance mismatch is resolved: `rollFormula`/
// `validateFormula` catch OpenDice's exceptions and translate them into the
// same `{ ok: boolean }` discriminated-result shape `WorldRollRequestResult`
// (server/utils/world-rules-roll.ts) and `RollEvent` (roll-service.ts)
// already use, so a future caller (Phase 1's `POST /rolls` route) never
// needs its own try/catch around a third-party exception.
//
// NO `rand` IN THE PUBLIC SURFACE, ON PURPOSE. OpenDice's own `RollContext`
// accepts a `rand` override, and its own README is explicit that this
// exists for tests only ("never one a user of your program can choose" --
// quoted in eldra-roll-system.md §1/§13). `RollFormulaContext` below
// structurally cannot carry one -- the same "cannot carry a seed even if a
// caller tried" shape `world-rules-roll.ts`'s own `WorldRollInput.context`
// already uses for the identical reason. A future test that needs a pinned
// result calls `opendice`'s own `roll()` directly with its own `rand`, or
// this module gains a clearly-separate, explicitly test-only export when a
// later phase's test suite actually needs one -- not before, and not as
// part of the same call a request body could ever reach.

import { roll, parseFormula, type DieGroup, type AdvantageState } from 'opendice'
import type { RollAdvantageState, RollDieGroup } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// What a caller may ask for beyond the formula string itself -- exactly
// eldra-roll-system.md §14's own Phase 0 signature
// (`ctx?: { advantage?; bonuses?: (number|string)[] }`), typed here rather
// than as OpenDice's own `RollContext` so nothing outside this file ever
// names an OpenDice type.
export type RollFormulaContext = {
  // Applied to the sole eligible dice group, matching OpenDice's own
  // behavior (a formula needs at least two dice in that one group for
  // either to mean anything -- OpenDice itself rejects the mismatch,
  // surfaced below as an `{ ok: false }` result, never guessed at here).
  advantage?: Extract<RollAdvantageState, 'advantage' | 'disadvantage'>
  // Extra terms to add: plain numbers, or formula fragments (e.g. '1d4').
  // Negative numbers work directly -- `bonuses: [-2]` -- unlike the
  // string-concatenation `"1d20+" + bonus` shape
  // `useCharacterSheetRolls.ts` needed to hand-roll for the same case.
  bonuses?: (number | string)[]
}

// The result of one roll computation -- everything `eldra-roll-system.md`
// §6's `RollEventRecord` needs from the dice mechanics themselves. A future
// Phase 1 write path spreads this into a `RollEventRecord` alongside the
// persistence-specific fields (id, worldId, rollerUserId, ...) this module
// has no business knowing about.
export type RolledFormula = {
  expression: string
  dice: RollDieGroup[]
  modifier: number
  modifiers: number[]
  total: number
}

export type RollFormulaResult =
  | { ok: true; roll: RolledFormula }
  | { ok: false; error: string }

export type FormulaValidationResult =
  | { ok: true }
  | { ok: false; error: string }

// Reads a formula without rolling it -- OpenDice's own `parseFormula`,
// wrapped so a caller (a future Phase 1 route, checking a `custom` roll's
// input before committing to anything) never touches the package directly
// or its exception. Mirrors OpenDice's own stated purpose for this
// function verbatim: "Reads a formula without rolling it, for checking
// input."
export function validateFormula(expression: string): FormulaValidationResult {
  try {
    parseFormula(expression)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
}

// Rolls a formula through OpenDice and reports what happened -- never
// throws (see this file's own header). A malformed formula, a formula
// exceeding OpenDice's own documented limits (MAX_DICE, MAX_SIDES, ...),
// or an advantage request that doesn't apply to this formula's shape all
// come back as `{ ok: false, error }`, carrying OpenDice's own
// human-readable message verbatim -- never re-worded, never silently
// coerced into a different formula.
export function rollFormula(expression: string, ctx?: RollFormulaContext): RollFormulaResult {
  try {
    const result = roll(expression, toRollContext(ctx))
    return {
      ok: true,
      roll: {
        expression: result.formula,
        dice: result.dice.map(toRollDieGroup),
        modifier: result.modifier,
        modifiers: [...result.modifiers],
        total: result.total
      }
    }
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function toRollContext(ctx: RollFormulaContext | undefined): { advantage?: AdvantageState; bonuses?: (number | string)[] } | undefined {
  if (!ctx) return undefined
  return {
    advantage: ctx.advantage,
    bonuses: ctx.bonuses
  }
}

// A defensive, independent copy -- never a reference into whatever OpenDice
// itself still holds -- of one die group, translated field-for-field into
// this app's own restated shape (types.ts's own header explains why).
function toRollDieGroup(group: DieGroup): RollDieGroup {
  return {
    sides: group.sides,
    sign: group.sign,
    results: [...group.results],
    keptFlags: [...group.keptFlags],
    kept: [...group.kept],
    advantageState: group.advantageState,
    multiplier: group.multiplier,
    total: group.total,
    naturalHigh: group.naturalHigh,
    naturalLow: group.naturalLow
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
