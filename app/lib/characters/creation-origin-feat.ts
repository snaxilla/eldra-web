// Creation-time FIXED Origin Feat acquisition -- Phase 2C.3A. The one pure
// implementation create-v2 POST uses to turn the selected Background's structured
// facet (`RulesFacet.originFeatSlug`) into a progression.feats[] acquisition.
//
// Authority boundaries:
//   - The Background facet is the ONLY source. Nothing parses display prose
//     ("Origin Feat" card text is presentation only), and no Background name is
//     branched on here.
//   - The client never supplies the feat. The acquisition is a function of the
//     selected Background and the World's catalogue.
//   - Legality is the SHARED feat verdict (featOptionVerdict,
//     app/lib/feat-mechanics/eligibility.ts) with the Origin category filter. A
//     declared feat that is missing from the catalogue, is not an Origin feat, or
//     carries prerequisites is ILLEGAL -- fail closed, never "assumed valid".
//   - Assembly never calls this. An existing character gets no retroactive grant.

import { featOptionVerdict } from '../feat-mechanics/eligibility'
import { progressionChoiceKey } from './rules-choices'
import { serializeContentRef } from './progression-plan'
import { CREATION_LEVEL, type CreationFeatEntry } from './creation-content-choices'

// The Background's fixed grant is keyed by its SOURCE (`background`) and a
// grant-specific choice segment, so it cannot collide with a class choice key
// (`class:progression:1:choice:...`) or a Background-independent one. Built with
// the canonical progressionChoiceKey builder, never by string concatenation.
export const ORIGIN_FEAT_SLOT = 'background'
export const ORIGIN_FEAT_GRANT_SEGMENT = 'grant:origin'

export type FixedFeatAcquisition = {
  featRef: { packageId: string, slug: string }
  choiceKey: string
}

export type CreationOriginFeatResolution =
  | { status: 'none' }
  | { status: 'acquired', acquisition: FixedFeatAcquisition }
  | { status: 'illegal', reason: string }

export function resolveCreationOriginFeat(input: {
  background: { packageId: string, rulesFacet?: { originFeatSlug?: string } | null }
  feats: readonly CreationFeatEntry[]
}): CreationOriginFeatResolution {
  const slug = input.background.rulesFacet?.originFeatSlug
  if (slug === undefined) return { status: 'none' }

  const packageId = input.background.packageId
  const feat = input.feats.find((entry) => entry.packageId === packageId && entry.slug === slug)
  if (!feat) {
    return { status: 'illegal', reason: `Origin feat "${slug}" is not in this World's Content Catalogue` }
  }

  const verdict = featOptionVerdict({
    mechanics: feat.featMechanics,
    filter: { category: 'origin' },
    ownedElsewhere: false,
    // A fixed Origin grant is judged with no creation feature active and no
    // prerequisite evaluation. Any prerequisite makes it illegal (fail closed).
    prerequisitesMet: () => (feat.featMechanics?.prerequisiteGroups.length ?? 0) === 0
  })
  if (!verdict.eligible) {
    return { status: 'illegal', reason: `Origin feat "${feat.title}" is not a legal fixed acquisition (${verdict.reason})` }
  }

  return {
    status: 'acquired',
    acquisition: {
      featRef: { packageId, slug },
      choiceKey: progressionChoiceKey(ORIGIN_FEAT_SLOT, CREATION_LEVEL, ORIGIN_FEAT_GRANT_SEGMENT)
    }
  }
}

// Used by create-v2 POST to refuse one feat acquired twice at creation (a fixed
// grant plus a content choice naming the same feat). Keyed by canonical ref, so
// it cannot be fooled by a different encoding of the same entry.
export function findDuplicateFeatAcquisition(acquisitions: readonly FixedFeatAcquisition[]): string | null {
  const seen = new Set<string>()
  for (const { featRef } of acquisitions) {
    const ref = serializeContentRef(featRef)
    if (seen.has(ref)) return ref
    seen.add(ref)
  }
  return null
}
