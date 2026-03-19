import { directusRequest } from '../../utils/directus'

export default defineEventHandler(async () => {
  const response = await directusRequest('/items/worlds', {
    method: 'GET',
    query: {
      fields: 'id,name,slug,system_key,description,visibility,owner'
    }
  })

  return {
    worlds: response?.data || []
  }
})
