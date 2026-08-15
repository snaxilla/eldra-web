// DELETE /api/worlds/:id/content-packs/:packageId
// Removes a World's binding to a Content Pack. No equivalent exists in the
// Rules Package milestone (a World is never "unconfigured" by an explicit
// endpoint -- see rules-package-infrastructure.md Q6's "Deactivation is
// deleting the world_rules_config row" for the closest analog); this route
// exists because Content Packs are additive/many-per-world, so removing
// one binding must not be confused with the World's other bindings.
//
// Thin by design: parse the route params, call
// unbindContentPackFromWorld, translate its result into an HTTP response.

import { unbindContentPackFromWorld } from '../../../../utils/world-content-pack-binding'
import { requireCapability } from '../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const packageId = String(getRouterParam(event, 'packageId') || '')

  if (!worldId || !packageId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id or package id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.content.bind_pack', { kind: 'world', worldId })

  const result = await unbindContentPackFromWorld(worldId, packageId)

  if (!result.unbound) {
    throw createError({ statusCode: 404, statusMessage: `World ${worldId} has no binding to content pack '${packageId}'` })
  }

  return { unbound: true }
})
