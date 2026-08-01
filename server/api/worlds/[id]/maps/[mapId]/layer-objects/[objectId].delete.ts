import { deleteLayerObject } from '../../../../../../utils/scene-layer-objects'

export default defineEventHandler(async (event) => {
  const mapId = String(getRouterParam(event, 'mapId') || '')
  const objectId = String(getRouterParam(event, 'objectId') || '')

  if (!mapId || !objectId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing map id or object id' })
  }

  await deleteLayerObject(mapId, objectId)

  return { success: true }
})
