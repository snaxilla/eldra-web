// Rules Choice answers -- the player's side of a ChoiceSet.
//
// rules-package-architecture.md §7.6 defines a Choice Set as "the one form
// that is NEVER evaluated: a question, asked of a person, whose answer
// becomes stored state." This module is that answer -- its shape, its
// identity, and the rules for whether it is valid.
//
// It is the exact counterpart of app/lib/characters/ability-scores.ts, and
// deliberately so: both hold a player's own decisions, both are pure, both
// are re-validated on read rather than trusted, and neither computes a
// consequence of any kind. Ability scores are numbers a player picked;
// choices are options a player picked. Everything downstream of both is
// derived.
//
// ---------------------------------------------------------------------------
// WHAT THIS MODULE DELIBERATELY DOES NOT KNOW
// ---------------------------------------------------------------------------
// There is no skill name here, no ability name, no class name, and no
// mention of proficiency. It handles "N options chosen from a declared
// list", which is what a ChoiceSet IS. `choice:skill.proficiency` is the
// first ChoiceSet to use it and is not privileged by it -- a tool, language,
// or feat ChoiceSet would flow through this file unchanged, which is the
// point of proving the mechanism on one case rather than special-casing it.
//
// ---------------------------------------------------------------------------
// WHY SELECTIONS ARE DEFINITION IDs
// ---------------------------------------------------------------------------
// A ChoiceSet's options come from its `from` selector. For `fromContentFacet`
// -- the only selector the authored corpus uses -- the options are supplied
// by the content's own Rules Facet as `RulesFacetChoice.from`, which is
// typed `DefinitionId[]`. So a selection IS a Definition ID: the Fighter
// offers `value:skill.athletics.proficient` and a player picks it whole.
//
// The ChoiceSet also declares `writesTo` ("value:skill.{selected}.proficient")
// -- a TEMPLATE, per its own type comment, "not itself a resolvable
// DefinitionId." `resolveChoiceTarget` below reconciles the two without
// guessing: an option that already matches the template's shape is its own
// target, and a bare token is substituted into it. Both readings are
// deterministic and neither needs a registry.

import type { DefinitionId } from '../rules/types'

// One answered ChoiceSet: which options this player picked.
//
// Keyed by `choiceKey(slot, choiceSetId)` rather than by choiceSetId alone,
// because ONE ChoiceSet can be referenced by several slots at once -- a
// Human's Species facet and a Fighter's Class facet both point at
// `choice:skill.proficiency`, and they are two separate questions with two
// separate answers. Keying by ChoiceSet alone would silently merge them.
export type StoredRulesChoices = {
  selections: Record<string, DefinitionId[]>
}

// The separator is ':' to match the bridge's own `${slotKey}:${sourceRef}`
// SourceInstance ids -- one recognizable way to name a slot-scoped thing.
export function choiceKey(slot: string, choiceSetId: DefinitionId): string {
  return `${slot}:${choiceSetId}`
}

// Character Progression Phase 1B -- the progression-time counterpart of
// `choiceKey` immediately above. A `progression:<at>` infix (never present
// in a creation-time key, which is always exactly `${slot}:${choiceSetId}`
// with no colon-separated middle segment) makes a progression choice's key
// syntactically impossible to collide with a creation choice's key, even
// when both happen to name the SAME ChoiceSet from the SAME slot -- the two
// answers live at two different keys in the identical flat
// `StoredRulesChoices.selections` map, so persisting one can never silently
// overwrite the other (see server/utils/character-progression-plan.ts's own
// PERSISTENCE header for how a confirm write merges rather than replaces).
// `at` (the row's own package-declared threshold, e.g. a level number) is
// included because the SAME ChoiceSet id could in principle be reused by
// more than one row in the same Progression -- unlikely today, but the key
// must stay unique per ROW, not merely per ChoiceSet, to remain honestly
// stable and collision-free.
export function progressionChoiceKey(slot: string, at: unknown, choiceSetId: DefinitionId): string {
  return `${slot}:progression:${String(at)}:${choiceSetId}`
}

