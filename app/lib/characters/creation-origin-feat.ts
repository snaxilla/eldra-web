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

// HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- when THIS acquisition is the
// Background's own fixed Origin Feat grant (its `choiceKey` is the canonical
// origin-grant key AND its featRef matches the Background's own `originFeatSlug`
// -- both re-derivable from data already present, never a new persisted field),
// returns the Background facet's own `originFeatPreset` (if it declares one) so
// the acquired feat's own nested choice (e.g. Magic Initiate's "which spell
// list") answers itself, exactly like a plain `grants` entry would, with no
// opaque global gate. A feat acquired through any OTHER path (freely chosen)
// never matches, and returns `undefined` -- its own nested choice stays
// genuinely pending. Pure, generic: works for any Background/any feat with a
// nested choice, never named here.
export function originFeatPresetChoices(
  acquisition: FixedFeatAcquisition,
  background: { packageId: string, rulesFacet?: { originFeatSlug?: string, originFeatPreset?: Readonly<Record<string, readonly string[]>> } | null }
): Readonly<Record<string, readonly string[]>> | undefined {
  const canonicalKey = progressionChoiceKey(ORIGIN_FEAT_SLOT, CREATION_LEVEL, ORIGIN_FEAT_GRANT_SEGMENT)
  if (acquisition.choiceKey !== canonicalKey) return undefined
  if (background.rulesFacet?.originFeatSlug !== acquisition.featRef.slug) return undefined
  return background.rulesFacet?.originFeatPreset
}

// HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- replaces the narrower
// findDuplicateFeatAcquisition: the real corpus distinguishes "may never be
// acquired twice" (CanonicalFeatMechanics.repeatable === false) from "may be
// acquired more than once, but each acquisition's own differentiating nested
// choice must answer differently" (RulesFacet.repeatAcquisitionDifferentiator,
// e.g. Magic Initiate's spell list) from "may be acquired more than once with
// no such constraint" (repeatable with no differentiator, e.g. Ability Score
// Improvement). `lookup`/`answerFor` are injected so this stays pure (no
// catalogue/selections access of its own); `answerFor` must be called with the
// SAME `feat:${choiceKey}` owner-prefix convention `gatherSpellRequirements`
// uses, so an unanswered differentiator reads as `[]`, never a stand-in value --
// callers are expected to have ALREADY rejected a feat-owned choice left
// genuinely unanswered (see create-v2.post.ts's own feat-choice completeness
// check) before this runs, so an empty answer here always means "illegally
// incomplete, not yet caught," never "legitimately blank."
export function findIllegalRepeatAcquisition(
  acquisitions: readonly FixedFeatAcquisition[],
  lookup: (featRef: { packageId: string, slug: string }) => { repeatable: boolean, differentiator?: string },
  answerFor: (ownerKey: string, choiceSetId: string) => readonly string[]
): string | null {
  const bySlug = new Map<string, FixedFeatAcquisition[]>()
  for (const acquisition of acquisitions) {
    const ref = serializeContentRef(acquisition.featRef)
    bySlug.set(ref, [...(bySlug.get(ref) ?? []), acquisition])
  }
  for (const [ref, group] of bySlug) {
    const first = group[0]
    if (group.length < 2 || !first) continue
    const { repeatable, differentiator } = lookup(first.featRef)
    if (!repeatable) return ref
    if (!differentiator) continue
    const answers = group.map((a) => [...answerFor(`feat:${a.choiceKey}`, differentiator)].sort().join(','))
    if (new Set(answers).size !== answers.length) return ref
  }
  return null
}
