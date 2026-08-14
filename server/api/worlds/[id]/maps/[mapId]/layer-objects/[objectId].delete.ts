import { deleteLayerObject } from '../../../../../../utils/scene-layer-objects'
import { requireCapability } from '../../../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const mapId = String(getRouterParam(event, 'mapId') || '')
  const objectId = String(getRouterParam(event, 'objectId') || '')

  if (!mapId || !objectId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing map id or object id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.scene.edit', { kind: 'world', worldId })

  await deleteLayerObject(mapId, objectId)

  return { success: true }
})
