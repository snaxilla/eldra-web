// Content Actions -- the resolver seam.
//
// One entry point for every consumer (server/utils/world-content-catalogue.ts),
// dispatching on the `systemKey` a Content Pack entry already carries.
// Mirrors app/lib/content-presentation/index.ts's own seam exactly, for the
// identical reason: `dnd5e` is the only implementation that exists, and an
// unknown system resolves to [] rather than throwing -- a World bound to a
// pack from a system Eldra cannot yet present must still load, with no
// Actions surfaced for that content rather than an error.
//
// Consumers import from HERE, never from ./dnd5e directly, so adding a
// second system is one line in this file and no change anywhere else.

import { resolveDnd5eActions } from './dnd5e'
import type { ActionCategory, ContentAction, ContentActionResolver, ContentSourceCategory } from './types'

export type {
  ActionCategory,
  ContentAction,
  ContentActionResolver,
  ContentSourceCategory
} from './types'

const RESOLVERS: Record<string, ContentActionResolver> = {
  dnd5e: resolveDnd5eActions
}

export function resolveContentActions(
  systemKey: string,
  category: ContentSourceCategory,
  data: unknown
): ContentAction[] {
  const resolver = RESOLVERS[systemKey]
  if (!resolver) return []

  return resolver(category, data)
}
