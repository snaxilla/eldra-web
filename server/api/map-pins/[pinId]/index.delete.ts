import { deletePin } from '../../../utils/map-pins'
import { directusServiceRequest } from '../../../utils/directus'
import { requireCapability } from '../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const pinId = String(getRouterParam(event, 'pinId') || '')

  if (!pinId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing pinId' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const pinRes = await directusServiceRequest(`/items/map_pins/${pinId}`, {
    method: 'GET',
    query: { fields: 'id,map_id' }
  })
  const mapId = String(pinRes?.data?.map_id || '')
  if (!mapId) {
    throw createError({ statusCode: 404, statusMessage: 'Pin not found' })
  }
  const mapRes = await directusServiceRequest(`/items/maps/${mapId}`, {
    method: 'GET',
    query: { fields: 'id,world' }
  })
  const worldId = String(mapRes?.data?.world || '')
  if (!worldId) {
    throw createError({ statusCode: 404, statusMessage: 'Map not found' })
  }
  requireCapability(principal, 'world.map.edit', { kind: 'world', worldId })

  await deletePin(pinId)
  return { success: true }
})
