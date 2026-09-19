// Canonical Spell Mechanics -- the resolver seam.
//
// One entry point for every consumer (server/utils/world-content-catalogue.ts,
// app/lib/content-actions/dnd5e.ts), dispatching on the `systemKey` a
// Content Pack entry already carries. Mirrors app/lib/content-actions/index.ts's
// and app/lib/content-presentation/index.ts's own seam exactly, for the
// identical reason: `dnd5e` is the only implementation that exists, and an
// unknown system resolves to `null` rather than throwing -- a World bound
// to a pack from a system Eldra cannot yet normalize spells for must still
// load, with that entry simply carrying no `spellMechanics`.
//
// Consumers import from HERE, never from ./dnd5e directly, so a future
// second system (or a future Homebrew adapter reusing this same seam -- see
// ./dnd5e.ts's own header on why a GM-authored spell should eventually
// produce this identical shape) is one line in this file and no change
// anywhere else.

import { resolveDnd5eSpellMechanics } from './dnd5e'
import type { CanonicalSpellMechanics, SpellMechanicsResolver } from './types'

export type {
  CanonicalSpellMechanics,
  SpellDice,
  SpellResolutionKind,
  SpellRoll,
  SpellScaling,
  SpellMechanicsResolver
} from './types'

const RESOLVERS: Record<string, SpellMechanicsResolver> = {
  dnd5e: resolveDnd5eSpellMechanics
}

export function resolveSpellMechanics(systemKey: string, data: unknown): CanonicalSpellMechanics | null {
  const resolver = RESOLVERS[systemKey]
  if (!resolver) return null

  return resolver(data)
}
