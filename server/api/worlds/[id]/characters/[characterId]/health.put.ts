// PUT /api/worlds/:id/characters/:characterId/health
//
// Current HP, Temporary HP, Hit Dice spent, and Death Save marks -- the
// Health System's stored half. A full replace of one resource, which is
// why PUT rather than POST, matching every other block-replacement route in
// this family: re-sending the same body twice leaves the character in the
// same state.
//
// It stores; it derives nothing. Maximum HP is never accepted here -- there
// is no field for it, because `value:hit_points.max` is derived by the
// Rules Engine (Hit Die size + Constitution modifier + level), never stored
// player data.
//
// Thin by design: parse params -> validate -> call
// server/utils/character-health.ts -> return. All persistence logic lives
// there and is tested against it.
//
// AUTHORIZATION: `world.character.edit_any`, exactly as every other route in
// this family requires, and for the reason recorded there -- entity
// ownership is not tracked yet, so `edit_own` cannot be checked against real
// ownership and the conservative capability is the honest one. No new
// capability is invented here.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { saveCharacterHealth } from '../../../../../utils/character-health'
import { normalizeStoredCharacterHealth } from '../../../../../../app/lib/characters/health'
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

  // Scope check before the write -- worldId arrives from the URL and is not
  // self-authorizing (ownership-and-permissions.md §9.4).
  const entityRes: any = await dxFetch(`/items/entities/${characterId}?fields=id,world_id`)
  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const body = await readBody(event)
  const stored = normalizeStoredCharacterHealth(body)

  if (!stored) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expected a health record with currentHp, temporaryHp, hitDiceSpent, and deathSaves'
    })
  }

  const saved = await saveCharacterHealth(characterId, stored)

  return { success: true, health: saved }
})
