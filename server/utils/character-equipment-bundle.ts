// D&D 2024 Character Rules P8 -- STARTING EQUIPMENT SERVER AUTHORITY.
//
// The one place that turns a creation request's bundle-id answers into canonical, resolved grants
// -- the server-side half of the shared contract app/lib/characters/equipment-bundle.ts declares.
// Both this file and the (not-yet-built) Builder presentation call that SAME pure resolver; this
// file's own job is narrower: supply the two D&D-specific resolvers it needs (an item-slug lookup
// against this World's live catalogue, and a cross-reference lookup against this character's own
// in-flight `rules_choices` answers), and turn the result into the shapes
// character-currency.ts/character-inventory.ts already persist.
//
// SERVER PRE-WRITE AUTHORITY -- never trusts a client-submitted bundle id at face value, mirroring
// every other creation check in create-v2.post.ts: a bundle id is re-validated against the SAME
// package-authored `EquipmentChoice` the catalogue entry's own `rulesFacet.startingEquipment`
// declares, and every grant it resolves to is re-derived here, never relayed from the request body.

import {
  findEquipmentBundle,
  mergeResolvedGrants,
  resolveEquipmentBundle,
  type MergedInventoryAddition,
  type ResolvedEquipmentGrant
} from '../../app/lib/characters/equipment-bundle'
import type { EquipmentChoice } from '../../app/lib/content-rules/types'
import { DND5E_2024_EQUIPMENT_CROSS_REFERENCE_ITEM_SLUGS } from '../../app/lib/content-rules/dnd5e-2024'
import { choiceKey, selectionsFor, type StoredRulesChoices } from '../../app/lib/characters/rules-choices'
import {
  addInventoryItem,
  clampQuantity,
  type StoredInventoryItem
} from '../../app/lib/characters/inventory'
import type { DefinitionId } from '../../app/lib/rules/types'

type CatalogueItemRef = { packageId: string; slug: string }

// Matches a `slug`-only authored grant against the World's live item catalogue -- the same
// "resolve fresh, never trust an authored packageId" posture `resolveSlot` already keeps for
// species/class/background references one layer up (see equipment-bundle.ts's own header for why
// an authored `item` grant carries no packageId at all).
export function resolveItemSlugAgainstCatalogue(
  slug: string,
  items: readonly CatalogueItemRef[]
): CatalogueItemRef | null {
  const found = items.find((entry) => entry.slug === slug)
  return found ? { packageId: found.packageId, slug: found.slug } : null
}

// The D&D-specific `crossReference` resolver: reads this character's OWN already-validated
// `rules_choices` answer for the named ChoiceSet (scoped to `slot`, exactly as every other
// creation-time choice is), looks the selected Value id up in the package's own
// tool/instrument/gaming-set -> item-slug table, then resolves that slug against the live
// catalogue the same way an `item` grant does. Returns null (never throws) the instant any step is
// missing -- an unanswered or unmapped choice is "unresolved," not a different kind of failure.
export function crossReferenceResolverFor(
  slot: string,
  rulesChoices: StoredRulesChoices,
  items: readonly CatalogueItemRef[]
) {
  return (choiceSetId: DefinitionId): CatalogueItemRef | null => {
    const selected = selectionsFor(rulesChoices, choiceKey(slot, choiceSetId))[0]
    if (!selected) return null
    const slug = DND5E_2024_EQUIPMENT_CROSS_REFERENCE_ITEM_SLUGS[selected]
    if (!slug) return null
    return resolveItemSlugAgainstCatalogue(slug, items)
  }
}

// One slot's starting-equipment decision, as create-v2.post.ts already has the facts to build it:
// `choice` is this slot's own catalogue entry's `rulesFacet.startingEquipment` (`undefined` means
// this content declares no such decision -- a legal state for any future species/feat facet that
// has not authored one yet), `bundleId` is the client-submitted answer.
export type StartingEquipmentOwnerInput = {
  slot: string
  choice: EquipmentChoice | undefined
  bundleId: string | undefined
}

