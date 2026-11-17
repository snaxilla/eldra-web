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
//
// Items Mechanics Editing, release one: this is the SAVED-STATE preview
// (source-resolved base + persisted authored_mechanics overrides), never
// a live preview of a caller's unsaved draft -- there is no such thing
// anywhere in this editor today (see the investigation's own §5 finding),
// so this route does not invent one. `metaLines` below is rebuilt from
// the EFFECTIVE (merged) raw data, not the unmerged base -- the one other
// call site besides world-content-sources.ts that reads an item's raw
// payload for mechanics-adjacent display, and the one the investigation's
// own §5 finding warned a world-content-sources.ts-only fix would miss.

import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'

import { validateContentEntityIdParam } from '../../../../../../../app/lib/content-workspaces/validation'
import {
  effectiveAttunementValue,
  effectiveDamageValue,
  resolveEffectiveItemData,
  resolveItemMechanics
} from '../../../../../../../app/lib/item-mechanics'
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

    // Effective (merged) raw data -- base payload with any saved
    // authored_mechanics overlay applied. A non-item entity, or one with
    // no mechanics overrides, gets rawPayloadOf(entity) back unchanged
    // (resolveEffectiveItemData's own no-op guarantee).
    const effectiveData = resolveEffectiveItemData(entity.systemKey, rawPayloadOf(entity), entity.authoredMechanics)

    // Direct-edit consolidation pass, section 7: the SAME mechanics
    // meta-lines the category rail shows (established helpers, never a
    // second provider parser) -- so the shared editor's own preview
    // never disagrees with what the admin already saw on the card. Reads
    // the EFFECTIVE data, not the unmerged base, so a saved mechanics
    // override is reflected here too.
    let metaLines: string[] = []
    try {
      const blocks = catalogueEntryToBlocks(entity.entityType, { data: effectiveData } as never)
      metaLines = collectionSummaryMetaLines({ entity_type: entity.entityType, slug: entity.slug }, blocks)
    } catch {
      metaLines = []
    }

    // Items Mechanics Editing, release one: the editor's own field-seeding
    // data for the five approved mechanics fields, read off the EFFECTIVE
    // data so a reload after Save shows exactly what was just saved.
    // `isWeapon` gates whether the damage/property controls make sense at
    // all (CanonicalItemMechanics resolving, not merely a 'M'/'R' type
    // label -- see the investigation's own §2 finding on why `type` alone
    // is not a safe weapon-identity signal).
    let itemMechanicsEditing: {
      rarity: string | null
      weight: number | null
      attunement: ReturnType<typeof effectiveAttunementValue>
      damage: ReturnType<typeof effectiveDamageValue>
      property: unknown[]
      isWeapon: boolean
    } | null = null
    if (entity.entityType === 'item') {
      const record = effectiveData && typeof effectiveData === 'object' ? effectiveData as Record<string, unknown> : {}
      itemMechanicsEditing = {
        rarity: typeof record.rarity === 'string' ? record.rarity : null,
        weight: typeof record.weight === 'number' ? record.weight : null,
        attunement: effectiveAttunementValue(effectiveData),
        damage: effectiveDamageValue(effectiveData),
        property: Array.isArray(record.property) ? record.property : [],
        isWeapon: resolveItemMechanics(entity.systemKey, effectiveData) !== null
      }
    }

    return { entity, preview: { ...preview, metaLines, itemMechanicsEditing } }
  })
})
