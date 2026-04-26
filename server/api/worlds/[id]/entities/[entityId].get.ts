import { directusServiceRequest } from '../../../../../utils/directus'

function extractImageUrl(entity: any, blocks: any[] = []) {
  if (entity?.image) {
    if (typeof entity.image === 'string') return `/api/assets/${entity.image}`
    if (typeof entity.image === 'object') {
      if (entity.image.image_url) return entity.image.image_url
      if (entity.image.file_id) return `/api/assets/${entity.image.file_id}`
      if (entity.image.id) return `/api/assets/${entity.image.id}`
    }
  }

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
  const entityId = Number(getRouterParam(event, 'entityId') || 0)

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  const entityRes = await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'GET',
    query: {
      fields: '*'
    }
  })

  const entity = entityRes?.data || null

  if (!entity || Number(entity.world_id) !== worldId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found in this world'
    })
  }

  const [blocksRes, statblockRes, actionsRes, monsterProfileRes] = await Promise.all([
    directusServiceRequest('/items/block_instances', {
      method: 'GET',
      query: {
        filter: {
          entity_id: { _eq: entityId }
        },
        sort: 'sort',
        limit: -1,
        fields: '*'
      }
    }),
    directusServiceRequest('/items/entity_statblocks', {
      method: 'GET',
      query: {
        filter: {
          entity_id: { _eq: entityId }
        },
        limit: 1,
        fields: '*'
      }
    }),
    directusServiceRequest('/items/entity_actions', {
      method: 'GET',
      query: {
        filter: {
          entity_id: { _eq: entityId }
        },
        sort: 'action_type,sort_order',
        limit: -1,
        fields: '*'
      }
    }),
    directusServiceRequest('/items/monster_profiles', {
      method: 'GET',
      query: {
        filter: {
          entity_id: { _eq: entityId }
        },
        limit: 1,
        fields: '*'
      }
    })
  ])

  const blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
  const statblock = Array.isArray(statblockRes?.data) ? (statblockRes.data[0] || null) : null
  const actions = Array.isArray(actionsRes?.data) ? actionsRes.data : []
  const monsterProfile = Array.isArray(monsterProfileRes?.data) ? (monsterProfileRes.data[0] || null) : null

  return {
    ...entity,
    blocks,
    statblock,
    actions,
    monsterProfile,
    imageUrl: extractImageUrl(entity, blocks)
  }
})
