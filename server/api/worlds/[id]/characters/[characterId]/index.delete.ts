// DELETE /api/worlds/:id/characters/:characterId
//
// THIS ROUTE USED TO DELETE ONLY THE `entities` ROW. Nothing else --
// not the character_sheet, not inventory, not block_instances. It is
// called live today from the standalone Characters page
// (app/pages/worlds/[id]/characters/index.vue's deleteCharacter), so
// fixing the route in place is what "repoints" that page: its existing
// $fetch(..., { method: 'DELETE' }) call needs no change at all to pick
// up the safe cascade below.
//
// See server/utils/character-deletion.ts for the full dependency trace
// (every collection this purge deletes, and why) and
// server/api/worlds/[id]/characters/[characterId]/deletion-impact.get.ts
// for the preview endpoint the Player Management drawer calls before
// this one.
//
// AUTHORIZATION, now TWO alternative capabilities rather than one:
//   - `world.character.edit_any` / `world.npc.manage` (by entity type) --
//     the EXACT pre-existing check, unchanged. An ordinary World GM/Owner
//     keeps deleting exactly what they could before this task.
//   - `platform.character.manage` -- the new Platform Admin override
//     (this task's own AUTHORIZATION BOUNDARY section: "Platform Admins
//     must be able to... delete PCs in the current World regardless of
//     current owner or ordinary World role"). Checked at PLATFORM scope,
//     so it does not require any membership row in this World at all.
// Either is sufficient; neither is required in addition to the other.
// This does not broaden who holds `edit_any`/`npc.manage` -- it adds a
// second, independent path, exactly as the brief requires.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { can, requireCapability } from '../../../../../utils/authorization'
import { executeCharacterDeletion, planCharacterDeletion } from '../../../../../utils/character-deletion'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or character id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  // The entity's type decides which of the two WORLD capabilities would
  // apply, exactly as the pre-existing check did -- computed from the
  // same plan the deletion itself runs on, so there is no second,
  // separately-fetched read of the entity row to drift from it.
  const plan = await planCharacterDeletion(worldId, characterId)
  const isNpcType = plan.entityType === 'npc' || plan.entityType === 'npc_sheet'

  const authorized =
    can(principal, 'platform.character.manage', { kind: 'platform' }) ||
    (isNpcType
      ? can(principal, 'world.npc.manage', { kind: 'world', worldId })
      : can(principal, 'world.character.edit_any', { kind: 'world', worldId }))

  if (!authorized) {
    requireCapability(
      principal,
      isNpcType ? 'world.npc.manage' : 'world.character.edit_any',
      { kind: 'world', worldId }
    ) // always throws here -- reuses requireCapability purely for its exact, existing 403 message shape
  }

  // Executes the SAME plan authorization was just decided from -- no
  // second dependency scan.
  const result = await executeCharacterDeletion(plan)

  return {
    success: true,
    id: characterId,
    impact: result.plan
  }
})
