// GET /api/worlds/:id/characters/:characterId/deletion-impact -- what a
// delete of this character would actually do, computed from the SAME
// plan server/utils/character-deletion.ts's delete path executes (never a
// second, hand-written description of it that could drift).
//
// AUTHORIZATION: the same dual check as the delete action itself
// (owner.put.ts's sibling, index.delete.ts) -- anyone who can delete
// should be able to preview what deleting would do. See
// index.delete.ts's own header for why both `world.character.edit_any`/
// `world.npc.manage` (the existing GM/Owner path, unchanged) and
// `platform.character.manage` (the new Platform Admin override) are
// accepted.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { can } from '../../../../../utils/authorization'
import { planCharacterDeletion } from '../../../../../utils/character-deletion'

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

  const authorized =
    can(principal, 'platform.character.manage', { kind: 'platform' }) ||
    can(principal, 'world.character.edit_any', { kind: 'world', worldId }) ||
    can(principal, 'world.npc.manage', { kind: 'world', worldId })

  if (!authorized) {
    throw createError({ statusCode: 403, statusMessage: "Missing capability to preview this character's deletion" })
  }

  const plan = await planCharacterDeletion(worldId, characterId)

  return { plan }
})
