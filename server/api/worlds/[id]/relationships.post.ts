import { createEntityRelationship, listEntityRelationships } from '../../../utils/entity-relationships'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event)
  const relationship = await createEntityRelationship(worldId, body || {})

  return {
    relationship,
    relationships: await listEntityRelationships(worldId, {
      entityId: body?.sourceEntityId || body?.source_entity_id
    })
  }
})
