// POST /api/worlds/:id/characters/:characterId/actions/consume
// D&D 2024 Character Rules Phase 2A.2 -- RESOURCE ACTION CONSUMPTION
// FOUNDATION. The one HTTP entry point proving
// server/utils/character-resource-actions.ts's authority end-to-end; see
// that module's own header for the full scope/authority/race-limitation
// reasoning. Thin by design, matching every sibling route in this family.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../../utils/authorization'
import { consumeActionResourceCosts, type ConsumeActionCostFailureReason } from '../../../../../../utils/character-resource-actions'
import { dxFetch } from '../../../../../../utils/entity-factory'

const STATUS_BY_REASON: Record<ConsumeActionCostFailureReason, number> = {
  'character-not-found': 404,
  'no-catalogue-selection': 409,
  'rules-unconfigured': 409,
  'rules-broken': 409,
  'unknown-action': 404,
  'unresolved-cost-resource': 409,
  'resource-not-acquired': 403,
  'insufficient-resource': 409
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

  const entityRes: any = await dxFetch(`/items/entities/${characterId}?fields=id,world_id`)
  const entity = entityRes?.data || null
  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const body = await readBody(event)
  const actionId = typeof body?.actionId === 'string' ? body.actionId.trim() : ''
  if (!actionId) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { actionId: string }' })
  }

  const result = await consumeActionResourceCosts(worldId, characterId, actionId)
  if (!result.ok) {
    throw createError({ statusCode: STATUS_BY_REASON[result.reason], statusMessage: result.message })
  }

  return { success: true, consumed: result.consumed }
})
