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
import type { CanonicalFeatMechanics, UnsupportedPrerequisite } from './types'

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

// A package mapping from a raw unsupported prerequisite to the feature Value that
// proves it (RulesFacet.featureRequirements). Matched by the raw value verbatim.
export type FeatureRequirementMapping = { feature: string; requires: string }

// Splits a feat's unsupported prerequisites into those a package mapping COVERS
// (every raw value of the key has an explicit mapping; the mapped Values must
// then be active) and those still UNCOVERED (any key without full coverage,
// including every prose-only key). Any uncovered entry makes the feat illegal.
export function coverUnsupportedPrerequisites(
  mechanics: CanonicalFeatMechanics,
  mappings: readonly FeatureRequirementMapping[]
): { uncovered: readonly UnsupportedPrerequisite[]; requiredFeatures: string[] } {
  const uncovered: UnsupportedPrerequisite[] = []
  const requiredFeatures: string[] = []
  for (const entry of mechanics.unsupportedPrerequisites) {
    const covering = entry.key === 'feature' && entry.values.length
      ? entry.values.map((value) => mappings.find((mapping) => mapping.feature === value))
      : []
    if (covering.length && covering.every((mapping) => mapping !== undefined)) {
      for (const mapping of covering) requiredFeatures.push(mapping!.requires)
    } else {
      uncovered.push(entry)
    }
  }
  return { uncovered, requiredFeatures }
}

export function featOptionVerdict(input: {
  mechanics: CanonicalFeatMechanics | null | undefined
  filter: ContentCatalogueFilter | null | undefined
  // Package-declared coverage of raw feature prerequisites (the feat facet).
  mappings?: readonly FeatureRequirementMapping[]
  // Whether a feature Value is active in the derived state this acquisition is
  // judged against. Absent means no feature is active -- fail closed.
  featureActive?: (valueId: string) => boolean
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
  const { uncovered, requiredFeatures } = coverUnsupportedPrerequisites(mechanics, input.mappings ?? [])
  if (uncovered.length) return { eligible: false, reason: 'prerequisite-unsupported' }
  if (input.ownedElsewhere && !mechanics.repeatable) return { eligible: false, reason: 'already-owned' }
  const featuresActive = requiredFeatures.every((id) => input.featureActive?.(id) === true)
  if (!featuresActive || !input.prerequisitesMet()) return { eligible: false, reason: 'prerequisite-unmet' }
  return { eligible: true }
}
