import { directusServiceRequest } from '../../../../../utils/directus'
import { requireCapability } from '../../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const enemyId = Number(getRouterParam(event, 'enemyId') || 0)

  if (!worldId || !enemyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or enemy id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.npc.manage', { kind: 'world', worldId: String(worldId) })

  const existing = await directusServiceRequest(`/items/entities/${enemyId}`, {
    method: 'GET',
    query: { fields: 'id,world_id,entity_type,title' }
  })

  const entity = existing?.data || null

  if (!entity || Number(entity.world_id) !== worldId || entity.entity_type !== 'enemy') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Enemy not found in this world'
    })
  }

  await directusServiceRequest(`/items/entities/${enemyId}`, {
    method: 'DELETE'
  })

  return {
    success: true,
    id: enemyId
  }
})
