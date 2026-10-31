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
// Character Sheet Homebrew Spell Picker: `spells` is additively merged
// with this World's own Homebrew-authored spell entities (a World-scoped,
// server-side read -- see homebrew-spell-catalogue.ts's own header for the
// root cause this closes and why the merge lives here rather than inside
// world-content-catalogue.ts itself). Every other category, and every
// published-pack spell, is returned exactly as getWorldContentCatalogue
// produced it.
//
// No requireCapability here, matching GET /api/worlds/:id/content,
// GET /api/worlds/:id/content-packs, and GET /api/worlds/:id/rules/summary's
// own shared precedent -- reading a World's configuration is not gated the
// way writing it is.

import { getWorldGameplayCatalogueWithHomebrewSpells } from '../../../utils/homebrew-spell-catalogue'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  return await getWorldGameplayCatalogueWithHomebrewSpells(worldId)
})
