// GET /api/worlds/:id/characters/:characterId/assembly
// Character Assembly Phase 1 -- see server/utils/character-assembly.ts for
// the resolution design this implements. Thin by design: parse the two
// route params, call assembleCharacter, translate its result into an HTTP
// response. All resolution logic lives in and is tested against
// character-assembly.ts; this file makes no shaping decisions of its own.
//
// A character that genuinely does not exist in this World is a real 404
// (mirrors GET /api/worlds/:id/entities/:entityId's own "Entity not found
// in this world" posture exactly). A character that exists but has
// nothing to assemble (no `catalogue_selection` block -- e.g. a V1
// character) is NOT an error: it returns 200 with `available: false` and a
// human-readable reason, the same "available:false, not a thrown error"
// shape GET /api/content-packs/preview/srd-5-1 already established for
// "there is genuinely nothing here yet."
//
// No requireCapability here -- matching GET /api/worlds/:id/content,
// GET /api/worlds/:id/catalogue, and GET /api/worlds/:id/entities/:entityId's
// own shared precedent: reading is not gated the way writing is.
//
// Explicit h3 imports (rather than relying on Nitro's auto-imports, which
// GET /api/worlds/:id/catalogue and .../content use) -- this route branches
// on assembleCharacter's result (404 vs 200 available:false), unlike those
// two pure pass-throughs, so it gets its own route-level test, mirroring
// GET /api/content-packs/preview/srd-5-1's own explicit-import convention.

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { assembleCharacter } from '../../../../../utils/character-assembly'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or character id' })
  }

  const result = await assembleCharacter(worldId, characterId)

  if (!result.available && result.reason === 'character-not-found') {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  return result
})
