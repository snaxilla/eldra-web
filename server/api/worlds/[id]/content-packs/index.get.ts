// GET /api/worlds/:id/content-packs
// Every Content Pack binding this World holds -- a World may bind MANY
// packs (design goal), so unlike GET /api/worlds/:id/rules/summary this
// returns a list, not a single active package.
//
// Thin by design: parse the route param, call
// listContentPackBindingsForWorld, return its result verbatim. No
// requireCapability here, matching GET /api/worlds/:id/rules/summary's own
// precedent -- reading a World's configuration is not gated the way
// writing it is.

import { listContentPackBindingsForWorld } from '../../../../utils/world-content-packs'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const bindings = await listContentPackBindingsForWorld(worldId)
  return { bindings }
})
