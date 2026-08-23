// Content Presentation -- the resolver seam.
//
// One entry point for every consumer (server/utils/world-content-catalogue.ts
// today), dispatching on the `systemKey` a Content Pack entry already
// carries. This is the same pluggability seam app/lib/systems/* uses:
// `dnd5e` is the only implementation that exists, and an unknown system
// resolves to null rather than throwing -- a World bound to a pack from a
// system Eldra cannot yet present must still load, showing identity and
// provenance without details.
//
// Consumers import from HERE, never from ./dnd5e directly, so adding a
// second system is one line in this file and no change anywhere else.

import { resolveDnd5ePresentation } from './dnd5e'
import type { ContentPresentationResolver, PresentationEntry, PresentationKind } from './types'

export type {
  ContentPresentationResolver,
  PresentationEntry,
  PresentationFact,
  PresentationKind,
  PresentationSection
} from './types'

const RESOLVERS: Record<string, ContentPresentationResolver> = {
  dnd5e: resolveDnd5ePresentation
}

export function resolveContentPresentation(
  systemKey: string,
  kind: PresentationKind,
  data: unknown
): PresentationEntry | null {
  const resolver = RESOLVERS[systemKey]
  if (!resolver) return null

  return resolver(kind, data)
}
