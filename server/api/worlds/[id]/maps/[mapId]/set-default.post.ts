import { setDefault } from '../../../../../../utils/directus-maps'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const mapId = String(getRouterParam(event, 'mapId') || '')

  if (!worldId || !mapId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or map id'
    })
  }

  await setDefault(worldId, mapId)

  return { success: true }
})
