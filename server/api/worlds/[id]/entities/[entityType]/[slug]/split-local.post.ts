// POST /api/worlds/:id/entities/:entityType/:slug/split-local
// -- Direct Content Editing consolidation pass, completed after the
// pre-commit boundary review. "Customize for this World" from an
// ALREADY-shared workspace entity: materializes a new entity in this
// World's own local workspace, seeded from the shared entity's CURRENT
// overrides, inheriting the same base/mechanics/legacy evidence. See
// server/utils/content-entity-direct-edit.ts's own
// `splitSharedEntityToLocalWorkspace` for the exact guarantees.
//
// AUTHORIZATION -- `world.entity.edit` only. Deliberately NOT the
// escalated `world.content.bind_workspace` the SHARED-collection-editing
// path requires: this operation never writes to the shared workspace at
// all, and never changes what any OTHER World sees -- it only prepares
// and binds a brand-new workspace scoped to THIS World alone, the exact
// same action `customize.post.ts`'s own `needs-preparation` branch is
// already allowed to take with the same capability.

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCapability } from '../../../../../../utils/authorization'
import { getWorldSystemKey } from '../../../../../../utils/entity-factory'
import { splitSharedEntityToLocalWorkspace } from '../../../../../../utils/content-entity-direct-edit'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityType = String(getRouterParam(event, 'entityType') || '')
  const slug = String(getRouterParam(event, 'slug') || '')
  if (!worldId || !entityType || !slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id, entity type, or slug' })
  }

  const principal = event.context.principal ?? null
  if (!principal) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId })

  const systemKey = await getWorldSystemKey(worldId)
  const result = await splitSharedEntityToLocalWorkspace(
    { worldId, entityType, slug, actorAccountId: principal.accountId },
    systemKey
  )

  if (!result.ok) {
    if (result.stage === 'resolver-disabled') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Direct editing is not set up for this World yet',
        data: { code: 'effective-content-disabled', message: result.message }
      })
    }
    if (result.stage === 'not-found') throw createError({ statusCode: 404, statusMessage: result.message })
    if (result.stage === 'not-shared') throw createError({ statusCode: 400, statusMessage: result.message })
    if (result.stage === 'no-base-reference') {
      throw createError({ statusCode: 409, statusMessage: result.message, data: { code: 'split-no-base-reference' } })
    }
    if (result.stage === 'persistence-unavailable') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Content editing is not available on this deployment',
        data: { code: 'content-workspace-persistence-unavailable', message: result.message }
      })
    }
    throw createError({
      statusCode: 502,
      statusMessage: result.message,
      data: { code: 'direct-edit-split-failed', retrySafe: result.retrySafe }
    })
  }

  return { workspaceId: result.workspaceId, contentEntityId: result.contentEntityId, entity: result.entity }
})
