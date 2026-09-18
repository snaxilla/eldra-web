// Resolved Damage Presentation -- Character Sheet Body Phase 1A.1 Browser
// Polish (Action Row Readability + Resolved Damage Presentation).
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// The Action row answers "what will happen", not "how is that calculated" --
// see this task's own product principle. Before this module, the row's only
// damage text was `ContentAction.damage`, a presentation-only STRING a
// Content Pack (or, for Unarmed Strike, server/utils/character-actions.ts's
// own synthesis) prints as a formula: "1d6 piercing" (no modifier baked in
// -- a weapon's printed dice never include one) or, for Unarmed Strike, "1 +
// Strength modifier bludgeoning" -- prose a player would have to evaluate
// themselves during play. This module turns STRUCTURED, already-authoritative
// numbers (a weapon's `damageRoll`, Unarmed Strike's `damageFlatBase`, and
// `CharacterAction.damageAbilityModifier` -- the exact same Rules-Engine
// ability modifier server/utils/roll-events.ts's own
// createActionDamageRollEvent rolls with) into the resolved text a player
// actually wants: "1d6+2 piercing", "2 bludgeoning".
//
// ---------------------------------------------------------------------------
// NO PROSE PARSING, EVER
// ---------------------------------------------------------------------------
// `resolveActionDamage` never reads `ContentAction.damage` (the prose
// string) and never searches it for "Strength"/"Dexterity" or any other
// token -- it reads only the three already-numeric/structured fields listed
// above. If those are absent (a spell with no `damageRoll`, or a weapon/
// unarmed action whose `damageAbilityModifier` is unavailable because no
// Rules Package is activated -- see character-actions.ts's own "a missing
// Rules runtime degrades individual rows' numbers" note) this returns
// `undefined` rather than guessing, and a consumer falls back to the
// original prose string -- exactly the same "absence is legal, never a
// fabricated number" rule `CharacterActionsPanel.vue`'s own `hitOrDc` already
// follows for `attackBonus`/`saveDc`.
//
// ---------------------------------------------------------------------------
// SHARED WITH ROLL AUTHORITY, NEVER A SECOND CALCULATION
// ---------------------------------------------------------------------------
// `damageAbilityModifier` is computed exactly once, server-side, by
// server/utils/character-actions.ts's `resolveDamageAbilityModifier` --
// the SAME helper `getCharacterActions` (this module's caller, via the
// Actions list) and `resolveAttackAction` (the actual Damage Roll's own
// authority) both call. This module never re-derives an ability modifier
// from ability scores/proficiency bonus/anything else -- it only FORMATS a
// number the server already resolved.

// One resolved shape for every action's damage -- 'dice' for anything with
// real dice to roll (any weapon), 'flat' for a flat, non-dice total (Unarmed
// Strike). Never both on the same action, mirroring `ContentAction`'s own
// `damageRoll`/`damageFlatBase` mutual exclusivity.
export type ResolvedActionDamage =
  | { kind: 'dice'; count: number; faces: number; modifier: number; type?: string }
  | { kind: 'flat'; total: number; type?: string }

// Reads only already-numeric/structured fields -- see this file's own
// header on why `damage` (the prose string) is never an input here.
// Returns `undefined` when there is nothing to resolve: no dice and no
// flat base (a passive/non-damaging action), or a damage-capable action
// whose ability modifier is not yet known (Rules Package unavailable) --
// distinguishing "unknown" from a fabricated "+0" is the same discipline
// `hitOrDc` already applies to `attackBonus`.
export function resolveActionDamage(action: {
  damageRoll?: { count: number; faces: number }
  damageFlatBase?: number
  damageAbilityModifier?: number
  damageType?: string
}): ResolvedActionDamage | undefined {
  if (action.damageRoll) {
    if (action.damageAbilityModifier === undefined) return undefined
    return {
      kind: 'dice',
      count: action.damageRoll.count,
      faces: action.damageRoll.faces,
      modifier: action.damageAbilityModifier,
      type: action.damageType
    }
  }

  if (action.damageFlatBase !== undefined) {
    if (action.damageAbilityModifier === undefined) return undefined
    return { kind: 'flat', total: action.damageFlatBase + action.damageAbilityModifier, type: action.damageType }
  }

  return undefined
}

function signedModifierSuffix(modifier: number): string {
  if (modifier > 0) return `+${modifier}`
  if (modifier < 0) return `${modifier}` // `String(-1)` is already "-1".
  return ''
}

// Pure text formatting only -- no lookup, no I/O, nothing "authoritative"
// decided here. Every number this reads was already resolved by the
// server; this only decides how to WRITE it:
//   dice, positive modifier -> "1d6+2 piercing"
//   dice, zero modifier     -> "1d6 piercing"        (no "+0")
//   dice, negative modifier -> "1d6-1 piercing"
//   flat                    -> "2 bludgeoning"
//   multi-die                -> "2d6+3 slashing"
//   no damage type           -> the magnitude alone, e.g. "1d6+2"
export function formatActionDamage(damage: ResolvedActionDamage): string {
  const magnitude = damage.kind === 'dice'
    ? `${damage.count}d${damage.faces}${signedModifierSuffix(damage.modifier)}`
    : String(damage.total)

  return damage.type ? `${magnitude} ${damage.type}` : magnitude
}
