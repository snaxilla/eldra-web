// Canonical Feat Mechanics -- the resolver seam. Mirrors
// app/lib/spell-mechanics/index.ts exactly: one entry point, dispatching on
// `systemKey`, an unknown system degrading to `null` rather than throwing.

import { resolveDnd5eFeatMechanics } from './dnd5e'
import type { CanonicalFeatMechanics, FeatMechanicsResolver } from './types'

export type {
  CanonicalFeatMechanics,
  FeatAbilityIncrease,
  FeatCategory,
  FeatMechanicsResolver,
  FeatPrerequisite,
  FeatVariant,
  UnsupportedPrerequisite
} from './types'

export {
  coverUnsupportedPrerequisites,
  featFilterVerdict,
  featOptionVerdict,
  type FeatureRequirementMapping,
  type FeatOptionVerdict,
  type FeatUnavailableReason
} from './eligibility'

const RESOLVERS: Record<string, FeatMechanicsResolver> = {
  dnd5e: resolveDnd5eFeatMechanics
}

export function resolveFeatMechanics(systemKey: string, data: unknown): CanonicalFeatMechanics | null {
  const resolver = RESOLVERS[systemKey]
  if (!resolver) return null

  return resolver(data)
}
