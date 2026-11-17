// PATCH /api/content/workspaces/:workspaceId/entities/:contentEntityId
// -- Content Workspaces & Studio Phase 4, extended by Items Mechanics
// Editing (release one) to accept a MIX of presentation and mechanics
// edits in the SAME request, applied atomically under one expectedRevision
// (server/utils/content-workspace-entities.ts's applyEntityEdits -- see
// its own header for the combined-save guarantee this conditions on).
//
// An edit with no `channel` defaults to 'presentation' -- an existing
// presentation-only caller's request body validates and behaves exactly
// as it did before this pass.
//
// A conflict is never a 500 and never silently discarded work: it is a
// 409 carrying the CURRENT entity, so the editor can show the caller
// what changed and let them re-apply their edit against the new revision.
// Per the Items Mechanics Editing brief: a conflict here is reported as-is
// -- this route never re-reads and re-applies on the caller's behalf, so
// an unsaved draft is never silently rebased onto a newer revision.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import { validateContentEntityIdParam, validateEntityPatchRequest } from '../../../../../../../app/lib/content-workspaces/validation'
import { validateItemMechanicsOverrideValue } from '../../../../../../../app/lib/item-mechanics'
import { applyEntityEdits, getWorkspaceEntityDetail, type EntityChannelEdit } from '../../../../../../utils/content-workspace-entities'
import { computePresentationBaseValueHash, resolveBasePresentation } from '../../../../../../utils/content-workspace-presentation'
import {
  orBadRequest,
  requireWorkspace,
  requireWorkspaceEntityAccess,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))
  const contentEntityId = orBadRequest(validateContentEntityIdParam(getRouterParam(event, 'contentEntityId')))
  const rawBody = await readBody(event)
  const worldId = typeof rawBody?.worldId === 'string' && rawBody.worldId ? rawBody.worldId : null
  const principal = await requireWorkspaceEntityAccess(event, 'platform.contentworkspace.edit', workspaceId, worldId, 'write')
  const request = orBadRequest(validateEntityPatchRequest(rawBody))

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId, { mutable: true })

    const entity = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
    if (!entity) throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })

    const basePresentation = resolveBasePresentation(entity)

    // Mechanics VALUE validation (path validity is re-checked, defense in
    // depth, by applyEntityEdits itself) -- entity-type-aware, so it can
    // only happen here, after `entity.entityType` is known. "Reject the
    // whole request if any operation is invalid": the first invalid edit
    // throws before applyEntityEdits is ever called, so a request mixing
    // one good and one bad mechanics edit never partially applies.
    for (const edit of request.edits) {
      if (edit.channel !== 'mechanics') continue
      const result = validateItemMechanicsOverrideValue(edit.path, edit.value)
      if (!result.ok) {
        throw createError({ statusCode: 400, statusMessage: `'${edit.path}': ${result.problems.join('; ')}` })
      }
    }

    const edits: EntityChannelEdit[] = request.edits.map((edit) => ({
      channel: edit.channel,
      path: edit.path,
      value: edit.value,
      baseValueHash: edit.channel === 'presentation' ? computePresentationBaseValueHash(basePresentation, edit.path) : null
    }))

    const outcome = await applyEntityEdits(workspaceId, contentEntityId, request.expectedRevision, entity.entityType, edits, principal.accountId)

    if (!outcome.ok) {
      if (outcome.stage === 'not-found') throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })
      if (outcome.stage === 'invalid-path') {
        throw createError({ statusCode: 400, statusMessage: `'${outcome.path}' is not an editable field` })
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
