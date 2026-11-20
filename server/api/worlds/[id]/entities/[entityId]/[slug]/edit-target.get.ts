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
import { getWorldSystemKey } from '../../../../../../utils/entity-factory'
import { effectiveAttunementValue, effectiveDamageValue, resolveItemMechanics } from '../../../../../../../app/lib/item-mechanics'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  // RESTORE A CLEAR, CONSISTENT FULL-EDITOR ENTRY POINT -- this route's
  // own URL segment is still :entityType (unchanged, see the GET comment
  // above); the ROUTER PARAM NAME it is read through is 'entityId' only
  // because this directory was moved from a sibling `[entityType]/`
  // folder into `[entityId]/` to fix a real, confirmed-in-production-build
  // routing collision: two dynamically-named sibling folders under the
  // same `entities/` parent (`[entityId]` and the old `[entityType]`)
  // made Nitro's router correctly resolve only ONE of them, silently
  // 404ing every nested route under the other for any path beyond the
  // first dynamic segment -- including the ENTIRE character sheet system
  // (`sheet.get/patch/post.ts` and all of `sheet/**`), `blocks/:blockKey`,
  // `apply-image`, and `class-features`. Reproduced directly: with the
  // folders as siblings, `GET /entities/4/sheet` 404'd while THIS route
  // (under `[entityType]`) answered normally, and vice versa after
  // swapping which folder existed. Merging them into one dynamically-named
  // folder removes the ambiguity; nothing about this route's own URL,
  // behavior, or callers changes -- only which event-context key this one
  // `getRouterParam` call reads the SAME path segment through.
  const entityType = String(getRouterParam(event, 'entityId') || '')
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

  // ITEM MECHANICS AVAILABLE ON THE FIRST EDIT -- the SAME
  // itemMechanicsEditing shape the already-prepared editor's own GET route
  // returns (server/api/content/workspaces/[workspaceId]/entities/[contentEntityId]/index.get.ts),
  // computed here from the RAW catalogue data directly rather than an
  // "effective" merge: a never-yet-customized entity has no authored_mechanics
  // override at all, so base data and effective data are the same thing
  // (resolveEffectiveItemData's own no-op guarantee for an empty override
  // list), making that extra round trip unnecessary. This is what lets the
  // full editor expose rarity/weight/attunement/damage/property on the
  // FIRST open, not only after a first save and reopen.
  let itemMechanicsEditing: {
    rarity: string | null
    weight: number | null
    attunement: ReturnType<typeof effectiveAttunementValue>
    damage: ReturnType<typeof effectiveDamageValue>
    property: unknown[]
    isWeapon: boolean
  } | null = null
  if (entityType === 'item') {
    const systemKey = await getWorldSystemKey(worldId)
    const record = target.data && typeof target.data === 'object' ? target.data as Record<string, unknown> : {}
    itemMechanicsEditing = {
      rarity: typeof record.rarity === 'string' ? record.rarity : null,
      weight: typeof record.weight === 'number' ? record.weight : null,
      attunement: effectiveAttunementValue(target.data),
      damage: effectiveDamageValue(target.data),
      property: Array.isArray(record.property) ? record.property : [],
      isWeapon: resolveItemMechanics(systemKey, target.data) !== null
    }
  }

  return {
    mode: 'needs-preparation',
    packageId: target.packageId,
    packageVersion: target.packageVersion,
    presentation: target.presentation,
    metaLines,
    itemMechanicsEditing
  }
})
