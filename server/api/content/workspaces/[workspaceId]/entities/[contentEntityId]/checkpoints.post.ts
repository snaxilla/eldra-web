// POST .../entities/:contentEntityId/checkpoints -- name the entity's
// CURRENT authored state as a permanent, never-pruned revision.
// Content Workspaces & Studio Phase 4.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import { validateCheckpointRequest, validateContentEntityIdParam } from '../../../../../../../app/lib/content-workspaces/validation'
import { createEntityCheckpoint } from '../../../../../../utils/content-workspace-entities'
import {
  orBadRequest,
  requirePlatformCapability,
  requireWorkspace,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const principal = requirePlatformCapability(event, 'platform.contentworkspace.edit')
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))
  const contentEntityId = orBadRequest(validateContentEntityIdParam(getRouterParam(event, 'contentEntityId')))
  const request = orBadRequest(validateCheckpointRequest(await readBody(event)))

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId, { mutable: true })

    const outcome = await createEntityCheckpoint(workspaceId, contentEntityId, request.label, principal.accountId)
    if (!outcome.ok) throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })

    return { revisionId: outcome.revisionId }
  })
})
