import { deleteEntityRelationship } from '../../../../utils/entity-relationships'
import { requireCapability } from '../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const worldId = String(params.id || '')

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId })

  return await deleteEntityRelationship(
    String(params.id || ''),
    String(params.relationshipId || '')
  )
})
