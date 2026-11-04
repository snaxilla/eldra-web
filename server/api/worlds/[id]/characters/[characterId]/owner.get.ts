// GET /api/worlds/:id/characters/:characterId/owner -- current ownership
// plus history, for the Player Management drawer.
//
// AUTHORIZATION: `platform.character.manage`. Gated the same as
// assign/unassign (owner.put.ts/owner.delete.ts), not opened more widely --
// this is new functionality with no existing consumer that needs broader
// access; see server/utils/authorization.ts's own comment on the
// capability for why it is platform-scoped rather than world-scoped.
//
// DISPLAY NAMES ARE RESOLVED HERE, NOT IN server/utils/character-ownership.ts.
// That module is pure ownership domain data (an id is an id); "what name
// does a human read for this id" is a presentation concern this route
// layers on top, the same split server/utils/world-memberships.ts's own
// listMembersForWorld already draws between membership rows and their
// resolved displayName.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { getCharacterOwnership, listOwnershipHistory } from '../../../../../utils/character-ownership'
import { resolveAccountDisplayNames } from '../../../../../utils/eldra-accounts'

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

  const [ownership, history] = await Promise.all([
    getCharacterOwnership(worldId, characterId),
    listOwnershipHistory(worldId, characterId)
  ])

  const idsToResolve = new Set<string>()
  if (ownership.ownerAccountId) idsToResolve.add(ownership.ownerAccountId)
  for (const change of history) {
    if (change.previousOwnerAccountId) idsToResolve.add(change.previousOwnerAccountId)
    if (change.newOwnerAccountId) idsToResolve.add(change.newOwnerAccountId)
    if (change.actorAccountId) idsToResolve.add(change.actorAccountId)
  }

  const names = await resolveAccountDisplayNames([...idsToResolve])

  return {
    ownership: {
      ...ownership,
      ownerDisplayName: ownership.ownerAccountId ? names.get(ownership.ownerAccountId) || null : null
    },
    history: history.map((change) => ({
      ...change,
      previousOwnerDisplayName: change.previousOwnerAccountId ? names.get(change.previousOwnerAccountId) || null : null,
      newOwnerDisplayName: change.newOwnerAccountId ? names.get(change.newOwnerAccountId) || null : null,
      actorDisplayName: names.get(change.actorAccountId) || null
    }))
  }
})
