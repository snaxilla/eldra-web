// Canonical Spell Mechanics -- Character Sheet Body Phase 1B.1.
//
// See app/lib/content-actions/types.ts's own header for the layering rule
// this family extends one step further upstream: `ContentAction` restates
// a fact a Content Pack already publishes, for ANY action-granting content
// (weapon, spell, feature) uniformly. This file is narrower and earlier in
// the pipeline -- SPELL-SPECIFIC, and the thing `ContentAction` for a spell
// is now a PROJECTION of, not a second independent parse of the same raw
// JSON. See resolveSpellAction in app/lib/content-actions/dnd5e.ts, which
// calls resolveDnd5eSpellMechanics and maps its result onto `ContentAction`'s
// generic shape -- one parser, two consumers.
//
// ---------------------------------------------------------------------------
// WHY A SEPARATE FAMILY, NOT A BIGGER ContentAction
// ---------------------------------------------------------------------------
// A weapon and a class Feature have no "spell level", no "concentration",
// no "saving-throw ability", and never will -- folding those fields onto
// `ContentAction` would make it a spell-shaped type wearing a weapon-shaped
// name. Keeping them separate is also what "external formats are SOURCE
// formats, not Eldra's runtime schema" (this task's own accepted principle)
// requires: `CanonicalSpellMechanics` is Eldra's own normalized shape for
// "what a spell mechanically is", produced from 5etools JSON today and,
// eventually, from a GM-authored Homebrew spell too -- `ContentAction`
// has no equivalent ambition; it stays the generic "what can a character DO"
// projection every action-granting content type shares.
//
// ---------------------------------------------------------------------------
// SCOPE -- WHAT THIS PHASE NORMALIZES, AND WHAT IT DELIBERATELY DEFERS
// ---------------------------------------------------------------------------
// Identity/display, resolution kind (including the newly-required
// 'automatic' -- Magic Missile has neither an attack roll nor a saving
// throw, and pretending otherwise would be exactly the kind of invented
// mechanic this task forbids), and damage (dice + flat modifier + type,
// the Magic Missile regression: "1d4 + 1" must not become "1d4"). Healing
// is a typed, present-but-possibly-absent field for the identical reason:
// this phase's own investigation (see resolveDnd5eSpellMechanics's own
// header) found no reliable source signal that safely distinguishes a
// healing `{@dice}` roll from every OTHER non-damage `{@dice}` roll (Bane's
// d4 penalty, Sleep's hit-point pool, Reincarnate's d100 species table),
// so it is normalized ONLY where the evidence genuinely supports it, never
// guessed. Scaling is preserved as SOURCE TEXT plus a coarse shape tag
// (never a computed transformation) -- 1B.5's job, not this phase's.
//
// NOT modeled at all, on purpose (not even an empty placeholder field):
// target count, area/shape, buff/debuff numeric effects, persistent-effect
// state, multiclass/pact slot pool selection. Adding a slot for a concept
// with no design yet is exactly the "giant universal Spell DSL" this phase
// is scoped to avoid.

import type { AbilityKey } from '../characters/ability-scores'

export type SpellDice = { count: number; faces: number }

// A dice roll plus whatever flat, non-dice addend the source states --
// Magic Missile's "+1" must survive here. `modifier` is always a number
// (0 when the source states none), never optional, so a consumer never has
// to treat "no modifier" and "unknown modifier" as the same absence.
export type SpellRoll = {
  dice?: SpellDice
  modifier: number
  type?: string
}

// Which raw mechanic resolves this spell, and the one extra fact each
// needs. 'automatic' is a REQUIRED third option, not attack-roll or
// saving-throw in disguise -- Magic Missile deals damage with neither.
// `null` (on CanonicalSpellMechanics.resolution, not a member of this
// union) means "this phase found no structured resolution at all" -- the
// honest, common (51% of the SRD corpus) case for a purely descriptive
// spell like Shield.
export type SpellResolutionKind =
  | { kind: 'attack-roll' }
  | { kind: 'saving-throw'; savingAbility: AbilityKey }
  | { kind: 'automatic' }

// Scaling/upcast information, preserved as SOURCE TEXT with a coarse shape
// tag -- never a computed numeric transformation (that is 1B.5's job).
// Three shapes because the corpus proves one assumption ("upcast always
// means +damage dice") is false: Fireball scales damage, Bless scales
// TARGET COUNT, and a cantrip scales by character level, not slot level, a
// third axis entirely. `'prose-only'` is the fallback for a spell whose
// scaling text doesn't obviously fit either of the other two tags -- still
// preserved, never discarded.
export type SpellScaling =
  | { kind: 'prose-only'; text: string }
  | { kind: 'cantrip-level'; text: string }
  | { kind: 'slot-level'; text: string }

export type CanonicalSpellMechanics = {
  // IDENTITY / DISPLAY
  level: number
  school?: string
  castingTime?: string
  range?: string
  components?: string
  duration?: string
  concentration: boolean
  ritual: boolean
  description?: string

  // RESOLUTION
  resolution: SpellResolutionKind | null

  // DAMAGE / HEALING -- two separate optional slots, never one field
  // overloaded to mean either, so "this heals" and "this damages" can
  // never be confused even though both share the SpellRoll shape.
  damage?: SpellRoll
  // Absent in every 1B.1 output today -- see this file's header on why.
  // Typed now so 1B.4 does not need a schema migration to populate it.
  healing?: SpellRoll

  scaling?: SpellScaling
}

// One game system's translation of raw Content Pack `data` into this
// shape. Returns `null` when the data is unusable or the spell has no
// mechanics this phase can responsibly extract -- never a thrown error, the
// same "absence is legal" posture app/lib/content-actions/types.ts's own
// ContentActionResolver already establishes.
export type SpellMechanicsResolver = (data: unknown) => CanonicalSpellMechanics | null
