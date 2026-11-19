// PATCH /api/worlds/:id  { name }
//
// World Properties -- Game Admin -> World Properties -> change name ->
// Save. Renames a World's display `name` only; see renameWorld's own
// header (server/utils/worlds.ts) for the identity/scope guarantees this
// preserves (slug, id, every foreign-keyed relationship untouched).
//
// Authorization: `world.settings.edit`, the SAME capability this World's
// Page Presentation settings already use (presentation-settings.patch.ts,
// presentation/[pageKey].post.ts, presentation/upload-background.post.ts)
// -- this is "World settings" authority (owner/gm), deliberately never
// `world.entity.edit` (worldbuilder/player-reachable content editing,
// a different axis entirely).
//
// createError/defineEventHandler/getRouterParam/readBody are imported
// explicitly (the same reason server/middleware/authorize.ts does) so
// this route is directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../utils/authorization'
import { renameWorld } from '../../../utils/worlds'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.settings.edit', { kind: 'world', worldId })

  const body = await readBody(event).catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name : ''

  const result = await renameWorld(worldId, name)

  if (!result.ok) {
    if (result.stage === 'not-found') {
      throw createError({ statusCode: 404, statusMessage: 'World not found' })
    }
    if (result.reason === 'empty') {
      throw createError({ statusCode: 400, statusMessage: 'World name is required' })
    }
    throw createError({ statusCode: 400, statusMessage: 'World name is too long' })
  }

  return { world: result.world, changed: result.changed }
})
