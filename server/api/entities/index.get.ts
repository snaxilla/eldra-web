import { directusServiceRequest } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const worldId = typeof query.worldId === 'string' ? query.worldId : ''

  const response = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: worldId
        ? { world_id: { _eq: worldId } }
        : undefined,
      fields: 'id,title,slug,world_id,system_key,entity_type,status,visibility,summary,created_at,updated_at'
    }
  })

  const entities = (response?.data || []).map((entity: any) => ({
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
  }))

  return {
    entities
  }
})
