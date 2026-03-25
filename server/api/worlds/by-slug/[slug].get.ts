import { directusServiceRequest } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''

  const worldResponse = await directusServiceRequest('/items/worlds', {
    method: 'GET',
    query: {
      filter: {
        slug: { _eq: slug }
      },
      limit: 1,
      fields: 'id,name,slug,system_key,description,visibility,owner_id'
    }
  })

  const world = worldResponse?.data?.[0]

  if (!world) {
    throw createError({
      statusCode: 404,
      statusMessage: 'World not found'
    })
  }

  const entityResponse = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: world.id }
      }
    }
  })

  const entityCount = Array.isArray(entityResponse?.data) ? entityResponse.data.length : 0

  return {
    world,
    entityCount
  }
})
