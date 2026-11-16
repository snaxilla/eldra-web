// GET /api/content/workspaces/:workspaceId/entities/:contentEntityId
// -- Content Workspaces & Studio Phase 4. One entity's full detail plus
// a presentation PREVIEW (source-resolved + authored overlay), so the
// editor can show "what this will look like" without the catalogue
// consuming authored_presentation yet (that is Phase 5/6).
//
// `worldId` is optional and scopes image resolution only -- a Media
// Gallery asset is never shown outside the World it belongs to (Phase 0).
// Without it, an authored image still reports correctly as unavailable
// rather than guessing at a World.

import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'

import { validateContentEntityIdParam } from '../../../../../../../app/lib/content-workspaces/validation'
import { getWorkspaceEntityDetail } from '../../../../../../utils/content-workspace-entities'
import { previewEntityPresentation, rawPayloadOf } from '../../../../../../utils/content-workspace-presentation'
import { catalogueEntryToBlocks } from '../../../../../../utils/catalogue-entity-bridge'
import { collectionSummaryMetaLines } from '../../../../../../utils/entity-collection-summary'
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
  const query = getQuery(event) as Record<string, unknown>
  const worldId = typeof query.worldId === 'string' && query.worldId ? query.worldId : null
  await requireWorkspaceEntityAccess(event, 'platform.contentworkspace.view', workspaceId, worldId, 'read')

  return await withWorkspaceHttp(async () => {
    await requireWorkspace(workspaceId)

    const entity = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
    if (!entity) throw createError({ statusCode: 404, statusMessage: 'No such entity in this Content Workspace' })

    const preview = await previewEntityPresentation(entity, { worldId })

    // Direct-edit consolidation pass, section 7: the SAME mechanics
    // meta-lines the category rail shows (established helpers, never a
    // second provider parser) -- so the shared editor's own preview
    // never disagrees with what the admin already saw on the card.
    let metaLines: string[] = []
    try {
      const blocks = catalogueEntryToBlocks(entity.entityType, { data: rawPayloadOf(entity) } as never)
      metaLines = collectionSummaryMetaLines({ entity_type: entity.entityType, slug: entity.slug }, blocks)
    } catch {
      metaLines = []
    }

    return { entity, preview: { ...preview, metaLines } }
  })
})
