// Canonical Item Mechanics -- the resolver seam. Mirrors
// app/lib/feat-mechanics/index.ts and app/lib/spell-mechanics/index.ts
// exactly: one entry point, dispatching on `systemKey`, an unknown system
// degrading to `null` rather than throwing.

import { resolveDnd5eItemAttunementRequired, resolveDnd5eItemMechanics } from './dnd5e'
import type { CanonicalItemMechanics, ItemMechanicsResolver } from './types'

export type {
  CanonicalItemMechanics,
  ItemMechanicsResolver,
  WeaponMasteryProperty,
  WeaponProperty
} from './types'

export {
  itemFilterVerdict,
  itemOptionVerdict,
  type ItemOptionVerdict,
  type ItemUnavailableReason
} from './eligibility'

const RESOLVERS: Record<string, ItemMechanicsResolver> = {
  dnd5e: resolveDnd5eItemMechanics
}

export function resolveItemMechanics(systemKey: string, data: unknown): CanonicalItemMechanics | null {
  const resolver = RESOLVERS[systemKey]
  if (!resolver) return null

  return resolver(data)
}

// Character Sheet Inventory pass. Same dispatch-by-system shape as
// resolveItemMechanics above, for the one other item fact the Sheet needs
// that is not weapon-specific. An unknown system resolves to `false`, the
// same "not explicitly required" default resolveDnd5eItemAttunementRequired
// itself returns for malformed data -- never a thrown error, never `null`.
const ATTUNEMENT_RESOLVERS: Record<string, (data: unknown) => boolean> = {
  dnd5e: resolveDnd5eItemAttunementRequired
}

export function resolveItemAttunementRequired(systemKey: string, data: unknown): boolean {
  const resolver = ATTUNEMENT_RESOLVERS[systemKey]
  if (!resolver) return false

  return resolver(data)
}
