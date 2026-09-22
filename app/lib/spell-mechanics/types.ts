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

// Character Sheet Body Phase 1B.3 (Saving-Throw Spell Casting) -- the
// SMALLEST generic representation the real corpus reliably supports for
// "what happens to THIS damage roll when the target's saving throw
// succeeds." Derived from the corpus audit (see resolveDnd5eSpellMechanics's
// own header): of 154 real saving-throw spells, 58 state "half as much
// damage on a successful save" (Fireball) and 12 state the disjunctive
// "succeeds ... or takes NdM damage" shape (Acid Splash -- damage ONLY on a
// failed save, nothing on success) -- two genuinely different, reliably
// distinguishable outcomes, never conflated. `'deferred'` is deliberately
// NOT a member here: the remaining ~21 damage-bearing save spells whose
// prose matches neither pattern (Disintegrate, the smite spells, ...) are
// left with NO `saveOutcome` at all -- absence already means "not reliably
// known," the same "absence is legal" rule every optional field in this
// codebase already follows; a third enum member carrying the identical
// meaning would just be a second way to say the same thing.
export type SpellSaveOutcome = 'half-on-save' | 'no-damage-on-save'

// A dice roll plus whatever flat, non-dice addend the source states --
// Magic Missile's "+1" must survive here. `modifier` is always a number
// (0 when the source states none), never optional, so a consumer never has
// to treat "no modifier" and "unknown modifier" as the same absence.
export type SpellRoll = {
  dice?: SpellDice
  modifier: number
  type?: string
  // Only ever populated for a saving-throw spell's own damage roll (never
  // for `healing`, and never for an attack-roll/automatic spell's damage,
  // neither of which has a "save" for this to describe) -- see
  // `SpellSaveOutcome`'s own header for the reliability rule.
  saveOutcome?: SpellSaveOutcome
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

// ---------------------------------------------------------------------------
// GENERIC SPELL-DEFINED CHOICES -- Character Sheet Body Phase 1B.2.1 (Cast
// Configuration: Casting-Level Selection + Generic Structured Cast Choices +
// Chromatic Orb First Acceptance Case)
// ---------------------------------------------------------------------------
// The smallest generic shape for "this spell requires the PLAYER to pick one
// of several legal mechanical values before it can be Cast" -- Chromatic
// Orb's damage type is the first (and, per this phase's own corpus audit,
// currently only reliably-structured) real example, but nothing below names
// damage or Chromatic Orb: a future spell whose source reveals a DIFFERENT
// choice-shaped mechanic (an ability, an effect mode) populates a second
// `SpellChoice` with a different `id`, and the exact same Cast Configuration
// machinery (app/lib/spell-mechanics/cast-configuration.ts) collects and
// validates it with no new generic code -- only a new resolver-side
// extraction, exactly like this phase's own `resolveDnd5eSpellMechanics`
// extraction for damage type.
//
// `SpellChoiceOption.id` is the value BOTH the client submits and the server
// independently re-validates against this exact array -- never a client-
// trusted free-form mechanical value (a submitted `damage-type: 'lightning'`
// is only ever accepted because 'lightning' is verified to be one of THESE
// options' own ids, sourced from canonical content, never because the
// client's string was trusted directly). `label` is presentation only
// ("Lightning"); `id` is the value ("lightning") -- kept identical today
// (5etools' own lowercase damage-type strings need no further mapping) but
// typed separately so a future choice kind whose id and label genuinely
// differ (e.g. an ability key 'str' vs. label 'Strength') needs no shape
// change here.
export type SpellChoiceOption = {
  id: string
  label: string
}

export type SpellChoice = {
  // A stable, well-known id for WHICH mechanic this choice resolves --
  // 'damage-type' is the one kind this phase populates. Never a spell name,
  // never spell-specific: any future spell whose source reveals the exact
  // same "which damage type" mechanic reuses this identical id.
  id: string
  label: string
  options: SpellChoiceOption[]
}

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

  // Character Sheet Body Phase 1B.2.1 addition -- the STRUCTURED upgrade of
  // the Chromatic Orb finding (see `hasUnresolvedChoice` immediately below
  // for the compatibility flag this supersedes as the primary signal).
  // Populated ONLY when the source reliably represents a real player choice
  // structurally (today: `damageInflict` naming more than one legal type
  // AND exactly one `{@damage}` tag in the spell's base entries -- see
  // resolveDnd5eSpellMechanics's own header for why the second condition
  // matters: several spells list multiple `damageInflict` types because
  // they deal SEVERAL DIFFERENT typed damage components at once, which is
  // not a player choice at all and must never be represented as one).
  // Absent, never an empty array, when this phase found no reliably-
  // structured choice -- the same "absence is legal" rule every optional
  // field in this codebase already follows.
  choices?: SpellChoice[]

  // Character Sheet Body Phase 1B.2 addition, REDEFINED by 1B.2.1 as a
  // DERIVED compatibility/capability flag rather than an independently
  // computed one -- see this file's own new `choices` field above, now the
  // primary structured representation. `true` exactly when the source shows
  // evidence of a choice-shaped mechanic (`damageInflict` naming more than
  // one legal type) that `choices` above did NOT end up structurally
  // representing (the multiple-simultaneous-damage-types case, e.g. Ice
  // Storm's bludgeoning-AND-cold, where "pick one" would misrepresent a
  // spell that in fact deals both) -- i.e. `damageInflict.length > 1 &&
  // !choices?.length`, computed once in resolveDnd5eSpellMechanics, never a
  // second independently-drifting boolean. `server/utils/character-cast.ts`'s
  // `classifySpellCastCapability` still gates on this exactly as before:
  // Chromatic Orb's `hasUnresolvedChoice` is now `false` (its choice moved
  // into `choices`), which is what lets its capability classification
  // proceed to `supported-spell-attack` with no change to that classifier's
  // own code at all.
  hasUnresolvedChoice?: boolean
}

// One game system's translation of raw Content Pack `data` into this
// shape. Returns `null` when the data is unusable or the spell has no
// mechanics this phase can responsibly extract -- never a thrown error, the
// same "absence is legal" posture app/lib/content-actions/types.ts's own
// ContentActionResolver already establishes.
export type SpellMechanicsResolver = (data: unknown) => CanonicalSpellMechanics | null
