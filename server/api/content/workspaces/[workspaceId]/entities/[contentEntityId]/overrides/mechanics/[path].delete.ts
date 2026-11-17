// DELETE .../overrides/mechanics/:path -- revert ONE authored mechanics
// field, restoring the inherited (source-resolved) value. Items Mechanics
// Editing, release one -- direct sibling of
// overrides/presentation/[path].delete.ts. Mechanics path validity is
// entity-type-aware (scoped to `item` this release), so the entity is
// loaded here first, unlike the presentation sibling.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import {
  validateContentEntityIdParam,
  validateMechanicsPathParam,
  validateRevertRequest
} from '../../../../../../../../../app/lib/content-workspaces/validation'
import { getWorkspaceEntityDetail, revertMechanicsPath } from '../../../../../../../../utils/content-workspace-entities'
import {
  orBadRequest,
  requireWorkspace,
  requireWorkspaceEntityAccess,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))
  const contentEntityId = orBadRequest(validateContentEntityIdParam(getRouterParam(event, 'contentEntityId')))
  const path = orBadRequest(validateMechanicsPathParam(getRouterParam(event, 'path')))
  const rawBody = await readBody(event)
  const worldId = typeof rawBody?.worldId === 'string' && rawBody.worldId ? rawBody.worldId : null
  const principal = await requireWorkspaceEntityAccess(event, 'platform.contentworkspace.edit', workspaceId, worldId, 'write')
  const request = orBadRequest(validateRevertRequest(rawBody))

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId, { mutable: true })

    const entity = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
    if (!entity) throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })

    const outcome = await revertMechanicsPath(workspaceId, contentEntityId, request.expectedRevision, entity.entityType, path, principal.accountId)

    if (!outcome.ok) {
      if (outcome.stage === 'not-found') throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })
      if (outcome.stage === 'invalid-path') throw createError({ statusCode: 400, statusMessage: `'${outcome.path}' is not an editable mechanics field` })
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
