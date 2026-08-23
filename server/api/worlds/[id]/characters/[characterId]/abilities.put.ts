// PUT /api/worlds/:id/characters/:characterId/abilities
// Character Ability Scores -- Character Builder / Character Sheet Phase 3.
//
// A full replace of one resource, which is why PUT rather than POST --
// matching PUT /api/worlds/:id/entities/:entityId/blocks/:blockKey, the one
// other idempotent block-replacement route in this codebase. Re-sending the
// same body twice leaves the character in the same state.
//
// This is the route that makes a character created BEFORE Phase 3 (or one
// created without scores) assignable, which is what the Builder's own
// ability-editing surface (app/pages/worlds/[id]/characters/[characterId]/abilities.vue)
// posts to. It stores; it derives nothing.
//
// Thin by design: parse params -> validate -> call
// server/utils/character-ability-scores.ts -> return. All persistence logic
// lives there and is tested against it.
//
// AUTHORIZATION: `world.character.edit_any`, the same capability
// .../[characterId]/update.post.ts already requires for mutating an existing
// character. Its own note applies verbatim here: entity ownership is not
// tracked yet, so `world.character.edit_own` cannot be checked against real
// ownership, and requiring `edit_any` is the strictly conservative choice
// until it lands. This route deliberately does NOT invent a new capability.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { saveCharacterAbilityScores } from '../../../../../utils/character-ability-scores'
import { normalizeStoredAbilityScores } from '../../../../../../app/lib/characters/ability-scores'
import { dxFetch } from '../../../../../utils/entity-factory'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or character id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.character.edit_any', { kind: 'world', worldId })

  // Scope check before the write, and before trusting the id from the URL --
  // the same "a character must actually belong to this world" guard
  // update.post.ts and assembly.get.ts both make, for the same reason
  // (ownership-and-permissions.md §9.4: worldId arrives from the URL and is
  // not self-authorizing).
  const entityRes: any = await dxFetch(`/items/entities/${characterId}?fields=id,world_id`)
  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const body = await readBody(event)

  // Shape and bounds only -- see normalizeStoredAbilityScores' own note on
  // why a 'point-buy' record is not re-checked for point-buy legality here.
  const stored = normalizeStoredAbilityScores(body)

  if (!stored) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ability scores must be six whole numbers (str, dex, con, int, wis, cha), each between 1 and 30'
    })
  }

  const saved = await saveCharacterAbilityScores(characterId, stored)

  return { success: true, abilityScores: saved }
})