export type ResolvedStartingEquipment = {
  additions: MergedInventoryAddition[]
  currency: Record<string, number>
  // choiceKey(slot, choice.id) -> chosen bundle id, for callers to persist as the SAME
  // `rules_choices` provenance every other creation-time choice already is -- never a second
  // store invented for display.
  provenance: Record<string, string>
}

export type StartingEquipmentResolution =
  | { ok: true; result: ResolvedStartingEquipment }
  | { ok: false; reason: string }

// The single creation-time authority: validates every owner's submitted bundle id against its own
// real `EquipmentChoice`, resolves each to canonical grants through the shared pure resolver, and
// merges the results. Fails closed on the FIRST problem found -- a missing choice id, an unknown
// bundle id, an unresolved cross-reference, or an unresolved item -- never a partial result.
export function resolveStartingEquipment(
  owners: readonly StartingEquipmentOwnerInput[],
  rulesChoices: StoredRulesChoices,
  items: readonly CatalogueItemRef[]
): StartingEquipmentResolution {
  const grantLists: ResolvedEquipmentGrant[][] = []
  const provenance: Record<string, string> = {}

  for (const owner of owners) {
    // This slot's content declares no starting-equipment decision at all -- nothing to ask,
    // nothing to validate, exactly like a Species with no spellRequirements.
    if (!owner.choice) continue

    if (!owner.bundleId) {
      return { ok: false, reason: `Choose a starting-equipment option for this character's ${owner.slot}.` }
    }

    const bundle = findEquipmentBundle(owner.choice, owner.bundleId)
    if (!bundle) {
      return { ok: false, reason: `"${owner.bundleId}" is not a starting-equipment option for this character's ${owner.slot}.` }
    }

    const resolution = resolveEquipmentBundle(bundle, {
      resolveItemSlug: (slug) => resolveItemSlugAgainstCatalogue(slug, items),
      resolveCrossReference: crossReferenceResolverFor(owner.slot, rulesChoices, items)
    })

    if (!resolution.ok) {
      if (resolution.reason === 'unresolved-item') {
        return {
          ok: false,
          reason: `This World's Content Pack no longer offers "${resolution.slug}", required by this character's ${owner.slot} starting equipment.`
        }
      }
      return {
        ok: false,
        reason: `Answer this character's ${owner.slot} proficiency choice before choosing starting equipment that depends on it.`
      }
    }

    grantLists.push(resolution.grants)
    provenance[choiceKey(owner.slot, owner.choice.id)] = owner.bundleId
  }

  const { additions, currency } = mergeResolvedGrants(grantLists)
  return { ok: true, result: { additions, currency, provenance } }
}

// Applies resolved additions into an inventory. ADDS/MERGES only, never replaces: an addition
// sharing the SAME catalogue ref (or the same custom name, case/whitespace-insensitive) with an
// item already in `items` increments that item's quantity in place; everything else is appended.
// This is the one place duplicate-grant identity is decided for PERSISTED state, mirroring
// `mergeResolvedGrants`'s own identity rule one layer earlier (which only merges WITHIN the set of
// grants being applied this call, never against what a character already carries).
export function applyStartingEquipmentAdditions(
  items: readonly StoredInventoryItem[],
  additions: readonly MergedInventoryAddition[]
): StoredInventoryItem[] {
  let next = [...items]

  for (const addition of additions) {
    const matchIndex = next.findIndex((item) =>
      'ref' in addition
        ? item.ref?.packageId === addition.ref.packageId && item.ref?.slug === addition.ref.slug
        : !item.ref && (item.name ?? '').trim().toLowerCase() === addition.name.trim().toLowerCase()
    )

    if (matchIndex >= 0) {
      next = next.map((item, index) =>
        index === matchIndex ? { ...item, quantity: clampQuantity(item.quantity + addition.quantity) } : item
      )
    } else {
      next = addInventoryItem(
        next,
        'ref' in addition
          ? { ref: addition.ref, quantity: addition.quantity }
          : { name: addition.name, quantity: addition.quantity }
      )
    }
  }

  return next
}
