import { directusServiceRequest } from '../../../utils/directus'

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

  if (!entityIds.length) {
    return []
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

  return entities.map((entity: any) => {
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
      monsterProfile
    }
  })
})
