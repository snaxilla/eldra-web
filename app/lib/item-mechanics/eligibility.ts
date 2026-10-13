// Item option legality -- the ONE rule the Builder's/Level Manager's option list and its
// Confirm validation both apply, for a content choice over the Content Catalogue's `items`
// category. Mirrors app/lib/feat-mechanics/eligibility.ts's POSTURE exactly (an absent filter is
// itself a refusal, never a free pass; an unrecognized shape refuses, never guesses) without
// extending that file -- an item has no feat category/prerequisite, a feat has no weapon
// kind/range (app/lib/rules/types.ts's own ItemCatalogueFilter header explains the same choice at
// the type layer).
//
// INPUTS ARE ALREADY RESOLVED, exactly like featOptionVerdict/spellOptionVerdict: this function
// never touches a ContentRef, a Content Pack, or a catalogue -- the CALLER (creation-content-
// choices.ts / character-progression-plan.ts) independently resolves the catalogue entry, reads
// its `itemMechanics`, and reads the declared `ItemCatalogueFilter` off the real package ChoiceSet
// before calling this. Proficiency is CHARACTER-dependent (the same split featOptionVerdict's own
// `prerequisitesMet`/`featureActive` callbacks already draw): the caller evaluates it against
// derived state and supplies the verdict as `proficient()`, never a fact this module looks up
// itself.
//
// Fail closed everywhere: no filter -> nothing is legal; a non-weapon or unresolvable entry
// satisfies no filter; a weapon the character is not proficient with is never legal, no matter how
// permissive the filter.

import type { ItemCatalogueFilter } from '../rules/types'
import type { CanonicalItemMechanics } from './types'

export type ItemUnavailableReason =
  | 'no-filter'
  | 'unsupported-filter'
  | 'no-mechanics'
  | 'wrong-kind'
  | 'wrong-range'
  | 'not-proficient'
  | 'already-owned'

export type ItemOptionVerdict = { eligible: true } | { eligible: false; reason: ItemUnavailableReason }

// The filter's own closed vocabulary (app/lib/rules/types.ts's ItemCatalogueFilter). A field
// outside this set is refused outright -- a future filter dimension needs a change HERE before it
// can ever be satisfied, never a silent pass-through of a field this function does not evaluate.
const KNOWN_FILTER_KEYS: readonly string[] = ['itemKind', 'meleeOnly']

export function itemFilterVerdict(
  mechanics: CanonicalItemMechanics | null | undefined,
  filter: ItemCatalogueFilter | null | undefined
): ItemOptionVerdict {
  if (!filter) return { eligible: false, reason: 'no-filter' }

  const unsupportedKey = Object.keys(filter).find((key) => !KNOWN_FILTER_KEYS.includes(key))
  if (unsupportedKey) return { eligible: false, reason: 'unsupported-filter' }

  if (!mechanics) return { eligible: false, reason: 'no-mechanics' }
  if (filter.itemKind !== mechanics.kind) return { eligible: false, reason: 'wrong-kind' }
  if (filter.meleeOnly === true && mechanics.range !== 'melee') return { eligible: false, reason: 'wrong-range' }

  return { eligible: true }
}

export function itemOptionVerdict(input: {
  mechanics: CanonicalItemMechanics | null | undefined
  filter: ItemCatalogueFilter | null | undefined
  // Caller-evaluated: true when this character's derived state has ANY of
  // mechanics.proficiencyGroups active. Absent/false means not proficient --
  // fail closed, never assumed. Only read once the filter itself passes, so
  // it is never the reason for an unrelated verdict.
  proficient: () => boolean
  // This exact weapon identity is already a selected answer elsewhere on
  // this character (another sibling option in this SAME choice, an earlier
  // level's growth choice, or a persisted prior selection). Weapon Mastery
  // has no repeatable-selection concept (unlike a feat) -- always
  // disqualifying when true.
  ownedElsewhere: boolean
}): ItemOptionVerdict {
  const filterVerdict = itemFilterVerdict(input.mechanics, input.filter)
  if (!filterVerdict.eligible) return filterVerdict

  if (input.ownedElsewhere) return { eligible: false, reason: 'already-owned' }
  if (!input.proficient()) return { eligible: false, reason: 'not-proficient' }

  return { eligible: true }
}
