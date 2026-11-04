// PUT /api/worlds/:id/characters/:characterId/owner -- assign or reassign
// a Player Character's owner to a real, active Eldra Account.
//
// AUTHORIZATION: `platform.character.manage`, platform-scoped -- a
// Platform Admin may reassign regardless of the current owner or their
// own World role (this task's own AUTHORIZATION BOUNDARY section). See
// server/utils/authorization.ts's own comment on this capability for why
// it is not `world.character.edit_any`.
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { assignCharacterOwner } from '../../../../../utils/character-ownership'

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

  const body = await readBody(event).catch(() => ({}))
  const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''

  if (!accountId) {
    throw createError({ statusCode: 400, statusMessage: 'accountId is required' })
  }

  const result = await assignCharacterOwner(worldId, characterId, accountId, principal.accountId)

  return result
})
