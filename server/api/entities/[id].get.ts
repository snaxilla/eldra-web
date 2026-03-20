import { directusServiceRequest } from '../../utils/directus'

function enrichBlockDataWithImageUrl(data: any) {
  if (!data || typeof data !== 'object') {
    return data
  }

  const out = { ...data }

  if (out.image && typeof out.image === 'string') {
    out.image_url = `/api/assets/${out.image}`
  }

  return out
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''

  const entityRes = await directusServiceRequest(`/items/entities/${id}`, {
    method: 'GET',
    query: {
      fields: 'id,title,slug,world_id,system_key,entity_type,status,visibility,summary,created_at,updated_at'
    }
  })

  const entity = entityRes?.data

  if (!entity) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found'
    })
  }

  const worldRes = await directusServiceRequest('/items/worlds', {
    method: 'GET',
    query: {
      filter: {
        id: { _eq: entity.world_id }
      },
      limit: 1,
      fields: 'id,name,slug'
    }
  })

  const world = worldRes?.data?.[0] || null

  const blocksRes = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter: {
        entity_id: { _eq: id }
      },
      sort: ['sort'],
      fields: 'id,block_key,label,sort,repeatable,data'
    }
  })

  const blocks = (blocksRes?.data || []).map((block: any) => ({
    id: block.id,
    blockKey: block.block_key,
    label: block.label,
    sort: block.sort,
    repeatable: block.repeatable,
    data: enrichBlockDataWithImageUrl(block.data)
  }))

  return {
    entity: {
      id: entity.id,
      worldId: entity.world_id,
      systemKey: entity.system_key,
      entityType: entity.entity_type,
      title: entity.title,
      slug: entity.slug,
      status: entity.status,
      visibility: entity.visibility,
      summary: entity.summary,
      createdAt: entity.created_at || null,
      updatedAt: entity.updated_at || null
    },
    world,
    blocks
  }
})
