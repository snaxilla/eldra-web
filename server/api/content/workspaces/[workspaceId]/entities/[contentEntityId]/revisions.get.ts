// GET .../entities/:contentEntityId/revisions -- append-only authoring
// history for one entity.

import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'

import {
  validateContentEntityIdParam,
  validatePageRequest
} from '../../../../../../../app/lib/content-workspaces/validation'
import { getWorkspaceEntity, listWorkspaceRevisions } from '../../../../../../utils/content-workspaces'
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

    const { revisions, total } = await listWorkspaceRevisions(workspaceId, contentEntityId, page)
    return { entity, revisions, total, limit: page.limit, offset: page.offset }
  })
})
