import { directusServiceRequest } from '../../../utils/directus'
import { getCatalogueBackedEnemyRows } from '../../../utils/catalogue-entity-bridge'

// Exported for direct Vitest coverage (same convention as
// server/api/worlds/[id]/maps/upload.post.ts's own MAX_MAP_UPLOAD_BYTES
// re-export) -- route handlers stay thin, but their own helper functions
// are directly unit-testable from here rather than only indirectly through
// the full handler.
export function extractImageUrl(blocks: any[] = []) {
  for (const block of blocks) {
    const image = block?.data?.image

    if (!image) continue

    if (typeof image === 'string') {
      return `/api/assets/${image}`
    }

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return null
}

// Species/Class Context Content pass (Enemy image restoration) -- ROOT
// CAUSE: catalogue-entity-bridge.ts's own CatalogueBridgeEnemyRow type
// hardcodes `image: null, imageUrl: null, image_url: null` on every
// catalogue-backed enemy row, unconditionally -- never computed from the
// row's own `blocks`, which (per preview5eToolsMonsters, see
// 5etools-monsters.ts) DO carry a real `overview` block's `data.image`
// whenever the source monster has fluff art. The enemy roster CARD already
// read this correctly via imageUrlForEnemy()'s own blocks-derived fallback
// (app/pages/worlds/[id]/enemies.vue); only this route's own catalogue
// rows -- the data every rail/card consumes -- never carried a populated
// `imageUrl` to read in the first place. Fixed here, once, at the data
// source, using the SAME `extractImageUrl` this route already applies to
// legacy rows below -- not a second, competing image-resolution helper.
//
// Enemies are NOT currently wired into the effective-content/authored-
// image-override system the generic entities.get.ts route already uses
// for Items/Species/Classes/etc. (getCatalogueBackedEnemyRows calls plain
// resolveWorldContent, never resolveEffectiveContent) -- there is no
// authored-override or explicit-suppression mechanism for an Enemy image
// to preserve here, because none exists yet for this entity type. This is
// an honest, reported gap (see the architecture doc this pass updates),
// not something this fix silently builds out: wiring a whole entity type
// into that system is a materially larger change than restoring the
// rail's already-existing image data.
export function withResolvedCatalogueEnemyImages<T extends { blocks: Array<Record<string, unknown>>; imageUrl: unknown; image_url: unknown }>(rows: T[]): T[] {
  return rows.map((row) => {
    const derivedImageUrl = extractImageUrl(row.blocks)
    return { ...row, imageUrl: derivedImageUrl, image_url: derivedImageUrl }
  })
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'worldId is required'
    })
  }

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: worldId } },
          { entity_type: { _eq: 'enemy' } }
        ]
      },
      sort: 'title',
      fields: 'id,title,slug,summary,entity_type,image'
    }
  })

  const entities = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []
  const entityIds = entities.map((row: any) => row.id).filter(Boolean)

  // Catalogue-backed rows (Content Pack Browsers Regression Repair) --
  // fetched regardless of whether any legacy/homebrew `entities` rows
  // exist, since a World whose enemies came entirely from an imported,
  // published Content Pack has none of those and would otherwise still
  // return zero results. See catalogue-entity-bridge.ts's own header for
  // the root-cause trace and why `getCatalogueBackedEnemyRows` is safe to
  // call unconditionally (it resolves to an empty list, never an error,
  // for a World with no bound packs or no `enemy` entries in them).
  const catalogueRows = withResolvedCatalogueEnemyImages(await getCatalogueBackedEnemyRows(worldId))

  if (!entityIds.length) {
    return catalogueRows
  }

  const statblocksRes = await directusServiceRequest('/items/entity_statblocks', {
    method: 'GET',
    query: {
      filter: {
        entity_id: { _in: entityIds }
      },
      limit: -1,
      fields: '*'
    }
  })

  const actionsRes = await directusServiceRequest('/items/entity_actions', {
    method: 'GET',
    query: {
      filter: {
        entity_id: { _in: entityIds }
      },
      sort: 'entity_id,action_type,sort_order',
      limit: -1,
      fields: '*'
    }
  })

  const monsterProfilesRes = await directusServiceRequest('/items/monster_profiles', {
    method: 'GET',
    query: {
      filter: {
        entity_id: { _in: entityIds }
      },
      limit: -1,
      fields: '*'
    }
  })

  const blocksRes = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter: {
        entity_id: { _in: entityIds }
      },
      sort: 'entity_id,sort',
      limit: -1,
      fields: '*'
    }
  })

  const statblocks = Array.isArray(statblocksRes?.data) ? statblocksRes.data : []
  const actions = Array.isArray(actionsRes?.data) ? actionsRes.data : []
  const monsterProfiles = Array.isArray(monsterProfilesRes?.data) ? monsterProfilesRes.data : []
  const blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []

  const statblockByEntityId = new Map<number, any>()
  const monsterProfileByEntityId = new Map<number, any>()
  const actionsByEntityId = new Map<number, any[]>()
  const blocksByEntityId = new Map<number, any[]>()

  for (const row of statblocks) {
    statblockByEntityId.set(Number(row.entity_id), row)
  }

  for (const row of monsterProfiles) {
    monsterProfileByEntityId.set(Number(row.entity_id), row)
  }

  for (const row of actions) {
    const entityId = Number(row.entity_id)
    if (!actionsByEntityId.has(entityId)) {
      actionsByEntityId.set(entityId, [])
    }
    actionsByEntityId.get(entityId)!.push(row)
  }

  for (const row of blocks) {
    const entityId = Number(row.entity_id)
    if (!blocksByEntityId.has(entityId)) {
      blocksByEntityId.set(entityId, [])
    }
    blocksByEntityId.get(entityId)!.push(row)
  }

  const legacyEnemyRows = entities.map((entity: any) => {
    const entityId = Number(entity.id)
    const statblock = statblockByEntityId.get(entityId) || null
    const monsterProfile = monsterProfileByEntityId.get(entityId) || null
    const entityActions = actionsByEntityId.get(entityId) || []
    const entityBlocks = blocksByEntityId.get(entityId) || []
    const derivedImageUrl = extractImageUrl(entityBlocks)

    return {
      id: entity.id,
      title: entity.title,
      slug: entity.slug,
      summary: entity.summary || '',
      entityType: entity.entity_type,
      image: entity.image || null,
      imageUrl: entity.image ? `/api/assets/${entity.image}` : derivedImageUrl,
      image_url: derivedImageUrl,
      blocks: entityBlocks,
      statblock,
      actions: entityActions,
      monsterProfile,
      __source: 'legacy' as const
    }
  })

  // Merged, not replaced -- a homebrew-authored enemy (legacy `entities`
  // row) and an imported-and-published-pack enemy (catalogue row) both
  // belong in this list. See catalogue-entity-bridge.ts's own header.
  return [...legacyEnemyRows, ...catalogueRows]
})
