import { updateEntityRelationship } from '../../../../utils/entity-relationships'
import { requireCapability } from '../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const body = await readBody(event)
  const worldId = String(params.id || '')

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId })

  return {
    relationship: await updateEntityRelationship(
      String(params.id || ''),
      String(params.relationshipId || ''),
      body || {}
    )
  }
})
