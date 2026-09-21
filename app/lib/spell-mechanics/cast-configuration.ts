// Cast Configuration -- Character Sheet Body Phase 1B.2.1 (Casting-Level
// Selection + Generic Structured Cast Choices + Chromatic Orb First
// Acceptance Case).
//
// ---------------------------------------------------------------------------
// WHAT THIS ANSWERS, AND WHAT IT DOES NOT
// ---------------------------------------------------------------------------
// Phase 1B.2 established Cast = "the authoritative gameplay command." This
// module establishes Cast CONFIGURATION = "the legal player decisions
// required BEFORE that command can execute" -- which casting level, and
// which of the spell's own declared choices (app/lib/spell-mechanics/types.ts's
// `SpellChoice`). It answers NEITHER "what is this spell" (CanonicalSpellMechanics
// itself) NOR "did this specific Cast succeed" (server/utils/character-cast.ts) --
// it is the pure arithmetic/validation BETWEEN those two: given a spell's
// canonical mechanics and a character's own already-derived Spell Slot
// levels, what levels/choices exist, which are actually available right
// now, and what a submitted selection resolves to.
//
// ---------------------------------------------------------------------------
// CASTING LEVEL IS SPECIAL -- KEPT SEPARATE FROM GENERIC `choices`
// ---------------------------------------------------------------------------
// A casting level is not "just another spell-defined choice": it selects
// WHICH authoritative spell-slot resource a leveled Cast consumes, something
// no `SpellChoice` option ever does. `resolveCastConfiguration`'s own
// `castLevels`/`defaultCastLevel` fields are computed from the character's
// resource state (`SpellSlotLevel[]`, app/lib/characters/spellcasting.ts's
// existing `deriveSpellSlotLevels`); `choices` is restated straight from
// `CanonicalSpellMechanics.choices`, computed from content alone. Neither
// this file nor the Cast request ever encodes a casting level as
// `choices['slot-level']` or any other opaque generic choice.
//
// ---------------------------------------------------------------------------
// PURE, SHARED, NEVER AUTHORITATIVE ON ITS OWN
// ---------------------------------------------------------------------------
// Every function here is pure (no I/O, no Directus, no Nuxt) so the CLIENT
// (CharacterActionsPanel.vue, deciding what UI to show) and the SERVER
// (server/utils/character-cast.ts, deciding what to actually accept) can
// share the identical arithmetic instead of two independently-drifting
// copies -- the same "one calculation, two readers" discipline
// character-actions.ts's own `resolveDamageAbilityModifier` already
// established for Phase 1A.1's damage presentation. Sharing the CODE is not
// the same as sharing AUTHORITY: the server always calls these functions
// against its OWN freshly-loaded `SpellSlotLevel[]`/`CanonicalSpellMechanics`,
// never trusting a client-submitted `castLevels`/`choices` result -- only a
// client-submitted `castLevel`/`choices` SELECTION, which the server
// re-validates against its own fresh derivation via these exact functions.

import type { CanonicalSpellMechanics, SpellChoice, SpellRoll } from './types'
import type { SpellSlotLevel } from '../characters/spellcasting'

// ---------------------------------------------------------------------------
// Legal casting levels
// ---------------------------------------------------------------------------

export type CastConfigurationCastLevel = {
  level: number
  // Always `true` for every entry this function returns -- see its own
  // body. Kept as an explicit field (rather than omitted) to match this
  // phase's own conceptual shape and leave room for a future distinction
  // (e.g. a level the character's class will only reach later) without a
  // shape change; nothing in 1B.2.1 populates `false` today.
  legal: boolean
  // Whether this character currently has an UNEXPENDED slot at this level
  // -- distinct from `legal`. A legal-but-unavailable level is still
  // returned (never hidden) so the UI can show it disabled, communicating
  // "the spell can be cast here, you're just out of that resource" rather
  // than silently pretending the level does not exist.
  available: boolean
}

// A cantrip (`baseLevel === 0`) never has casting levels -- returns `[]`
// unconditionally, matching this phase's own explicit "no castLevel = 0"
// rule (see CastConfigurationViewModel's own `defaultCastLevel`).
//
// For a leveled spell, LEGAL means "this character's own Spell Slot
// progression declares a slot pool at this level" (i.e. present in
// `slotLevels`, which `deriveSpellSlotLevels` already limits to levels with
// `max > 0`) AND `level >= baseLevel` -- a level below the spell's own base
// level is never legal, upcasting only ever goes up. This never invents a
// level absent from `slotLevels`: an entry only appears here because the
// character's OWN authoritative progression already produced it.
export function legalCastLevelsFor(
  baseLevel: number,
  slotLevels: readonly SpellSlotLevel[]
): CastConfigurationCastLevel[] {
  if (baseLevel <= 0) return []

  return slotLevels
    .filter((entry) => entry.level >= baseLevel)
    .map((entry) => ({ level: entry.level, legal: true, available: entry.expended < entry.max }))
    .sort((a, b) => a.level - b.level)
}

// ---------------------------------------------------------------------------
// The client view model
// ---------------------------------------------------------------------------

