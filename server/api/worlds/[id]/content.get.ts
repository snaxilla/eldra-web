// GET /api/worlds/:id/content
// The resolved Content Pack catalogue for a World -- Content Resolution
// Phase 1 (see server/utils/world-content-runtime.ts for the design this
// implements). Mirrors GET /api/worlds/:id/rules/summary's own shape
// exactly.
//
// Thin by design: parse the route param, call resolveWorldContent, hand the
// result to summarizeWorldContent for response shaping. All logic --
// including which fields are safe to expose -- lives in and is tested
// against server/utils/world-content-runtime.ts; this file performs no I/O
// of its own and makes no shaping decisions.
//
// No requireCapability here, matching GET /api/worlds/:id/content-packs and
// GET /api/worlds/:id/rules/summary's own precedent -- reading a World's
// configuration is not gated the way writing it is.

import { resolveWorldContent, summarizeWorldContent } from '../../../utils/world-content-runtime'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const catalogue = await resolveWorldContent(worldId)
  return summarizeWorldContent(catalogue)
})
