import { listEntityRelationships } from '../../../utils/entity-relationships'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event)

  return await listEntityRelationships(worldId, {
    entityId: query.entityId || query.entity_id,
    limit: query.limit
  })
})
