// GET /api/worlds/:id/encounters/:encounterId
// The Encounter View -- turn order, current combatant, next combatant, all
// already resolved against combatant titles.
//
// Thin by design: parse params -> call getEncounterView -> translate its
// result into an HTTP response. All resolution logic lives in and is tested
// against server/utils/encounter-view.ts.
//
// No requireCapability -- matching GET .../derived, GET .../assembly, and
// GET .../actions' own shared precedent: reading is not gated the way
// writing is.

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getEncounterView } from '../../../../utils/encounter-view'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const encounterId = String(getRouterParam(event, 'encounterId') || '')

  if (!worldId || !encounterId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or encounter id' })
  }

  const result = await getEncounterView(worldId, encounterId)

  if (!result.available) {
    throw createError({ statusCode: 404, statusMessage: 'Encounter not found in this world' })
  }

  return result
})
