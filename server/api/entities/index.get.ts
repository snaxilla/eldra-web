import { getEntities, getWorldById } from '../../../app/lib/eldra'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const worldId = typeof query.worldId === 'string' ? query.worldId : ''

  const entities = getEntities()
    .filter((entity) => !worldId || entity.worldId === worldId)
    .map((entity) => ({
      ...entity,
      world: getWorldById(entity.worldId)
    }))

  return {
    entities
  }
})
