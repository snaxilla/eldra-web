// POST /api/worlds/:id/characters/:characterId/combat
// Combat Resolution -- one attacker (`:characterId`), one action, one
// target. A POST, not a PUT: this page sends INTENT ({ actionId,
// targetCharacterId }); server/utils/character-combat.ts decides the
// outcome (reading Attack Bonus/Armor Class/Spell Save DC/save bonuses, the
// Rules Engine output each resolution needs) and returns it, matching the
// exact "PUT replaces a whole resource, POST performs an operation" split
// .../recovery.post.ts and .../rules/roll.post.ts already use.
//
// Thin by design: parse params -> validate the body shape -> call
// server/utils/character-combat.ts -> translate its result into an HTTP
// response. All resolution logic lives there and is tested against it
// directly.
//
// AUTHORIZATION: `world.character.edit_any`, exactly as every other write
// route in this family requires, and for the reason recorded there --
// entity ownership is not tracked yet, so `edit_own` cannot be checked
// against real ownership and the conservative capability is the honest
// one. One check covers this request even though it mutates a DIFFERENT
// character (the target) than the one named in the URL (the attacker) --
// the permission model is World-scoped, not per-character, so no second
// check is meaningful to add. No new capability is invented here.
//
// Only the ATTACKER's scope (the URL's `:characterId`) is pre-checked here,
// matching every sibling route's own "check the URL's own subject first"
// shape -- the TARGET's world membership is verified inside
// resolveCombatAction itself (its own getDerivedCharacter call reports
// 'target-not-found' when the target does not belong to this World),
// exactly the same as how .../recovery.post.ts trusts assembleCharacter's
// own re-check rather than duplicating it.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { resolveCombatAction } from '../../../../../utils/character-combat'
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
    throw createError({ statusCode: 404, statusMessage: 'Attacking character not found in this world' })
  }

  const body = await readBody(event)
  const actionId = typeof body?.actionId === 'string' ? body.actionId.trim() : ''
  const targetCharacterId = typeof body?.targetCharacterId === 'string' ? body.targetCharacterId.trim() : ''

  if (!actionId || !targetCharacterId) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { actionId, targetCharacterId }' })
  }

  const result = await resolveCombatAction(worldId, characterId, targetCharacterId, actionId)

  if (!result.ok) {
    const statusCode =
      result.reason === 'attacker-not-found' || result.reason === 'target-not-found' ? 404
      : result.reason === 'action-not-found' ? 400
      : 409
    throw createError({ statusCode, statusMessage: result.message })
  }

  return result
})
