// PATCH /api/content/workspaces/:workspaceId/entities/:contentEntityId
// -- Content Workspaces & Studio Phase 4. Applies presentation field
// overrides. See server/utils/content-workspace-entities.ts for the
// concurrency model this conditions on `expectedRevision`.
//
// A conflict is never a 500 and never silently discarded work: it is a
// 409 carrying the CURRENT entity, so the editor can show the caller
// what changed and let them re-apply their edit against the new revision.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import { validateContentEntityIdParam, validatePresentationPatchRequest } from '../../../../../../../app/lib/content-workspaces/validation'
import { applyPresentationEdits, getWorkspaceEntityDetail } from '../../../../../../utils/content-workspace-entities'
import { computePresentationBaseValueHash, resolveBasePresentation } from '../../../../../../utils/content-workspace-presentation'
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
  const request = orBadRequest(validatePresentationPatchRequest(await readBody(event)))

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId, { mutable: true })

    const entity = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
    if (!entity) throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })

    const basePresentation = resolveBasePresentation(entity)
    const edits = request.edits.map((edit) => ({
      path: edit.path,
      value: edit.value,
      baseValueHash: computePresentationBaseValueHash(basePresentation, edit.path)
    }))

    const outcome = await applyPresentationEdits(workspaceId, contentEntityId, request.expectedRevision, edits, principal.accountId)

    if (!outcome.ok) {
      if (outcome.stage === 'not-found') throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })
      if (outcome.stage === 'invalid-path') {
        throw createError({ statusCode: 400, statusMessage: `'${outcome.path}' is not an editable presentation field` })
      }
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
