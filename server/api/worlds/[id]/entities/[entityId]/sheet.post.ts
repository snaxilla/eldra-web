import { safeEnsureCharacterSheetForEntity } from '../../../../../utils/character-sheet-safe'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityId = String(getRouterParam(event, 'entityId') || '')

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  return await safeEnsureCharacterSheetForEntity(worldId, entityId)
})
