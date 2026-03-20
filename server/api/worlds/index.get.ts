import { directusServiceRequest } from '../../utils/directus'

export default defineEventHandler(async () => {
  const response = await directusServiceRequest('/items/worlds', {
    method: 'GET',
    query: {
      fields: 'id,name,slug,system_key,description,visibility,owner_id'
    }
  })

  return {
    worlds: response?.data || []
  }
})
