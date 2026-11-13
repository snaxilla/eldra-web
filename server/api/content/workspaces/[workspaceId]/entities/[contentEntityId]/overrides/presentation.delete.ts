// DELETE .../entities/:contentEntityId/overrides/presentation -- revert
// EVERY authored presentation field for one entity in one request.
// Content Workspaces & Studio Phase 4.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import { validateContentEntityIdParam, validateRevertRequest } from '../../../../../../../../app/lib/content-workspaces/validation'
import { revertPresentationChannel } from '../../../../../../../utils/content-workspace-entities'
import {
  orBadRequest,
  requirePlatformCapability,
  requireWorkspace,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const principal = requirePlatformCapability(event, 'platform.contentworkspace.edit')
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))
  const contentEntityId = orBadRequest(validateContentEntityIdParam(getRouterParam(event, 'contentEntityId')))
  const request = orBadRequest(validateRevertRequest(await readBody(event)))

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId, { mutable: true })

    const outcome = await revertPresentationChannel(workspaceId, contentEntityId, request.expectedRevision, principal.accountId)

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
