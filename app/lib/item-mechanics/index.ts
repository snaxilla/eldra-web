// Canonical Item Mechanics -- the resolver seam. Mirrors
// app/lib/feat-mechanics/index.ts and app/lib/spell-mechanics/index.ts
// exactly: one entry point, dispatching on `systemKey`, an unknown system
// degrading to `null` rather than throwing.

import { resolveDnd5eItemMechanics } from './dnd5e'
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
