// Feat option legality -- the ONE rule the Level Manager's option list and its
// Confirm validation both apply. Pure: no I/O, no registry, no Vue.
//
// Two layers, deliberately split:
//   - featFilterVerdict: what the PACKAGE asks for (category, variant). It
//     needs no character, so option construction can apply it on its own.
//   - featOptionVerdict: the filter PLUS the character-dependent facts the
//     caller already computed (already owned, prerequisite satisfied). The
//     caller evaluates prerequisites against derived state; this module only
//     composes the verdict, so preview and Confirm cannot disagree on the
//     composition.
//
// Fail closed everywhere: no filter -> nothing is legal; an unresolved feat
// satisfies no filter; a feat with ANY unsupported prerequisite is never
// legal (see CanonicalFeatMechanics.unsupportedPrerequisites).

import type { ContentCatalogueFilter } from '../rules/types'
import type { CanonicalFeatMechanics } from './types'

export type FeatUnavailableReason =
  | 'no-filter'
  | 'wrong-category'
  | 'wrong-variant'
  | 'prerequisite-unsupported'
  | 'already-owned'
  | 'prerequisite-unmet'

export type FeatOptionVerdict = { eligible: true } | { eligible: false; reason: FeatUnavailableReason }

export function featFilterVerdict(
  mechanics: CanonicalFeatMechanics | null | undefined,
  filter: ContentCatalogueFilter | null | undefined
): FeatOptionVerdict {
  if (!filter) return { eligible: false, reason: 'no-filter' }
  if (!mechanics || mechanics.category !== filter.category) return { eligible: false, reason: 'wrong-category' }
  if (filter.variants && !filter.variants.includes(mechanics.variant)) return { eligible: false, reason: 'wrong-variant' }
  return { eligible: true }
}

export function featOptionVerdict(input: {
  mechanics: CanonicalFeatMechanics | null | undefined
  filter: ContentCatalogueFilter | null | undefined
  // Another acquisition on this character already holds this feat.
  ownedElsewhere: boolean
  // Caller-evaluated against derived state BEFORE this acquisition. Only read
  // when every other check has passed, so it is never the reason for an
  // unrelated verdict.
  prerequisitesMet: () => boolean
}): FeatOptionVerdict {
  const filterVerdict = featFilterVerdict(input.mechanics, input.filter)
  if (!filterVerdict.eligible) return filterVerdict

  const mechanics = input.mechanics!
  if (mechanics.unsupportedPrerequisites.length) return { eligible: false, reason: 'prerequisite-unsupported' }
  if (input.ownedElsewhere && !mechanics.repeatable) return { eligible: false, reason: 'already-owned' }
  if (!input.prerequisitesMet()) return { eligible: false, reason: 'prerequisite-unmet' }
  return { eligible: true }
}
