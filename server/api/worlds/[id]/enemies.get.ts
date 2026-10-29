import { directusServiceRequest } from '../../../utils/directus'
import { getCatalogueBackedEnemyRows } from '../../../utils/catalogue-entity-bridge'

function extractImageUrl(blocks: any[] = []) {
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
  const catalogueRows = await getCatalogueBackedEnemyRows(worldId)

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
