// DELETE .../entities/:contentEntityId/overrides/mechanics -- revert
// EVERY authored mechanics field for one entity in one request. Items
// Mechanics Editing, release one -- direct sibling of
// overrides/presentation.delete.ts.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import { validateContentEntityIdParam, validateRevertRequest } from '../../../../../../../../app/lib/content-workspaces/validation'
import { getWorkspaceEntityDetail, revertMechanicsChannel } from '../../../../../../../utils/content-workspace-entities'
import {
  orBadRequest,
  requireWorkspace,
  requireWorkspaceEntityAccess,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))
  const contentEntityId = orBadRequest(validateContentEntityIdParam(getRouterParam(event, 'contentEntityId')))
  const rawBody = await readBody(event)
  const worldId = typeof rawBody?.worldId === 'string' && rawBody.worldId ? rawBody.worldId : null
  const principal = await requireWorkspaceEntityAccess(event, 'platform.contentworkspace.edit', workspaceId, worldId, 'write')
  const request = orBadRequest(validateRevertRequest(rawBody))

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId, { mutable: true })

    const entity = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
    if (!entity) throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })

    const outcome = await revertMechanicsChannel(workspaceId, contentEntityId, request.expectedRevision, principal.accountId)

    if (!outcome.ok) {
      if (outcome.stage === 'not-found') throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })
      if (outcome.stage === 'invalid-path') throw createError({ statusCode: 400, statusMessage: 'Invalid request' })
      if (outcome.stage === 'persistence-unavailable') {
        throw createError({
          statusCode: 503,
          statusMessage: 'Content Workspace editing is not available on this deployment',
          data: { code: 'content-workspace-persistence-unavailable', message: outcome.message }
        })
      }
      throw createError({
        statusCode: 409,
        statusMessage: 'This entity was saved by someone else since you loaded it',
        data: { code: 'revision-conflict', current: outcome.current }
      })
    }

    return { entity: outcome.entity }
  })
})
