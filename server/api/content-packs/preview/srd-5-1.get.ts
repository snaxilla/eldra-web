// GET /api/content-packs/preview/srd-5-1
//
// COMPATIBILITY WRAPPER as of Step 4 of
// .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence (§12) -- this task's own KEEP section: "Keep
// preview/srd-5-1.get.ts as a compatibility wrapper. It should simply
// delegate to the generic implementation." The Builder no longer calls
// this route (it derives GET /api/content-sources/dnd5e/srd-5.1/preview
// from (gameSystemKey, collectionKey) instead -- see
// AdminContentPackBuilderPanel.vue), but this route is not deleted: route
// retirement is Step 7, explicitly out of scope here, and any other
// caller (a bookmark, a script, a stale client build) still gets the
// exact same response it always did.
//
// DELEGATION: this route now shares its entire response-shaping logic
// with the generic route via buildContentSourcePreview
// (server/utils/content-sources/preview.ts) -- the same function, not a
// second copy. This file's only remaining job is HTTP: authenticate,
// authorize, and hand a fixed provider (srd51Provider) to that shared
// function. There is no dataset access, no membership predicate, no
// category loop, and no response-shaping left in this file at all --
// every one of those moved to the provider (Step 2) or the shared preview
// builder (this step).
//
// AUTHORIZATION: unchanged -- gated on `platform.contentpack.publish`,
// identical to every sibling content-pack route.

import { createError, defineEventHandler } from 'h3'

import { requireCapability } from '../../../utils/authorization'
import { srd51Provider } from '../../../utils/content-sources/dnd5e/srd-5-1'
import { buildContentSourcePreview, type ContentSourcePreviewResult } from '../../../utils/content-sources/preview'

export default defineEventHandler(async (event): Promise<ContentSourcePreviewResult> => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  return buildContentSourcePreview(srd51Provider)
})
