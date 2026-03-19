import { getEntitiesForWorld, getWorldBySlug } from '../../../app/lib/eldra'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const world = getWorldBySlug(slug)

  if (!world) {
    throw createError({
      statusCode: 404,
      statusMessage: 'World not found'
    })
  }

  return {
    world,
    entityCount: getEntitiesForWorld(world.id).length
  }
})
