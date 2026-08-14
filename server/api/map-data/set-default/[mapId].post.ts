import { setDefaultWorldMapByMapId } from '../../../utils/map-data'
import { directusServiceRequest } from '../../../utils/directus'
import { requireCapability } from '../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const mapId = String(getRouterParam(event, 'mapId') || '')

  if (!mapId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing map id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
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

  await setDefaultWorldMapByMapId(mapId)
  return { success: true }
})
