import { applyStartingPackageForEntity } from '../../../../../../utils/character-sheets'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityId = String(getRouterParam(event, 'entityId') || '')

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  return await applyStartingPackageForEntity(worldId, entityId)
})
