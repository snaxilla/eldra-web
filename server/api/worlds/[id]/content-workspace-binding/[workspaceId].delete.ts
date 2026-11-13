// DELETE /api/worlds/:id/content-workspace-binding/:workspaceId
// Unbinds a World's live Content Workspace -- the World returns to
// whatever pinned bindings it still holds. Always available, including
// with the effective-content flag off (see
// unbindWorkspaceFromWorld's own header: this is the documented
// rollback path and must not be gated behind the thing it recovers from).

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { unbindWorkspaceFromWorld } from '../../../../utils/world-content-pack-binding'
import { requireCapability } from '../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const workspaceId = String(getRouterParam(event, 'workspaceId') || '')
  if (!worldId || !workspaceId) throw createError({ statusCode: 400, statusMessage: 'Missing world id or workspace id' })

  const principal = event.context.principal ?? null
  if (!principal) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  requireCapability(principal, 'world.content.bind_workspace', { kind: 'world', worldId })

  const result = await unbindWorkspaceFromWorld(worldId, workspaceId)

  if (!result.unbound) {
    throw createError({ statusCode: 404, statusMessage: `World ${worldId} is not live-bound to Content Workspace '${workspaceId}'` })
  }

  return { unbound: true }
})
