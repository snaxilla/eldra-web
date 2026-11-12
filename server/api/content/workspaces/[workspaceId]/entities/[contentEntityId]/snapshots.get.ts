// GET .../entities/:contentEntityId/snapshots -- the immutable history
// of upstream bases for one entity.
//
// Returns metadata and hashes only. The stored payloads
// (`previous_base_data`, `incoming_base_data`) are never selected by
// this listing: raw provider JSON is not Studio's interface, and a
// history list has no use for megabytes of it.

import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'

import {
  validateContentEntityIdParam,
  validatePageRequest
} from '../../../../../../../app/lib/content-workspaces/validation'
import { getWorkspaceEntity, listEntitySourceSnapshots } from '../../../../../../utils/content-workspaces'
import {
  orBadRequest,
  requirePlatformCapability,
  requireWorkspace,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  requirePlatformCapability(event, 'platform.contentworkspace.view')
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))
  const contentEntityId = orBadRequest(validateContentEntityIdParam(getRouterParam(event, 'contentEntityId')))
  const page = orBadRequest(validatePageRequest(getQuery(event) as Record<string, unknown>))

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId)

    const entity = await getWorkspaceEntity(workspaceId, contentEntityId)
    if (!entity) throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })

    const { snapshots, total } = await listEntitySourceSnapshots(workspaceId, contentEntityId, page)
    return { entity, snapshots, total, limit: page.limit, offset: page.offset }
  })
})
