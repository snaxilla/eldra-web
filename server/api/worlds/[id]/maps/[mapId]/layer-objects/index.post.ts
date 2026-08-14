import { createLayerObject } from '../../../../../../utils/scene-layer-objects'
import { requireCapability } from '../../../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const mapId = String(getRouterParam(event, 'mapId') || '')

  if (!mapId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing map id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.scene.edit', { kind: 'world', worldId })

  const body = await readBody(event).catch(() => ({}))
  const layerId = String(body?.layerId || '').trim()
  const object = body?.object

  if (!layerId) {
    throw createError({ statusCode: 400, statusMessage: 'layerId is required' })
  }

  if (!object?.objectId) {
    throw createError({ statusCode: 400, statusMessage: 'object.objectId is required' })
  }

  const created = await createLayerObject(mapId, layerId, object)

  return { object: created }
})
