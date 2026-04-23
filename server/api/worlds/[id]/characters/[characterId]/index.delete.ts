import { dxFetch } from '../../../../../utils/entity-factory'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or character id'
    })
  }

  const existingJson = await dxFetch(`/items/entities/${characterId}?fields=id,world_id,title`)
  const existing = existingJson?.data || null

  if (!existing || String(existing.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Character not found in this world'
    })
  }

  await dxFetch(`/items/entities/${characterId}`, {
    method: 'DELETE'
  })

  return {
    success: true,
    id: characterId
  }
})
