// GET /api/content/workspaces/:workspaceId/entities -- bounded listing.
//
// Always paginated: `limit` defaults to 50 and is capped at 100, so a
// workspace holding a whole Player's Handbook cannot be fetched in one
// unbounded response. Payload columns (base_data, the override channels)
// are never selected by this listing.

import { defineEventHandler, getQuery, getRouterParam } from 'h3'

import { validateEntityListFilter, validatePageRequest } from '../../../../../app/lib/content-workspaces/validation'
import { listWorkspaceEntities } from '../../../../utils/content-workspaces'
import {
  orBadRequest,
  requirePlatformCapability,
  requireWorkspace,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  requirePlatformCapability(event, 'platform.contentworkspace.view')
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))

  const query = getQuery(event) as Record<string, unknown>
  const page = orBadRequest(validatePageRequest(query))
  const filter = orBadRequest(validateEntityListFilter(query))

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId)
    const { entities, total } = await listWorkspaceEntities(workspaceId, page, filter)
    return { entities, total, limit: page.limit, offset: page.offset }
  })
})
