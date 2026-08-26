// POST /api/worlds/:id/encounters/:encounterId/actions
// { type: 'join'|'leave'|'set-initiative'|'advance'|'previous'|'end'
//        |'apply-condition'|'remove-condition'|'tick-condition', ... }
//
// Encounter Management's operations, behind ONE route -- the same "one POST
// route, one action-type union, all orchestration in a server util" shape
// .../recovery.post.ts already established for character-recovery.ts,
// applied here to encounter-actions.ts. The three Character Conditions
// System actions (apply-condition/remove-condition/tick-condition) join the
// same six Encounter Management already declared -- one more union member
// each, not a second route.
//
// Thin by design: parse params -> validate the action shape -> call
// server/utils/encounter-actions.ts -> translate its result into an HTTP
// response. All mutation logic lives there and is tested against it
// directly.
//
// AUTHORIZATION: `world.character.edit_any`, matching .../encounters.post.ts's
// own note on why -- no dedicated Encounter/DM capability exists yet.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { applyEncounterAction, type EncounterAction } from '../../../../../utils/encounter-actions'

const ACTION_TYPES: readonly EncounterAction['type'][] = [
  'join', 'leave', 'set-initiative', 'advance', 'previous', 'end',
  'apply-condition', 'remove-condition', 'tick-condition'
]

function parseAction(body: unknown): EncounterAction | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null

  const input = body as Record<string, unknown>
  const type = input.type

  if (typeof type !== 'string' || !ACTION_TYPES.includes(type as EncounterAction['type'])) return null

  if (type === 'join') {
    const characterId = typeof input.characterId === 'string' ? input.characterId : ''
    if (!characterId) return null
    if (input.initiative === undefined) return { type, characterId }
    const initiative = Number(input.initiative)
    if (!Number.isFinite(initiative)) return null
    return { type, characterId, initiative }
  }

  if (type === 'leave') {
    const characterId = typeof input.characterId === 'string' ? input.characterId : ''
    return characterId ? { type, characterId } : null
  }

  if (type === 'set-initiative') {
    const characterId = typeof input.characterId === 'string' ? input.characterId : ''
    const initiative = Number(input.initiative)
    if (!characterId || !Number.isFinite(initiative)) return null
    return { type, characterId, initiative }
  }

  if (type === 'apply-condition') {
    const characterId = typeof input.characterId === 'string' ? input.characterId : ''
    const conditionId = typeof input.conditionId === 'string' ? input.conditionId : ''
    if (!characterId || !conditionId) return null

    const source = typeof input.source === 'string' ? input.source : undefined
    if (input.duration === undefined) return { type, characterId, conditionId, ...(source ? { source } : {}) }
    if (input.duration === null) return { type, characterId, conditionId, duration: null, ...(source ? { source } : {}) }
    const duration = Number(input.duration)
    if (!Number.isFinite(duration)) return null
    return { type, characterId, conditionId, duration, ...(source ? { source } : {}) }
  }

  if (type === 'remove-condition') {
    const characterId = typeof input.characterId === 'string' ? input.characterId : ''
    const conditionInstanceId = typeof input.conditionInstanceId === 'string' ? input.conditionInstanceId : ''
    return characterId && conditionInstanceId ? { type, characterId, conditionInstanceId } : null
  }

  if (type === 'tick-condition') {
    const characterId = typeof input.characterId === 'string' ? input.characterId : ''
    const conditionInstanceId = typeof input.conditionInstanceId === 'string' ? input.conditionInstanceId : ''
    const delta = Number(input.delta)
    if (!characterId || !conditionInstanceId || !Number.isFinite(delta)) return null
    return { type, characterId, conditionInstanceId, delta }
  }

  return { type } as EncounterAction
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const encounterId = String(getRouterParam(event, 'encounterId') || '')

  if (!worldId || !encounterId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or encounter id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.character.edit_any', { kind: 'world', worldId })

  const body = await readBody(event)
  const action = parseAction(body)

  if (!action) {
    throw createError({
      statusCode: 400,
      statusMessage: `Expected { type: one of ${ACTION_TYPES.join(', ')}, ... }`
    })
  }

  const result = await applyEncounterAction(worldId, encounterId, action)

  if (!result.ok) {
    const statusCode =
      result.reason === 'encounter-not-found' || result.reason === 'character-not-found' || result.reason === 'condition-not-found' ? 404
      : result.reason === 'invalid-initiative' || result.reason === 'invalid-condition' ? 400
      : 409
    throw createError({ statusCode, statusMessage: result.message })
  }

  return result
})