export type CastConfigurationViewModel = {
  // `true` when the primary action surface must open a Cast Configuration
  // panel instead of Casting immediately -- either a spell-defined choice
  // exists, or more than one legal casting level exists (this phase's own
  // "SIMPLE CASTS MUST REMAIN SIMPLE"/"SINGLE LEGAL CONFIGURATION" rules:
  // Fire Bolt, and a Magic Missile with only one legal slot level, both
  // resolve `false` here).
  requiresConfiguration: boolean
  // Always `[]` for a cantrip -- see `legalCastLevelsFor`'s own header.
  castLevels: CastConfigurationCastLevel[]
  // Restated verbatim from `CanonicalSpellMechanics.choices` (`[]` when
  // absent) -- this module adds no new choice, only reads the canonical
  // resolver's own structured output.
  choices: SpellChoice[]
  // The level a freshly-opened Cast Configuration panel should pre-select --
  // see this function's own body for the exact rule. `null` for a cantrip
  // (never a fabricated `0`) and `null` when no legal level has ever had a
  // slot at all (nothing sensible to default to).
  defaultCastLevel: number | null
  // Whether this Cast is resource-wise possible AT ALL right now -- `true`
  // unconditionally for a cantrip (no resource gate), and `true` for a
  // leveled spell only when at least one legal level is currently
  // available. Does NOT account for whether every `choices` entry has been
  // selected yet -- that is a UI input-completeness concern the component
  // owns locally, not a resource-availability one.
  canCast: boolean
}

export function resolveCastConfiguration(input: {
  mechanics: CanonicalSpellMechanics
  slotLevels: readonly SpellSlotLevel[]
}): CastConfigurationViewModel {
  const { mechanics, slotLevels } = input
  const choices = mechanics.choices ?? []

  if (mechanics.level === 0) {
    return {
      requiresConfiguration: choices.length > 0,
      castLevels: [],
      choices,
      defaultCastLevel: null,
      canCast: true
    }
  }

  const castLevels = legalCastLevelsFor(mechanics.level, slotLevels)
  const availableLevels = castLevels.filter((entry) => entry.available)

  return {
    // Per this phase's own "MULTIPLE CAST LEVELS" rule, the gate is LEGAL
    // levels, not merely available ones: a character with an available L1
    // slot and an empty-but-legal L2 slot still sees the level picker (so
    // the disabled L2 pill is visible), rather than being silently cast at
    // L1 with no indication a higher slot exists at all.
    requiresConfiguration: choices.length > 0 || castLevels.length > 1,
    castLevels,
    choices,
    defaultCastLevel: pickDefaultCastLevel(mechanics.level, castLevels),
    canCast: availableLevels.length > 0
  }
}

// Per this phase's own explicit "DEFAULT CAST LEVEL" rule: prefer the
// spell's own base level if it exists and has an available slot; otherwise
// the lowest available legal higher level; otherwise (nothing available at
// all) the lowest legal level, purely so a freshly-opened panel has SOME
// sane highlighted pill rather than none -- Cast itself stays disabled by
// `canCast` regardless, so defaulting to an unavailable level here never
// lets a cast silently execute against it.
function pickDefaultCastLevel(baseLevel: number, castLevels: readonly CastConfigurationCastLevel[]): number | null {
  const baseEntry = castLevels.find((entry) => entry.level === baseLevel)
  if (baseEntry?.available) return baseLevel

  const lowestAvailable = castLevels.filter((entry) => entry.available).sort((a, b) => a.level - b.level)[0]
  if (lowestAvailable) return lowestAvailable.level

  return castLevels[0]?.level ?? null
}

// ---------------------------------------------------------------------------
// Choice validation -- CHOICE AUTHORITY
// ---------------------------------------------------------------------------
// The one place a submitted `{ choiceId: optionId }` map is checked against
// a spell's own declared `SpellChoice[]`. Used by the server (authoritative:
// server/utils/character-cast.ts calls this against its own freshly-resolved
// `mechanics.choices`) -- the client MAY use it too for local Cast-button
// enablement, but the server's own call is what actually matters; a client
// that skipped this or got it wrong still cannot make the server accept an
// illegal selection.
//
// EVERY declared choice is required in 1B.2.1 (no optional choices modeled
// yet -- the one real example, Chromatic Orb's damage type, is not
// optional). An extra/unrecognized choiceId is rejected outright rather
// than silently ignored, matching rolls/index.post.ts's own established
// "reject the whole request, never silently drop a field" precedent.
export type ValidateSpellChoicesResult =
  | { ok: true; resolved: Record<string, string> }
  | { ok: false; message: string }

export function validateSpellChoices(
  declaredChoices: readonly SpellChoice[],
  submitted: Record<string, string> | undefined
): ValidateSpellChoicesResult {
  const submittedMap = submitted ?? {}
  const remainingKeys = new Set(Object.keys(submittedMap))
  const resolved: Record<string, string> = {}

  for (const choice of declaredChoices) {
    const optionId = submittedMap[choice.id]
    if (optionId === undefined) {
      return { ok: false, message: `Missing required choice '${choice.id}' for this spell` }
    }

    const option = choice.options.find((candidate) => candidate.id === optionId)
    if (!option) {
      return { ok: false, message: `'${optionId}' is not a legal option for choice '${choice.id}'` }
    }

    resolved[choice.id] = option.id
    remainingKeys.delete(choice.id)
  }

  if (remainingKeys.size > 0) {
    return { ok: false, message: `This spell does not declare the following choice(s): ${[...remainingKeys].join(', ')}` }
  }

  return { ok: true, resolved }
}

// The one place a validated `{ choiceId: optionId }` map is applied to a
// spell's own canonical damage -- today, exactly the 'damage-type' choice
// substituting `damage.type`. Never spell-specific: this reads the
// well-known 'damage-type' choice id (app/lib/spell-mechanics/types.ts's
// own SpellChoice.id doc comment), not a spell's name. A future non-damage
// choice kind needs its own small application function the day it exists --
// this one only ever touches `damage`.
export function applyResolvedChoicesToDamage(
  damage: SpellRoll | undefined,
  resolvedChoices: Record<string, string>
): SpellRoll | undefined {
  if (!damage) return damage
  const chosenType = resolvedChoices['damage-type']
  return chosenType ? { ...damage, type: chosenType } : damage
}
