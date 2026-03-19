import { directusServiceRequest } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const worldId = typeof query.worldId === 'string' ? query.worldId : ''

  const response = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: worldId
        ? {
            world: {
              _eq: worldId
            }
          }
        : undefined,
      fields: 'id,title,slug,world.id,world.name,world.slug,system_key,entity_type,status,visibility,summary,date_created,date_updated'
    }
  })

  const entities = (response?.data || []).map((entity: any) => ({
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
    updatedAt: entity.date_updated,
    world: entity.world
      ? {
          id: entity.world.id,
          name: entity.world.name,
          slug: entity.world.slug
        }
      : null
  }))

  return {
    entities
  }
})
