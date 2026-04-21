import { listPinsForMap } from '../../utils/map-pins'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const mapId = String(query.mapId || '')

  if (!mapId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing mapId query param' })
  }

  return await listPinsForMap(mapId)
})
