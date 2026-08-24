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
export function toResolvableChoice(
  slot: string,
  choice: { choiceSet: DefinitionId; count: number; from?: readonly DefinitionId[] }
): ResolvableChoice {
  return {
    key: choiceKey(slot, choice.choiceSet),
    slot,
    choiceSetId: choice.choiceSet,
    count: choice.count,
    options: [...(choice.from ?? [])]
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

    // Distinct is enforced unconditionally rather than gated on the
    // ChoiceSet's `distinct` flag: picking the same option twice would make
    // `count` mean two different things (options chosen vs picks made), and
    // no authored ChoiceSet sets `distinct: false`. Revisit if one ever does.
    if (selected.includes(item)) {
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
      if (!ids.includes(item)) ids.push(item)
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
