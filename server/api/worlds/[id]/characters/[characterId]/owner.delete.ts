// DELETE /api/worlds/:id/characters/:characterId/owner -- unassigns a
// Player Character's owner, leaving it Unassigned.
//
// AUTHORIZATION: `platform.character.manage`, same as owner.get.ts/owner.put.ts.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { unassignCharacterOwner } from '../../../../../utils/character-ownership'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id or character id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.character.manage', { kind: 'platform' })

  const result = await unassignCharacterOwner(worldId, characterId, principal.accountId)

  return result
})
