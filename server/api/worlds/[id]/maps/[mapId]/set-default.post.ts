import { setDefault } from '../../../../../utils/directus-maps'

export default defineEventHandler(async (event) => {
  try {
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
  } catch (err: any) {
    console.error('SET DEFAULT MAP ERROR:', err)
    throw createError({
      statusCode: 500,
      statusMessage: err?.message || 'Could not set default world map'
    })
  }
})
