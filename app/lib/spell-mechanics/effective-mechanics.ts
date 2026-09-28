// Effective Spell Mechanics -- Character Sheet Body Phase 1B.5 (Executable
// Spell Scaling + Upcasting).
//
// The ONE pure function that turns a spell's CANONICAL (base) roll plus
// "what castLevel/character level is this Cast actually happening at" into
// the EFFECTIVE roll this specific Cast should use -- the exact "resolve
// effective mechanics" primitive this task's own spec describes. Both the
// server (server/utils/character-cast.ts, the only place a roll is ever
// actually persisted) and, if a future presentation task wants a preview,
// the client consume this SAME function, mirroring
// app/lib/spell-mechanics/cast-capability.ts's own "one predicate, both
// sides of the app/server boundary" precedent exactly.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DOES NOT DO
// ---------------------------------------------------------------------------
// It never mutates `CanonicalSpellMechanics` or the `SpellRoll` it is given
// -- every return is a NEW object; the canonical definition a Content Pack
// published stays exactly what it always was, for every OTHER character who
// might Cast the same spell at a different level. It never fabricates a
// number for a roll with no `diceScaling` (the base `dice`/`modifier` pass
// straight through unchanged) and never invents scaling for target count,
// instance/projectile count, or any other non-dice mechanic --
// app/lib/spell-mechanics/dnd5e.ts's own SCALING header explains exactly
// why the real corpus gives this phase no safe way to normalize those into
// a number at all; this resolver has nothing to apply for them because
// `SpellRoll.diceScaling` was never populated for them in the first place.
//
// ---------------------------------------------------------------------------
// TWO TRIGGERS, NEVER CONFLATED
// ---------------------------------------------------------------------------
// A cantrip's dice scale by CHARACTER level (RAW "Cantrip Upgrade" --
// Fire Bolt is 1d10 for a level-1 character, 2d10 for a level-5 one,
// regardless of any spell slot, because a cantrip spends none). A leveled
// spell's dice scale by CAST level (RAW "Using a Higher-Level Spell Slot"
// -- Fireball is 8d6 at its own base level 3, 9d6 if the caster spends a
// level-4 slot on it). These are never the same number for the same
// character (a level-9 Wizard's Fire Bolt cares about 9; that same
// Wizard's Fireball, cast with a level-5 slot, cares about 5) -- passing
// the wrong one in would silently apply the wrong spell's own scaling
// shape, which is exactly why `SpellDiceScaling.trigger` (types.ts) is a
// discriminant this function switches on rather than a single generic
// "level" input the caller could accidentally mix up.
import type { CanonicalSpellMechanics, SpellDice, SpellRoll } from './types'

export type SpellEffectiveContext = {
  // The exact castLevel THIS Cast already resolved to -- server/utils/
  // character-cast.ts's own `resolveRequestedCastLevel` output, already
  // validated against this character's own legal Spell Slot levels before
  // this function is ever called. `null` for a cantrip (no slot, no cast
  // level), matching `resolveRequestedCastLevel`'s own level-or-null
  // contract exactly -- never a fabricated `0`.
  castLevel: number | null
  // This character's own total level (`value:level`, the identical
  // Rules-Engine-derived, already-class-agnostic fact
  // server/utils/character-cast.ts's own `checkSpellSlotAvailability`
  // already reads for Spell Slot progression -- see
  // server/utils/character-actions.ts's own `characterLevel` field for
  // where THIS function's caller gets it). Only ever consulted for a roll
  // whose own `diceScaling.trigger` is 'character-level'; a caller
  // resolving a leveled spell's damage/healing never needs this to be
  // meaningful, since that branch is never taken for a 'cast-level' roll.
  characterLevel: number
}

// `EffectiveSpellRoll` is `SpellRoll` minus `diceScaling` -- the projection
// this Cast should actually use, not a second copy of the scaling RULE that
// already ran. Every other field (`modifier`, `type`, `saveOutcome`,
// `usesSpellcastingModifier`) survives unchanged: scaling only ever changes
// `dice`, never anything else a Cast already correctly derives elsewhere
// (the caster's own spellcasting ability modifier, in particular, is added
// by the CALLER, exactly once, entirely independently of whether this
// function changed `dice` at all).
export type EffectiveSpellRoll = Omit<SpellRoll, 'diceScaling'>

// Finds the highest character-level tier at or below `characterLevel` --
// `tiers` is sorted ascending and always includes the base (lowest) tier
// (see `SpellDiceScaling`'s own header), so this always has an answer, even
// for a level-1 character who has not reached any upgrade threshold yet.
function resolveTierDice(tiers: readonly { level: number; dice: SpellDice }[], characterLevel: number): SpellDice {
  let dice = tiers[0]!.dice
  for (const tier of tiers) {
    if (tier.level <= characterLevel) dice = tier.dice
  }
  return dice
}

// The one function both Cast paths (server/utils/character-cast.ts's own
// `castSpellHeal`/`rollIndependentSpellDamage`/`castSpellAutomaticDamage`/
// `castSpellSave`) call for EVERY roll they build, scaled or not -- a roll
// with no `diceScaling` (most of them) passes through with `dice`/
// `modifier`/everything else byte-identical to what
// resolveDnd5eSpellMechanics already produced, so calling this
// unconditionally is never a behavior change for a spell 1B.5's own corpus
// audit found no reliable scaling for.
export function resolveEffectiveSpellRoll(
  roll: SpellRoll | undefined,
  baseLevel: number,
  context: SpellEffectiveContext
): EffectiveSpellRoll | undefined {
  if (!roll) return undefined

  const scaling = roll.diceScaling
  if (!scaling || !roll.dice) {
    const { diceScaling: _unused, ...unscaled } = roll
    return unscaled
  }

  const { diceScaling: _unused, ...base } = roll

  if (scaling.trigger === 'character-level') {
    return { ...base, dice: resolveTierDice(scaling.tiers, context.characterLevel) }
  }

  // 'cast-level' -- a cantrip never reaches here (cantrip `diceScaling` is
  // always 'character-level', see dnd5e.ts's own resolver), so
  // `context.castLevel` is only ever null here if a caller mis-derived
  // `castLevel` for a leveled spell, which `resolveRequestedCastLevel`
  // never does -- falling back to `baseLevel` (zero extra levels, i.e. the
  // canonical base dice) is therefore a defensive no-op, never a real path.
  const effectiveLevel = context.castLevel ?? baseLevel
  const extraLevels = Math.max(0, effectiveLevel - baseLevel)
  const dice = { count: roll.dice.count + extraLevels * scaling.perLevelDiceCount, faces: roll.dice.faces }
  return { ...base, dice }
}

// Convenience wrapper for the common "resolve this spell's own damage/
// healing" call shape -- `mechanics.level` is always the correct
// `baseLevel` for either roll (a spell's damage and healing, on the rare
// hypothetical spell with both, always share the same base spell level).
export function resolveEffectiveDamage(
  mechanics: CanonicalSpellMechanics,
  context: SpellEffectiveContext
): EffectiveSpellRoll | undefined {
  return resolveEffectiveSpellRoll(mechanics.damage, mechanics.level, context)
}

export function resolveEffectiveHealing(
  mechanics: CanonicalSpellMechanics,
  context: SpellEffectiveContext
): EffectiveSpellRoll | undefined {
  return resolveEffectiveSpellRoll(mechanics.healing, mechanics.level, context)
}
