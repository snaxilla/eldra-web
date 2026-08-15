// POST /api/worlds/:id/content-packs  { packageId, version }
// Binds a World to a published Content Pack (or repins an existing binding
// to a different version of the same package) -- mirrors
// server/api/worlds/[id]/rules/activate.post.ts's shape.
//
// Thin by design: parse/validate the request, call bindContentPackToWorld,
// translate its result into an HTTP response. All binding logic lives in
// and is tested against server/utils/world-content-pack-binding.ts -- this
// file makes no verification or persistence decisions of its own.

import { bindContentPackToWorld } from '../../../../utils/world-content-pack-binding'
import type { ContentPackLoadFailure } from '../../../../utils/content-packs'
import { requireCapability } from '../../../../utils/authorization'

function statusForContentPackLoadFailure(failure: ContentPackLoadFailure): { statusCode: number; statusMessage: string } {
  switch (failure.stage) {
    case 'not-found':
      return { statusCode: 404, statusMessage: `Content pack '${failure.packageId}@${failure.version}' was not found` }
    case 'not-published':
      return { statusCode: 409, statusMessage: `Content pack is not published (status: '${failure.status}')` }
    case 'integrity-mismatch':
      return { statusCode: 409, statusMessage: 'Content pack integrity check failed -- stored content does not match its recorded hash' }
    case 'deserialize':
      return { statusCode: 500, statusMessage: `Content pack '${failure.field}' could not be read: ${failure.error}` }
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.content.bind_pack', { kind: 'world', worldId })

  const body = await readBody(event)
  const packageId = typeof body?.packageId === 'string' ? body.packageId.trim() : ''
  const version = typeof body?.version === 'string' ? body.version.trim() : ''

  if (!packageId || !version) {
    throw createError({ statusCode: 400, statusMessage: 'packageId and version are required' })
  }

  const result = await bindContentPackToWorld(worldId, packageId, version)

  if (!result.bound) {
    throw createError(statusForContentPackLoadFailure(result.failure))
  }

  return { bound: true, binding: result.binding }
})
