// POST /api/worlds/:id/content-workspace-binding  { workspaceId }
// Binds a World LIVE to a Content Workspace -- Content Workspaces &
// Studio Phase 6. Deliberately a separate route from
// POST /api/worlds/:id/content-packs (pinned/channel binding): a
// different capability (`world.content.bind_workspace`, distinct from
// `world.content.bind_pack`) and a different request shape (no
// `version` -- a live source has none).
//
// Thin by design, mirroring content-packs/index.post.ts's own shape:
// parse/validate, call bindWorkspaceLiveToWorld, translate its result.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { bindWorkspaceLiveToWorld } from '../../../utils/world-content-pack-binding'
import { requireCapability } from '../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  if (!worldId) throw createError({ statusCode: 400, statusMessage: 'Missing world id' })

  const principal = event.context.principal ?? null
  if (!principal) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  requireCapability(principal, 'world.content.bind_workspace', { kind: 'world', worldId })

  const body = await readBody(event)
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : ''
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'workspaceId is required' })

  const result = await bindWorkspaceLiveToWorld(worldId, workspaceId)

  if (!result.bound) {
    if (result.stage === 'resolver-disabled') {
      throw createError({
        statusCode: 409,
        statusMessage: 'The effective content resolver is not enabled on this deployment',
        data: { code: 'effective-content-disabled', message: "Set ELDRA_EFFECTIVE_CONTENT=true before binding a live workspace -- binding one while the resolver is off would display duplicate entries." }
      })
    }
    throw createError({ statusCode: 404, statusMessage: `Content Workspace '${workspaceId}' was not found` })
  }

  return { bound: true, binding: result.binding }
})
