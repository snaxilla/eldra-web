import { dxFetch } from '../../../../../utils/entity-factory'
import { requireCapability } from '../../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or character id'
    })
  }

  const existingJson = await dxFetch(`/items/entities/${characterId}?fields=id,world_id,title,entity_type`)
  const existing = existingJson?.data || null

  if (!existing || String(existing.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Character not found in this world'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  const existingType = String(existing.entity_type || '')
  requireCapability(
    principal,
    existingType === 'npc' || existingType === 'npc_sheet' ? 'world.npc.manage' : 'world.character.edit_any',
    { kind: 'world', worldId }
  )

  await dxFetch(`/items/entities/${characterId}`, {
    method: 'DELETE'
  })

  return {
    success: true,
    id: characterId
  }
})
