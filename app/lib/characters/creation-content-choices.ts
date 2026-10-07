// Creation-time ContentRef choices -- Phase 2C.2B. The ONE pure implementation the
// V2 Builder presents and create-v2 POST enforces, for choices a creation
// declares against Content Catalogue entries (today: feats, e.g. the Fighter's
// Level-1 Fighting Style) rather than against Definitions (proficiencies, which
// stay on creation-choice-eligibility.ts's Definition path, untouched).
//
// No I/O, no Vue, no registry. The caller supplies the content selector for each
// choice set (`contentSelectorOf`): a choice set that is Definition-backed or not
// content-backed returns null and never enters this module.
//
// Authority: every legality decision is the SHARED feat verdict
// (featFilterVerdict / featOptionVerdict, app/lib/feat-mechanics/eligibility.ts)
// with the feature facts the creation state establishes (directlyGrantedValues
// over the selected slots). Nothing here re-implements a feat rule.

import { featFilterVerdict, featOptionVerdict, type FeatOptionVerdict } from '../feat-mechanics/eligibility'
import type { CanonicalFeatMechanics } from '../feat-mechanics/types'
import { spellOptionVerdict } from '../spell-mechanics/spell-option-eligibility'
import type { CanonicalSpellMechanics } from '../spell-mechanics/types'
import type { ContentCatalogueFilter, SpellCatalogueFilter } from '../rules/types'
import { progressionChoiceKey } from './rules-choices'
import { serializeContentRef } from './progression-plan'
import { directlyGrantedValues, type CreationSlotInput } from './creation-choice-eligibility'

// A content choice set's selector, as the package declares it. `filter`'s real shape depends on
// `category` ('feats' -> ContentCatalogueFilter, 'spells' -> SpellCatalogueFilter, P2); this module
// itself never reads filter fields (that is featFilterVerdict's/spellOptionVerdict's job).
export type ContentChoiceSelector = { category: string; filter?: ContentCatalogueFilter | SpellCatalogueFilter }

// The entry shape this module needs from the World Content Catalogue. Structural,
// so both the server catalogue and the Builder's copy satisfy it.
export type CreationFeatEntry = {
  packageId: string
  slug: string
  title: string
  featMechanics?: CanonicalFeatMechanics | null
  rulesFacet?: { featureRequirements?: readonly { feature: string; requires: string }[] } | null
}

// D&D 2024 Character Rules P2 -- the entry shape a 'spells' category choice judges against,
// mirroring CreationFeatEntry exactly (same envelope, one mechanics field).
export type CreationSpellEntry = {
  packageId: string
  slug: string
  title: string
  spellMechanics?: CanonicalSpellMechanics | null
}

// One declared content choice, keyed by the SAME progression key convention used
// everywhere else (`slot:progression:<level>:<choiceSetId>`). Creation is level 1.
export type CreationContentDeclaration = {
  key: string
  slot: string
  choiceSetId: string
  count: number
  selector: ContentChoiceSelector
}

export type CreationContentOffer = {
  ref: string
  packageId: string
  slug: string
  title: string
  eligible: boolean
  reason?: string
}

export type CreationContentPresentation = {
  key: string
  slot: string
  choiceSetId: string
  count: number
  // The content DESTINATION (routing): `feats`, `subclasses`, ...
  category: string
  // The package's own restriction on the destination (e.g. feat category
  // `fighting-style`, variants `['FS']`; P2: a spell's classList/level/school). Presentation and
  // authority read the same.
  filter?: ContentCatalogueFilter | SpellCatalogueFilter
  offered: CreationContentOffer[]
  selected: string[]
  valid: boolean
}

export const CREATION_LEVEL = 1

// Declared content choices across the three selected slots, in slot order then
// facet order. `contentSelectorOf` returns null for every Definition-backed or
// otherwise non-content choice set, which keeps those on the Definition path.
export function declaredCreationContentChoices(
  slots: readonly (CreationSlotInput & { slot: string })[],
  contentSelectorOf: (choiceSetId: string) => ContentChoiceSelector | null
): CreationContentDeclaration[] {
  const out: CreationContentDeclaration[] = []
  for (const { slot, facet } of slots) {
    for (const choice of facet?.choices ?? []) {
      const selector = contentSelectorOf(choice.choiceSet)
      if (!selector) continue
      out.push({
        key: progressionChoiceKey(slot, CREATION_LEVEL, choice.choiceSet),
        slot,
        choiceSetId: choice.choiceSet,
        count: choice.count,
        selector
      })
    }
  }
  return out
}

