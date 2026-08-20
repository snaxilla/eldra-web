// GET /api/content-sources/[system]/[collection]/preview
//
// Step 4 of .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence (§12): the first generic route, driven entirely
// by (gameSystemKey, collectionKey) instead of naming SRD 5.1. This is
// the route the Builder now calls for every preview -- see
// AdminContentPackBuilderPanel.vue's own header, which as of this step no
// longer knows any specific source, provider, or dataset layout.
//
// RESOLUTION / VALIDATION / EXECUTION: exactly the three responsibilities
// this task's own IMPLEMENT section names, in order --
//   1. Resolve the provider: getProvider(gameSystemKey, collectionKey)
//      (server/utils/content-sources' static registration, unused since
//      Step 2, first real caller in Step 3's GET /api/content-sources,
//      now also this route).
//   2. Validate the requested keys: no matching provider -> 404, thrown
//      BEFORE any I/O, after the capability check -- see this task's own
//      architecture doc §8 Security Notes: "collectionKey and
//      gameSystemKey must never touch a filesystem path... Unknown keys
//      fail closed (404)... so an unauthenticated caller cannot
//      enumerate which collections exist." A provider that IS resolved
//      but whose dataset is unreachable is a different, later failure --
//      that produces the ordinary `available: false` response body, not
//      a 404 (see buildContentSourcePreview).
//   3. Call the provider: server/utils/content-sources/preview.ts's
//      buildContentSourcePreview does availability + per-category
//      loading + response shaping -- the exact logic
//      preview/srd-5-1.get.ts used to inline, now shared by both routes
//      (that file is a compatibility wrapper over this same function as
//      of this step).
//
// BYTE-FOR-BYTE COMPATIBILITY: for (system, collection) = ('dnd5e',
// 'srd-5.1'), this route's response is identical in every field to what
// preview/srd-5-1.get.ts always returned -- same provider
// (srd51Provider), same buildContentSourcePreview call, same categories,
// same failure modes. See that file's own header for the two fields
// (`source`, `reason`) that generalized from hardcoded literals to
// pass-through values without changing what they evaluate to for SRD 5.1.
//
// AUTHORIZATION: gated on `platform.contentpack.publish` -- identical to
// every other route in this workflow (Preview is a read-only step inside
// the same privileged, Platform-scoped Import -> Preview -> Curate ->
// Publish -> Bind flow). No new capability is invented.

import { createError, defineEventHandler, getRouterParam } from 'h3'

import { requireCapability } from '../../../../utils/authorization'
import { getProvider } from '../../../../utils/content-sources'
import { buildContentSourcePreview, type ContentSourcePreviewResult } from '../../../../utils/content-sources/preview'

export default defineEventHandler(async (event): Promise<ContentSourcePreviewResult> => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  const gameSystemKey = getRouterParam(event, 'system') || ''
  const collectionKey = getRouterParam(event, 'collection') || ''

  const provider = getProvider(gameSystemKey, collectionKey)
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown content source' })
  }

  return buildContentSourcePreview(provider)
})
