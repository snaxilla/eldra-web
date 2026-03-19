import { getBlocksForEntity, getEntityById, getWorldById } from '../../../app/lib/eldra'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const entity = getEntityById(id)

  if (!entity) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found'
    })
  }

  return {
    entity,
    world: getWorldById(entity.worldId),
    blocks: getBlocksForEntity(entity.id)
  }
})