// The progression-time counterpart of `toResolvableChoice` above -- the
// SAME question-building rule, restated for a Progression row's own
// `{choiceSet, count, from?}` instead of a facet's, with the row's own `at`
// folded into the identity via `progressionChoiceKey`. Called by
// server/utils/character-actor-bridge.ts's own Progression-consuming loop;
// no Builder counterpart exists yet (progression choices are answered
// post-creation, through the Level Manager, never at character creation).
// `distinct` (D&D 2024 Character Rules Phase 2A.1) -- optional, mirrors the
// ChoiceSet's own `distinct` flag (app/lib/rules/types.ts). Omitted by every
// caller that has no registry access (the Builder, create-v2.post.ts),
// which is exactly correct: `validateChoiceSelection` below treats an
// undefined `distinct` as `true`, byte-identical to this field's entire
// pre-Phase-2A.1 behavior. Only server/utils/character-actor-bridge.ts,
// which DOES have `lookupChoiceSet` access, ever passes a real value.
export function toResolvableProgressionChoice(
  slot: string,
  at: unknown,
  choice: { choiceSet: DefinitionId; count: number; from?: readonly DefinitionId[] },
  distinct?: boolean
): ResolvableChoice {
  return {
    key: progressionChoiceKey(slot, at, choice.choiceSet),
    slot,
    choiceSetId: choice.choiceSet,
    count: choice.count,
    options: [...(choice.from ?? [])],
    distinct
  }
}

// ---------------------------------------------------------------------------
// CHOICE ELIGIBILITY PHASE 2B -- the generic filter.
// ---------------------------------------------------------------------------
// Pure, ActorState-shaped-but-not-ActorState-typed (a plain Record is all
// this needs, so this module keeps zero dependency on app/lib/rules' own
// ActorState type) -- called by character-actor-bridge.ts, the one place
// that both HAS the current values-so-far AND is about to build a
// ResolvableChoice's own `options`. Never called by the Builder (no
// ActorState exists yet for a character that isn't created) or by
// `validateChoiceSelection` (which validates an ANSWER against an already-
// filtered `options` list, never recomputes eligibility itself) -- exactly
// the "where does option resolution have access to ActorState" boundary
// this phase's own trace identified: only here.
//
// Two independent exclusion rules, matching the two real XPHB shapes this
// phase's own corpus audit found (never one blanket "already owned is
// illegal" rule -- that would wrongly exclude a repeatable feat pick,
// which this filter is never even consulted for, since Feat Selection is
// `fromContentCatalogue`, resolved entirely in character-derived.ts's own
// `ownedFeatRefs`, not through this path):
//   1. `excludeIfAlreadyActive` (the ChoiceSet's own flag) -- drop an
//      option whose OWN id already reads true/active (Skill Proficiency:
//      already proficient; Skill Expertise: already has Expertise).
//   2. `requiresActive[i]` (the facet's own per-option declaration) --
//      drop `from[i]` unless the NAMED prerequisite value already reads
//      true (Skill Expertise's real XPHB rule: "a skill in which you have
//      proficiency").
export function filterEligibleOptions(
  from: readonly DefinitionId[],
  requiresActive: readonly (DefinitionId | null)[] | undefined,
  excludeIfAlreadyActive: boolean | undefined,
  isActive: (id: DefinitionId) => boolean
): DefinitionId[] {
  return from.filter((option, index) => {
    if (excludeIfAlreadyActive && isActive(option)) return false
    const prerequisite = requiresActive?.[index]
    if (prerequisite && !isActive(prerequisite)) return false
    return true
  })
}

// A question ready to be asked: what the facet declared, plus the identity
// the answer will be stored under. Built by the caller that knows both the
// slot and the facet; this module never reads a facet itself.
export type ResolvableChoice = {
  key: string
  slot: string
  choiceSetId: DefinitionId
  // How many options must be picked. From the FACET, never the ChoiceSet --
  // the package declares `count: 0` precisely because "how many to pick...
  // come[s] from the Content Pack entry that references it" (the package's
  // own README).
  count: number
  options: DefinitionId[]
  // D&D 2024 Character Rules Phase 2A.1 -- mirrors the ChoiceSet's own
  // `distinct` flag. `undefined`/`true` means the pre-existing behavior
  // (every selection must be unique); `false` is new, and means the SAME
  // option may be selected more than once, up to `count` times total --
  // needed for `choice:feat.asi-ability-increase` (two stacked "str"
  // picks correctly express "+2 to Strength" via two independently-
  // activated +1 Sources; see app/lib/rules/types.ts's own `effect` header).
  distinct?: boolean
  // P7 -- mirrors ChoiceSetDefinition.maxPerOption. Only read when `distinct === false`: the
  // most times ONE option may appear in the answer. Omitted means no per-option ceiling.
  maxPerOption?: number
}

