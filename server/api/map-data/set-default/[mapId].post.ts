import { setDefaultWorldMapByMapId } from '../../../utils/map-data'

export default defineEventHandler(async (event) => {
  const mapId = String(getRouterParam(event, 'mapId') || '')

  if (!mapId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing map id'
    })
  }

  await setDefaultWorldMapByMapId(mapId)
  return { success: true }
})
