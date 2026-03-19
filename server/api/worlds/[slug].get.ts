import { directusRequest } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''

  const worldResponse = await directusRequest('/items/worlds', {
    method: 'GET',
    query: {
      filter: {
        slug: {
          _eq: slug
        }
      },
      limit: 1,
      fields: 'id,name,slug,system_key,description,visibility,owner'
    }
  })

  const world = worldResponse?.data?.[0]

  if (!world) {
    throw createError({
      statusCode: 404,
      statusMessage: 'World not found'
    })
  }

  const entityResponse = await directusRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        world: {
          _eq: world.id
        }
      },
      aggregate: {
        count: ['id']
      }
    }
  })

  const entityCount = Number(entityResponse?.data?.[0]?.count?.id || 0)

  return {
    world,
    entityCount
  }
})