// The ONE definition of how a facet's declared choice becomes an answerable
// question. Called by the bridge (server-side, for an existing character)
// and by the Character Builder (client-side, for a character that does not
// exist yet) so the two can never disagree about a choice's identity, count,
// or options -- a disagreement that would show up as a Builder letting a
// player answer a question the server then rejects.
//
// `count` and `options` come from the FACET, never from the ChoiceSet: the
// package declares `count: 0` precisely because "how many to pick, and which
// are offered, come from the Content Pack entry that references it" (the
// package's own README).
// `distinct` -- see `toResolvableProgressionChoice`'s own doc comment
// immediately above for why this is optional and what an absent value means.
export function toResolvableChoice(
  slot: string,
  choice: { choiceSet: DefinitionId; count: number; from?: readonly DefinitionId[] },
  distinct?: boolean,
  maxPerOption?: number
): ResolvableChoice {
  return {
    key: choiceKey(slot, choice.choiceSet),
    slot,
    choiceSetId: choice.choiceSet,
    count: choice.count,
    options: [...(choice.from ?? [])],
    distinct,
    maxPerOption
  }
}

export function emptyStoredRulesChoices(): StoredRulesChoices {
  return { selections: {} }
}

export function selectionsFor(stored: StoredRulesChoices | null | undefined, key: string): DefinitionId[] {
  return stored?.selections?.[key] ?? []
}

// Answered means answered COMPLETELY and VALIDLY. A choice with one of two
// skills picked is still outstanding, which is why the Sheet's "choices are
// still outstanding" notice and the Builder's step-completeness check can
// both call this and agree.
export function isChoiceAnswered(
  choice: ResolvableChoice,
  stored: StoredRulesChoices | null | undefined
): boolean {
  return validateChoiceSelection(choice, selectionsFor(stored, choice.key)).ok
}

export type ChoiceValidation =
  | { ok: true; selected: DefinitionId[] }
  | { ok: false; reason: string }

// The single authority on whether a set of selections answers a choice.
// Used by the Builder (to enable a button), by the save route (to reject a
// bad request), and by the bridge (to ignore an answer that no longer fits
// its question). One function so those three can never disagree.
export function validateChoiceSelection(
  choice: ResolvableChoice,
  raw: unknown
): ChoiceValidation {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'Selections must be a list.' }
  }

  const selected: DefinitionId[] = []

  for (const item of raw) {
    if (typeof item !== 'string' || !item) {
      return { ok: false, reason: 'Every selection must be a Definition id.' }
    }

    // D&D 2024 Character Rules Phase 2A.1 -- this is the "revisit if one
    // ever does" this comment used to end on: `choice:feat.asi-ability-
    // increase` is the first authored ChoiceSet with `distinct: false`
    // (the Ability Score Improvement feat's own real "+2 to one ability OR
    // +1 to two distinct abilities" shape, expressed as "pick 2, same
    // option allowed twice"). `choice.distinct === false` is the only way
    // to opt out -- `undefined` (every choice authored before this phase)
    // still enforces uniqueness, byte-identical to the old unconditional
    // check.
    if (choice.distinct !== false && selected.includes(item)) {
      return { ok: false, reason: `"${item}" was selected more than once.` }
    }

    // The option list is the whole point of `fromContentFacet`: a Fighter's
    // skills are not a Wizard's. An option outside it is rejected, never
    // quietly dropped -- a silently-ignored selection is a player wondering
    // why their skill vanished.
    if (!choice.options.includes(item)) {
      return { ok: false, reason: `"${item}" is not one of the offered options.` }
    }

    selected.push(item)
  }

  if (selected.length !== choice.count) {
    return {
      ok: false,
      reason: `Choose exactly ${choice.count}; ${selected.length} selected.`
    }
  }

  // P7 -- the per-option ceiling for a repeatable choice. Checked on the whole answer, so an
  // over-picked option is refused rather than trimmed. With count 3 and a ceiling of 2 this
  // is exactly the legal set {+2/+1, +1/+1/+1}: AAA is refused here, not by a special case.
  if (choice.distinct === false && choice.maxPerOption !== undefined) {
    for (const option of new Set(selected)) {
      const times = selected.filter((value) => value === option).length
      if (times > choice.maxPerOption) {
        return { ok: false, reason: `"${option}" can be selected at most ${choice.maxPerOption} times.` }
      }
    }
  }

  return { ok: true, selected }
}

