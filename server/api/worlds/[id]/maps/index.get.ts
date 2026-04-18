import { listMaps } from '../../../../../utils/directus-maps'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id'))
  return await listMaps(worldId)
})
