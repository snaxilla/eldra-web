// POST /api/content-packs/publish
// { gameSystemKey, collectionKey, packageId?, version, selection }
//
// Step 5 of .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence (§12): the generic publish route, driven entirely
// by (gameSystemKey, collectionKey) instead of naming SRD 5.1. This is the
// route the Builder now calls to publish -- see
// AdminContentPackBuilderPanel.vue's own header, which as of this step no
// longer knows any specific publish endpoint either.
//
// RESOLUTION / REGENERATION / SELECTION / PUBLISH -- exactly the four
// responsibilities this task's own IMPLEMENT section names, in order:
//   1. Resolve the provider: getProvider(gameSystemKey, collectionKey)
//      (server/utils/content-sources, unchanged since Step 2) AND the
//      registry entry: getSourceCollection(gameSystemKey, collectionKey)
//      (app/lib/content-sources/registry.ts, unchanged since Step 3) --
//      TWO lookups, exactly mirroring how GET /api/content-sources already
//      merges the two (Step 3) and how the generic preview route already
//      resolves the provider half (Step 4). Either missing -> 404, thrown
//      BEFORE any I/O, after the capability check -- see the architecture
//      doc's §8 Security Notes, the same posture the generic preview route
//      already established: "collectionKey and gameSystemKey must never
//      touch a filesystem path... Unknown keys fail closed (404)."
//   2. Regenerate authoritative candidates from the provider, 3. apply the
//      submitted selection, and 4. publish using the existing pipeline --
//      all three live in server/utils/content-sources/publish.ts's
//      publishContentSourceSelection, shared with the srd-5-1-curated
//      compatibility wrapper (this task's own KEEP section) so neither
//      route can drift from the other about what "publish this selection"
//      means. Do NOT create another publisher (this task's own IMPLEMENT
//      section) -- that shared function still calls the one existing
//      publishContentPack (content-pack-publishing.ts) unchanged.
//
// REGISTRY OWNS PUBLICATION METADATA (this task's own REGISTRY section):
// `title`, `description`, `license`, and the `packageId` default all come
// from the resolved SourceCollectionDefinition -- this route hardcodes none
// of them. An omitted or blank `packageId` in the request defaults to
// `collection.suggestedPackageId` (architecture doc §5.4); `version` has no
// default -- a version is always a deliberate act.
//
// SELECTION REMAINS INTENT, NEVER DATA (this task's own IMPORTANT section):
// see publish.ts's own header for the full reasoning -- unchanged from
// srd-5-1-curated.post.ts's original design, now shared rather than
// duplicated.
//
// NOT BINDING: this route only publishes. Binding a World to the resulting
// pack is the caller's separate next step via the existing
// POST /api/worlds/:id/content-packs (world-content-pack-binding.ts) --
// unchanged, untouched, and never invoked from here.
//
// AUTHORIZATION: gated on `platform.contentpack.publish` -- identical to
// every other route in this workflow. No new capability is invented.

import { createError, defineEventHandler, readBody } from 'h3'

import { requireCapability } from '../../utils/authorization'
import { getGameSystem, getSourceCollection } from '../../../app/lib/content-sources/registry'
import { getProvider } from '../../utils/content-sources'
import { publishContentSourceSelection } from '../../utils/content-sources/publish'

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  const body = await readBody(event)
  const gameSystemKey = typeof body?.gameSystemKey === 'string' ? body.gameSystemKey.trim() : ''
  const collectionKey = typeof body?.collectionKey === 'string' ? body.collectionKey.trim() : ''

  const provider = getProvider(gameSystemKey, collectionKey)
  const collection = getSourceCollection(gameSystemKey, collectionKey)
  if (!provider || !collection || !getGameSystem(gameSystemKey)) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown content source' })
  }

  const submittedPackageId = typeof body?.packageId === 'string' ? body.packageId.trim() : ''
  const packageId = submittedPackageId || collection.suggestedPackageId
  const version = typeof body?.version === 'string' ? body.version.trim() : ''
  const selection = body?.selection && typeof body.selection === 'object' ? body.selection : {}

  const outcome = await publishContentSourceSelection({ provider, collection, packageId, version, selection })

  if (!outcome.published) {
    if (outcome.stage === 'validation') {
      throw createError({
        statusCode: 422,
        statusMessage: 'Content Pack failed publication validation',
        data: { issues: outcome.issues }
      })
    }

    throw createError({
      statusCode: 409,
      statusMessage: `Content Pack ${outcome.packageId}@${outcome.version} already exists (status: ${outcome.status})`
    })
  }

  return outcome
})
