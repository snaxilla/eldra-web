import { directusServiceRequest } from '../../utils/directus'
import { normalizeWorld } from '../../utils/worlds'

export default defineEventHandler(async () => {
  const res = await directusServiceRequest('/items/worlds', {
    method: 'GET',
    query: {
      sort: 'name',
      limit: -1,
      fields: 'id,name,slug,system_key,description,visibility,owner_id'
    }
  })

  return (Array.isArray(res?.data) ? res.data : []).map(normalizeWorld)
})
