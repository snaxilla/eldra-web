// D&D 2024 Character Rules P8 -- EQUIPMENT BUNDLE RESOLUTION. The one pure authority that turns a
// package-authored `EquipmentChoice`/`EquipmentBundle` (app/lib/content-rules/types.ts) plus a
// player's selected bundle id into concrete, canonical grants -- inventory items and currency.
//
// Mirrors `app/lib/characters/spell-acquisition-plan.ts`'s own posture exactly: a pure function of
// already-resolved inputs, no I/O, no Vue, no Directus, shared verbatim by the Builder (for
// presentation) and the server (for authority) so neither can independently drift from the other's
// own interpretation of a bundle. Never a class/background-name branch -- this file does not know
// "Bard" or "Criminal" exist.
//
// ---------------------------------------------------------------------------
// TWO RESOLVERS, NEVER A LOOKUP TABLE HERE -- BOTH INJECTED, NEITHER IMPORTED
// ---------------------------------------------------------------------------
// An `item` grant names a catalogue item by `slug` ALONE (see EquipmentGrant's own header for why
// it carries no `packageId`: this file does not know which World, or which Content Pack, is asking).
// `resolveItemSlug` turns that slug into whichever (packageId, slug) pair the CALLER's own live
// catalogue currently serves it from -- the exact same "resolve fresh against the current
// catalogue, never trust a cached packageId" posture character-assembly.ts's own `resolveSlot`
// already keeps for species/class/background/inventory/spell references, one layer earlier.
//
// A `crossReference` grant's own `choiceSetId` names an ALREADY-DECLARED proficiency ChoiceSet on
// the SAME facet (the real corpus's own `equipmentType`/`equipmentTypes` -- covers tool,
// instrument, AND gaming-set proficiency choices alike). This module does not know how to turn that
// ChoiceSet's own selected Definition id into an item slug either -- that mapping is D&D-specific
// authored data (dnd5e-2024.ts's own tool/instrument/gaming-set -> slug table), and the ANSWER
// itself lives in the caller's own `rules_choices`-shaped state, not here.
//
// Both resolvers are therefore injected, never imported -- the same "generic resolver, D&D-specific
// lookup supplied by the caller" split `character-spell-acquisition.ts`'s own `casterTypeOf`
// already establishes for caster-type derivation.

import type { DefinitionId } from '../rules/types'
import type { EquipmentBundle, EquipmentChoice, EquipmentGrant } from '../content-rules/types'

export type ResolvedEquipmentGrant =
  | { kind: 'item'; ref: { packageId: string; slug: string }; quantity: number }
  | { kind: 'custom'; name: string; quantity: number }
  | { kind: 'currency'; denominationId: string; amount: number }

export type ItemSlugResolver = (slug: string) => { packageId: string; slug: string } | null
export type CrossReferenceResolver = (choiceSetId: DefinitionId) => { packageId: string; slug: string } | null

export type EquipmentBundleResolvers = {
  resolveItemSlug: ItemSlugResolver
  resolveCrossReference: CrossReferenceResolver
}

export type EquipmentBundleResolution =
  | { ok: true; grants: ResolvedEquipmentGrant[] }
  // The authored slug does not resolve against the caller's current catalogue (never curated for
  // this World, or its Content Pack has since gone missing) -- never silently dropped; a caller
  // must refuse the whole bundle rather than grant a partial result.
  | { ok: false; reason: 'unresolved-item'; slug: string }
  // The named ChoiceSet has no valid answer yet (unanswered, or invalid) -- the identical fail-
  // closed posture, one grant kind over.
  | { ok: false; reason: 'unresolved-cross-reference'; choiceSetId: DefinitionId }

export function findEquipmentBundle(choice: EquipmentChoice, bundleId: string): EquipmentBundle | null {
  return choice.bundles.find((bundle) => bundle.id === bundleId) ?? null
}

