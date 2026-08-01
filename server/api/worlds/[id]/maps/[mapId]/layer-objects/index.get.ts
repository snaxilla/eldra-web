import { listLayerObjects } from '../../../../../../utils/scene-layer-objects'

export default defineEventHandler(async (event) => {
  const mapId = String(getRouterParam(event, 'mapId') || '')

  if (!mapId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing map id' })
  }

  const query = getQuery(event)
  const layerId = query.layerId ? String(query.layerId) : undefined

  const objects = await listLayerObjects(mapId, layerId)

  return { objects }
})