// Re-validated on read, never trusted -- the same posture
// normalizeStoredAbilityScores takes, and for the same reason: a row
// hand-edited in the Directus admin should degrade to "unanswered" rather
// than reach the engine as a malformed answer.
//
// Validation here is STRUCTURAL only (is this a map of id-lists?). Whether a
// given answer still fits its question is decided later, against the facets
// that are current at read time -- because a GM repinning a Content Pack can
// invalidate a stored answer without anything having edited it.
//
// D&D 2024 Character Rules Phase 2A.1 CONFIRM/PERSISTENCE DEFECT FIX --
// duplicates are preserved, never collapsed, here. This function used to
// silently drop a repeated id (`['a','a','b'] -> ['a','b']`), which was safe
// only back when EVERY ChoiceSet implicitly required distinct selections.
// `distinct: false` (Ability Score Improvement's own real "+2 to one ability"
// shape, expressed as the same option selected twice -- see
// `ResolvableChoice.distinct`'s own doc comment) makes a legitimate answer
// REQUIRE a duplicate to survive this read: this function has no registry
// access and cannot know which ChoiceSet a given key even belongs to, let
// alone whether it is `distinct: false`, so it can never safely decide "this
// duplicate is illegal" on its own -- only `validateChoiceSelection` below
// can, once it has the real `ResolvableChoice.distinct` flag from the
// registry. Deduplicating here unconditionally silently truncated a valid
// two-item ASI answer to one item on every read, which then failed
// `validateChoiceSelection`'s own `selected.length !== choice.count` check
// and made a correctly-persisted, correctly-confirmed Ability Score
// Improvement read back as an unanswered choice -- zero of its two
// `source:asi.increase.<ability>` Sources ever activated, even though both
// were genuinely confirmed and persisted.
export function normalizeStoredRulesChoices(value: unknown): StoredRulesChoices | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  const rawSelections = input.selections

  if (!rawSelections || typeof rawSelections !== 'object' || Array.isArray(rawSelections)) return null

  const selections: Record<string, DefinitionId[]> = {}

  for (const [key, raw] of Object.entries(rawSelections as Record<string, unknown>)) {
    if (!Array.isArray(raw)) return null

    const ids: DefinitionId[] = []
    for (const item of raw) {
      if (typeof item !== 'string' || !item) return null
      ids.push(item)
    }

    selections[key] = ids
  }

  return { selections }
}

const SELECTED_TOKEN = '{selected}'

// Resolves a ChoiceSet's `writesTo` template against one selected option.
//
// Two shapes reach here and both are legitimate:
//
//   template "value:skill.{selected}.proficient", option "athletics"
//     -> "value:skill.athletics.proficient"          (substitution)
//
//   template "value:skill.{selected}.proficient",
//   option   "value:skill.athletics.proficient"
//     -> unchanged                                   (already a target)
//
// The second is what the authored corpus produces, because a facet's `from`
// is typed `DefinitionId[]`. Distinguishing them needs no registry and no
// guess: an option that already carries the template's own prefix and suffix
// is self-evidently a resolved target, and substituting into it would
// produce "value:skill.value:skill.athletics.proficient.proficient", which
// is not a thing.
export function resolveChoiceTarget(writesTo: string, selected: DefinitionId): DefinitionId {
  const marker = writesTo.indexOf(SELECTED_TOKEN)
  if (marker < 0) return writesTo

  const prefix = writesTo.slice(0, marker)
  const suffix = writesTo.slice(marker + SELECTED_TOKEN.length)

  const alreadyResolved =
    selected.startsWith(prefix)
    && selected.endsWith(suffix)
    && selected.length > prefix.length + suffix.length

  return alreadyResolved ? selected : `${prefix}${selected}${suffix}`
}
