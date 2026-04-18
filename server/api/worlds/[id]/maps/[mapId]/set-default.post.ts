import { setDefault } from '../../../../../utils/directus-maps'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const mapId = String(getRouterParam(event, 'mapId') || '')

  await setDefault(worldId, mapId)

  return { success: true }
})
