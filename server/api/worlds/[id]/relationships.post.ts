import { createEntityRelationship, listEntityRelationships } from '../../../utils/entity-relationships'
import { requireCapability } from '../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event)

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId })

  const relationship = await createEntityRelationship(worldId, body || {})

  return {
    relationship,
    relationships: await listEntityRelationships(worldId, {
      entityId: body?.sourceEntityId || body?.source_entity_id
    })
  }
})
