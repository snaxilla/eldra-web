import { updateLayerObject } from '../../../../../../utils/scene-layer-objects'

export default defineEventHandler(async (event) => {
  const mapId = String(getRouterParam(event, 'mapId') || '')
  const objectId = String(getRouterParam(event, 'objectId') || '')

  if (!mapId || !objectId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing map id or object id' })
  }

  const patch = await readBody(event).catch(() => ({}))

  const updated = await updateLayerObject(mapId, objectId, patch || {})

  return { object: updated }
})
