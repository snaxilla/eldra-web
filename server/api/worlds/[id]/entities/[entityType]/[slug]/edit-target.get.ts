// GET /api/worlds/:id/entities/:entityType/:slug/edit-target
// -- Direct Content Editing consolidation pass. A pure READ: resolves
// what editing (worldId, entityType, slug) would require, WITHOUT
// creating, importing, or binding anything -- opening the "Edit" action
// (or cancelling before ever saving) must never have a side effect, and
// this is the endpoint that makes that possible (the editor calls this
// FIRST, and only calls customize.post.ts if the admin actually saves).

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCapability } from '../../../../../../utils/authorization'
import { resolveDirectEditTarget } from '../../../../../../utils/content-entity-direct-edit'
import { catalogueEntryToBlocks } from '../../../../../../utils/catalogue-entity-bridge'
import { collectionSummaryMetaLines } from '../../../../../../utils/entity-collection-summary'

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

  const target = await resolveDirectEditTarget(worldId, entityType, slug)

  if (target.mode === 'resolver-disabled') {
    return {
      mode: 'resolver-disabled',
      message: 'Direct editing is not set up for this World yet. Ask whoever manages this Eldra deployment to finish the Content Workspaces setup.'
    }
  }

  if (target.mode === 'not-found') {
    throw createError({ statusCode: 404, statusMessage: `'${slug}' was not found in this World` })
  }

  if (target.mode === 'existing-workspace') {
    return {
      mode: 'existing-workspace',
      workspaceId: target.workspaceId,
      contentEntityId: target.contentEntityId,
      scope: target.scope,
      sharedWithWorldCount: target.sharedWithWorldCount
    }
  }

  // needs-preparation: show the SAME presentation/mechanics preview the
  // category rail already shows, computed from the SAME established
  // helpers (never a second provider parser, never invented mechanics).
  let metaLines: string[] = []
  try {
    const blocks = catalogueEntryToBlocks(entityType, { data: target.data } as any)
    metaLines = collectionSummaryMetaLines({ entity_type: entityType, slug }, blocks)
  } catch {
    metaLines = []
  }

  return {
    mode: 'needs-preparation',
    packageId: target.packageId,
    packageVersion: target.packageVersion,
    presentation: target.presentation,
    metaLines
  }
})
