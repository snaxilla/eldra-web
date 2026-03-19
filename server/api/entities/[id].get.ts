import { directusServiceRequest } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''

  const entityRes = await directusServiceRequest(`/items/entities/${id}`, {
    method: 'GET',
    query: {
      fields: 'id,title,slug,world.id,world.name,world.slug,system_key,entity_type,status,visibility,summary,date_created,date_updated'
    }
  })

  const entity = entityRes?.data

  if (!entity) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found'
    })
  }

  const blocksRes = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter: {
        entity: {
          _eq: id
        }
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
    data: block.data
  }))

  return {
    entity: {
      id: entity.id,
      worldId: entity.world?.id || entity.world,
      systemKey: entity.system_key,
      entityType: entity.entity_type,
      title: entity.title,
      slug: entity.slug,
      status: entity.status,
      visibility: entity.visibility,
      summary: entity.summary,
      createdAt: entity.date_created,
      updatedAt: entity.date_updated
    },
    world: entity.world
      ? {
          id: entity.world.id,
          name: entity.world.name,
          slug: entity.world.slug
        }
      : null,
    blocks
  }
})
