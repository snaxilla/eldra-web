import { updateCharacterSheetForEntity } from '../../../../../utils/character-sheets'
import { requireCapability } from '../../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityId = String(getRouterParam(event, 'entityId') || '')
  const body = await readBody(event)

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  // No entity ownership tracking exists yet -- temporarily conservative
  // (world.character.edit_any, not edit_own) per the Beta Zero audit.
  requireCapability(principal, 'world.character.edit_any', { kind: 'world', worldId })

  return await updateCharacterSheetForEntity(worldId, entityId, body)
})
