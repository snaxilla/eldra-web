// POST /api/worlds/:id/characters/:characterId/recovery
//
// The Recovery System's one endpoint -- Apply Damage, Apply Healing, Spend
// Hit Die, Short Rest, Long Rest, Reset Death Saves. A POST rather than a
// PUT, matching this codebase's own "PUT replaces a whole resource, POST
// performs an operation" split -- the same shape
// POST /api/worlds/:id/rules/roll and POST /api/worlds/:id/rules/activate
// already use. `PUT .../health` still exists for direct correction (typing
// a new absolute number); this route is for the six named ACTIONS, each of
// which applies a RULE (temp-then-current, capped at Maximum HP, ...) that
// a raw PUT cannot express without the player doing that math themselves.
//
// Thin by design: parse params -> validate the action shape -> call
// server/utils/character-recovery.ts -> translate its result into an HTTP
// response. All persistence and mutation logic lives there and is tested
// against it directly.
//
// AUTHORIZATION: `world.character.edit_any`, exactly as every other write
// route in this family requires, and for the reason recorded there --
// entity ownership is not tracked yet, so `edit_own` cannot be checked
// against real ownership and the conservative capability is the honest
// one. No new capability is invented here.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { applyRecoveryAction, type RecoveryAction } from '../../../../../utils/character-recovery'
import { dxFetch } from '../../../../../utils/entity-factory'

const ACTION_TYPES: readonly RecoveryAction['type'][] = [
  'damage', 'heal', 'spend-hit-die', 'short-rest', 'long-rest', 'reset-death-saves'
]

function parseAction(body: unknown): RecoveryAction | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null

  const input = body as Record<string, unknown>
  const type = input.type

  if (typeof type !== 'string' || !ACTION_TYPES.includes(type as RecoveryAction['type'])) return null

  if (type === 'damage' || type === 'heal') {
    const amount = typeof input.amount === 'number' ? input.amount : Number(input.amount)
    if (!Number.isFinite(amount)) return null
    return { type, amount }
  }

  return { type } as RecoveryAction
}

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
  const action = parseAction(body)

  if (!action) {
    throw createError({
      statusCode: 400,
      statusMessage: `Expected { type: one of ${ACTION_TYPES.join(', ')}, amount?: number }`
    })
  }

  const result = await applyRecoveryAction(worldId, characterId, action)

  if (!result.ok) {
    const statusCode =
      result.reason === 'character-not-found' ? 404
      : result.reason === 'invalid-amount' ? 400
      : 409
    throw createError({ statusCode, statusMessage: result.message })
  }

  return { success: true, health: result.health }
})
