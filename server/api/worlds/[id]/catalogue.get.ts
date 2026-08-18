// GET /api/worlds/:id/catalogue
// The typed gameplay catalogue for a World -- Content Consumers Phase 1
// (see server/utils/world-content-catalogue.ts for the design this
// implements). Mirrors GET /api/worlds/:id/content and
// GET /api/worlds/:id/rules/summary's own shape exactly.
//
// Thin by design: parse the route param, call getWorldContentCatalogue,
// return its result verbatim. All logic -- including which fields are
// safe to expose -- lives in and is tested against
// server/utils/world-content-catalogue.ts; this file performs no I/O of
// its own and makes no shaping decisions. The catalogue is already
// presentation-ready (identity + provenance only, no `data`, no raw
// importer payload) by construction, so there is no separate
// summarize-for-API step the way GET /api/worlds/:id/content needs one.
//
// No requireCapability here, matching GET /api/worlds/:id/content,
// GET /api/worlds/:id/content-packs, and GET /api/worlds/:id/rules/summary's
// own shared precedent -- reading a World's configuration is not gated the
// way writing it is.

import { getWorldContentCatalogue } from '../../../utils/world-content-catalogue'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  return await getWorldContentCatalogue(worldId)
})
