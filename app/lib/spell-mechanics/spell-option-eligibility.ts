// D&D 2024 Character Rules P2 -- SPELL OPTION ELIGIBILITY.
//
// The one canonical, pure answer to "is this spell a legal option for this declared
// spell-selection context?" Mirrors app/lib/feat-mechanics/eligibility.ts's POSTURE exactly
// (an absent filter is itself a refusal, never a free pass; an unrecognized shape refuses, never
// guesses) without extending that file -- a spell has no category/variant, a feat has no spell
// level/school/class-list, and bolting one onto the other would make a feat-shaped function carry
// spell meaning no feat has (app/lib/rules/types.ts's own SpellCatalogueFilter header explains the
// same choice at the type layer).
//
// INPUTS ARE ALREADY RESOLVED. This function never touches a ContentRef, a Content Pack, or a
// catalogue -- the CALLER (creation-content-choices.ts / character-progression-plan.ts, exactly
// like featOptionVerdict's own callers) independently resolves the catalogue entry, reads its
// `spellMechanics`, and reads the declared `SpellCatalogueFilter` off the real package ChoiceSet
// before calling this. "Unknown ContentRef" / "wrong package" are therefore refusals the CALLER
// produces (the same ContentRef simply does not resolve to a spell entry at all), not a case this
// function sees.
//
// FAIL CLOSED, not best-effort:
//   - no filter at all -> refused (mirrors featOptionVerdict's own `no-filter`)
//   - a filter field this function does not recognize -> refused, never ignored
//   - no mechanics (an unresolvable or non-spell entry) -> refused
//   - a `classList` filter against a spell with no normalized class-list membership -> refused,
//     never treated as "matches anything" -- see CanonicalSpellMechanics.classLists's own header
//     for why absence there is a real, honest gap, not silently permissive here.

import type { CanonicalSpellMechanics } from './types'
import type { SpellCatalogueFilter } from '../rules/types'

export type SpellUnavailableReason =
  | 'no-filter'
  | 'no-mechanics'
  | 'unsupported-filter'
  | 'wrong-class-list'
  | 'wrong-level'
  | 'wrong-school'

export type SpellOptionVerdict = { eligible: true } | { eligible: false; reason: SpellUnavailableReason }

// The filter's own closed vocabulary (app/lib/rules/types.ts's SpellCatalogueFilter). A field
// outside this set is refused outright -- a future filter dimension needs a change HERE before it
// can ever be satisfied, never a silent pass-through of a field this function does not evaluate.
const KNOWN_FILTER_KEYS: readonly string[] = ['classList', 'level', 'school']

export function spellOptionVerdict(input: {
  mechanics: CanonicalSpellMechanics | null | undefined
  filter: SpellCatalogueFilter | null | undefined
}): SpellOptionVerdict {
  if (!input.filter) return { eligible: false, reason: 'no-filter' }

  const unsupportedKey = Object.keys(input.filter).find((key) => !KNOWN_FILTER_KEYS.includes(key))
  if (unsupportedKey) return { eligible: false, reason: 'unsupported-filter' }

  if (!input.mechanics) return { eligible: false, reason: 'no-mechanics' }
  const mechanics = input.mechanics
  const filter = input.filter

  // AND across declared dimensions; OR within `classList` (any one named class is enough -- a
  // multiclass-style "Wizard or Sorcerer list" filter is one ChoiceSet, not two).
  if (filter.classList && filter.classList.length > 0) {
    if (!mechanics.classLists || mechanics.classLists.length === 0) return { eligible: false, reason: 'wrong-class-list' }
    const onAnyNamedList = filter.classList.some((wanted) => mechanics.classLists!.includes(wanted))
    if (!onAnyNamedList) return { eligible: false, reason: 'wrong-class-list' }
  }

  if (filter.level !== undefined && mechanics.level !== filter.level) {
    return { eligible: false, reason: 'wrong-level' }
  }

  if (filter.school !== undefined && mechanics.school !== filter.school) {
    return { eligible: false, reason: 'wrong-school' }
  }

  return { eligible: true }
}