// Judges every declared content choice against the same creation state. Sibling
// choices are judged in declaration order, so a ref already taken by an earlier
// choice is "owned" for a later one -- the same ordering rule Phase 2C.1 uses for
// progression. A choice whose category is neither `feats` nor `spells` is never
// valid (fail closed) -- no magic choice-id branch, only these two named destinations.
//
// D&D 2024 Character Rules P2 -- `spells` is a SECOND recognized category, added
// alongside `feats` with the same shape (offer every candidate, judge it, collect
// eligible refs, accept up to `count` of the submitted answer), using
// spellOptionVerdict rather than featOptionVerdict. No real class/background/feat
// facet declares a `spells` choice yet (P3 owns acquisition counts); this function
// is exercised today only by tests that declare one on a synthetic facet, exactly
// as this phase's own scope requires ("the underlying resolver/transport must not
// be tied to one surface", never "fake a count to prove the resolver works").
export function resolveCreationContentChoices(
  declarations: readonly CreationContentDeclaration[],
  slots: readonly (CreationSlotInput & { slot: string })[],
  selections: Readonly<Record<string, readonly string[]>>,
  feats: readonly CreationFeatEntry[],
  spells: readonly CreationSpellEntry[] = []
): CreationContentPresentation[] {
  const featureActive = directlyGrantedValues(slots)
  const takenByEarlier = new Set<string>()
  const out: CreationContentPresentation[] = []

  for (const declaration of declarations) {
    const { key, slot, choiceSetId, count, selector } = declaration
    if (selector.category !== 'feats' && selector.category !== 'spells') {
      out.push({ key, slot, choiceSetId, count, category: selector.category, filter: selector.filter, offered: [], selected: [], valid: false })
      continue
    }

    const offered: CreationContentOffer[] = []

    if (selector.category === 'feats') {
      for (const entry of feats) {
        if (!featFilterVerdict(entry.featMechanics, selector.filter as ContentCatalogueFilter).eligible) continue
        const ref = serializeContentRef({ packageId: entry.packageId, slug: entry.slug })
        const verdict: FeatOptionVerdict = featOptionVerdict({
          mechanics: entry.featMechanics,
          filter: selector.filter as ContentCatalogueFilter,
          mappings: entry.rulesFacet?.featureRequirements ?? [],
          featureActive: (id) => featureActive.has(id),
          ownedElsewhere: takenByEarlier.has(ref),
          // Creation evaluates prerequisite-free feats only. A feat with supported
          // prerequisite groups stays illegal here until creation-state prerequisite
          // evaluation exists -- fail closed, never "assumed met".
          prerequisitesMet: () => (entry.featMechanics?.prerequisiteGroups.length ?? 0) === 0
        })
        offered.push({
          ref,
          packageId: entry.packageId,
          slug: entry.slug,
          title: entry.title,
          eligible: verdict.eligible,
          ...(verdict.eligible ? {} : { reason: verdict.reason })
        })
      }
    } else {
      for (const entry of spells) {
        const ref = serializeContentRef({ packageId: entry.packageId, slug: entry.slug })
        const verdict = spellOptionVerdict({ mechanics: entry.spellMechanics, filter: selector.filter as SpellCatalogueFilter })
        // A spell already taken by an earlier sibling choice is not offered twice, the same rule
        // the feat branch enforces via `ownedElsewhere` inside featOptionVerdict -- spells have no
        // feat-shaped prerequisite/repeatable concept, so the check is inlined here instead.
        if (verdict.eligible && takenByEarlier.has(ref)) {
          offered.push({ ref, packageId: entry.packageId, slug: entry.slug, title: entry.title, eligible: false, reason: 'already-owned' })
          continue
        }
        offered.push({
          ref,
          packageId: entry.packageId,
          slug: entry.slug,
          title: entry.title,
          eligible: verdict.eligible,
          ...(verdict.eligible ? {} : { reason: verdict.reason })
        })
      }
    }

    const eligibleRefs = new Set(offered.filter((o) => o.eligible).map((o) => o.ref))
    const selected: string[] = []
    for (const value of selections[key] ?? []) {
      if (selected.length >= count) break
      if (!eligibleRefs.has(value) || selected.includes(value)) continue
      selected.push(value)
    }
    for (const ref of selected) takenByEarlier.add(ref)

    out.push({ key, slot, choiceSetId, count, category: selector.category, filter: selector.filter, offered, selected, valid: selected.length === count })
  }

  return out
}
