// GET /api/content-sources
//
// Step 3 of .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence (§12): the first real caller of
// server/utils/content-sources' provider registration (getProvider),
// introduced unused in Step 2. This route performs exactly the merge that
// document's §6.3 describes: Registry (app/lib/content-sources/registry.ts
// -- identity, labels, ordering) + Registered Providers
// (server/utils/content-sources -- does a provider exist, does its
// dataset check out) -> per-collection availability.
//
// AVAILABILITY IS DERIVED, NEVER HAND-MAINTAINED (this task's own
// IMPLEMENT section): a collection is available only when (a) a provider
// is registered for its (gameSystemKey, collectionKey) AND (b) that
// provider's own checkAvailability() reports available. No provider
// registered -> `{ available: false, reason: 'no-provider', ... }`,
// computed here from `getProvider(...) === undefined`, not read off any
// stored field -- the registry itself carries no availability concept as
// of this step (see registry.ts's own design decision 2). A provider
// registered but its dataset unreachable -> whatever
// provider.checkAvailability() reports (today, only srd51Provider exists,
// so this is the only branch that can ever actually fire against a real
// deployment).
//
// SCOPE: this route only lists sources and their availability. It does
// NOT preview, publish, or resolve categories -- generic preview/publish
// routing keyed by (gameSystemKey, collectionKey) is Step 4, explicitly
// out of scope here (this task's own NON-GOALS: "Generic preview route",
// "Generic publish route"). The existing preview/srd-5-1.get.ts and
// publish/srd-5-1*.post.ts routes are untouched by this step and remain
// the only way to actually preview or publish SRD 5.1.
//
// RESPONSE SHAPE: deliberately thin per collection (key, label,
// availability) rather than re-serializing books/license/description/
// suggestedPackageId over the wire -- the architecture doc's §6.3 is
// explicit that the Builder "may still import the registry directly for
// instant structural render (labels, ordering, grouping) and take
// `available` from the endpoint," so this route's only job is to answer
// the one question the registry cannot answer about itself.
//
// AUTHORIZATION: gated on the same `platform.contentpack.publish`
// capability the sibling preview/publish routes require -- this endpoint
// exists to drive the same privileged, Platform-scoped Content Pack
// Builder workflow (Import -> Preview -> Curate -> Publish -> Bind), not
// a player/GM-facing feature of its own. No new capability is invented.

import { defineEventHandler, createError } from 'h3'

import { listGameSystems } from '../../../app/lib/content-sources/registry'
import { requireCapability } from '../../utils/authorization'
import { getProvider } from '../../utils/content-sources'
import type { SourceAvailability } from '../../utils/content-sources/types'

type ContentSourceAvailabilityCollection = {
  key: string
  label: string
  availability: SourceAvailability
}

type ContentSourceAvailabilitySystem = {
  key: string
  label: string
  collections: ContentSourceAvailabilityCollection[]
}

type ContentSourcesResult = {
  systems: ContentSourceAvailabilitySystem[]
}

async function resolveAvailability(gameSystemKey: string, collectionKey: string): Promise<SourceAvailability> {
  const provider = getProvider(gameSystemKey, collectionKey)
  if (!provider) {
    return {
      available: false,
      reason: 'no-provider',
      message: 'No import provider is registered for this content source yet.'
    }
  }

  return provider.checkAvailability()
}

export default defineEventHandler(async (event): Promise<ContentSourcesResult> => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  const systems: ContentSourceAvailabilitySystem[] = []

  for (const system of listGameSystems()) {
    const collections: ContentSourceAvailabilityCollection[] = []

    for (const collection of system.collections) {
      const availability = await resolveAvailability(system.key, collection.key)
      collections.push({ key: collection.key, label: collection.label, availability })
    }

    systems.push({ key: system.key, label: system.label, collections })
  }

  return { systems }
})