// Walks one bundle's own grants, resolving each to its canonical shape. `quantity` defaults to 1
// when the authored grant omits it (every real corpus `item` entry with no `quantity` field means
// exactly one). Fails closed, for the WHOLE bundle, the instant one grant cannot resolve -- never a
// bundle with some grants silently dropped.
export function resolveEquipmentBundle(
  bundle: EquipmentBundle,
  resolvers: EquipmentBundleResolvers
): EquipmentBundleResolution {
  const grants: ResolvedEquipmentGrant[] = []

  for (const grant of bundle.grants) {
    const resolved = resolveOneGrant(grant, resolvers)
    if (!resolved.ok) return resolved
    grants.push(resolved.grant)
  }

  return { ok: true, grants }
}

function resolveOneGrant(
  grant: EquipmentGrant,
  resolvers: EquipmentBundleResolvers
):
  | { ok: true; grant: ResolvedEquipmentGrant }
  | { ok: false; reason: 'unresolved-item'; slug: string }
  | { ok: false; reason: 'unresolved-cross-reference'; choiceSetId: DefinitionId } {
  if (grant.kind === 'item') {
    const ref = resolvers.resolveItemSlug(grant.slug)
    if (!ref) return { ok: false, reason: 'unresolved-item', slug: grant.slug }
    return { ok: true, grant: { kind: 'item', ref, quantity: grant.quantity ?? 1 } }
  }
  if (grant.kind === 'custom') {
    return { ok: true, grant: { kind: 'custom', name: grant.name, quantity: grant.quantity ?? 1 } }
  }
  if (grant.kind === 'currency') {
    return { ok: true, grant: { kind: 'currency', denominationId: grant.denominationId, amount: grant.amount } }
  }
  // grant.kind === 'crossReference'
  const ref = resolvers.resolveCrossReference(grant.choiceSetId)
  if (!ref) return { ok: false, reason: 'unresolved-cross-reference', choiceSetId: grant.choiceSetId }
  return { ok: true, grant: { kind: 'item', ref, quantity: 1 } }
}

// One physical inventory addition, already merged by identity -- the shape
// `character-equipment-bundle.ts` (server) converts straight into `StoredInventoryItem[]` entries
// (adding `instanceId`/`equipped`/`attuned`, which this module has no business deciding).
export type MergedInventoryAddition =
  | { ref: { packageId: string; slug: string }; quantity: number }
  | { name: string; quantity: number }

// Combines the grants from potentially MULTIPLE resolved bundles (class AND background are always
// granted together -- the real corpus's own `additionalFromBackground: true`, never an either/or)
// into one merged addition list plus a currency delta map. Two grants naming the IDENTICAL
// catalogue ref (or the identical custom name, case/whitespace-insensitive) merge their quantities
// into ONE addition -- never two separate physical rows for what the player experiences as "I have
// 4 daggers," never a silently dropped quantity. Currency of the SAME denomination sums.
export function mergeResolvedGrants(
  grantLists: readonly (readonly ResolvedEquipmentGrant[])[]
): { additions: MergedInventoryAddition[]; currency: Record<string, number> } {
  const byKey = new Map<string, MergedInventoryAddition>()
  const currency: Record<string, number> = {}

  for (const grants of grantLists) {
    for (const grant of grants) {
      if (grant.kind === 'currency') {
        currency[grant.denominationId] = (currency[grant.denominationId] ?? 0) + grant.amount
        continue
      }
      const key = grant.kind === 'item'
        ? `ref:${grant.ref.packageId}::${grant.ref.slug}`
        : `name:${grant.name.trim().toLowerCase()}`
      const existing = byKey.get(key)
      if (existing) {
        existing.quantity += grant.quantity
      } else {
        byKey.set(key, grant.kind === 'item'
          ? { ref: grant.ref, quantity: grant.quantity }
          : { name: grant.name, quantity: grant.quantity })
      }
    }
  }

  return { additions: [...byKey.values()], currency }
}
