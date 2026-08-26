// POST /api/worlds/:id/encounters  { title }
// Creates a new Encounter -- its own `entities` row
// (`entity_type: 'encounter'`) plus an initial empty `encounter_state`
// block. See server/utils/encounter-persistence.ts's own header for why
// this needs no new Directus collection.
//
// Thin by design: parse params -> validate -> call
// server/utils/encounter-persistence.ts -> return. All persistence logic
// lives there.
//
// AUTHORIZATION: `world.character.edit_any` -- the same capability every
// other World-scoped write in this codebase reaches for when no more
// specific one exists (entity ownership is not tracked yet, per every other
// route in this family's own note). No new capability invented for
// Encounters specifically; a dedicated `world.encounter.manage` capability
// would be the eventual right shape once DM-vs-player distinctions exist,
// but that is a permissions-model change this task has no mandate for.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../utils/authorization'
import { createEncounter } from '../../../utils/encounter-actions'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.character.edit_any', { kind: 'world', worldId })

  const body = await readBody(event)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'title is required' })
  }

  const encounter = await createEncounter(worldId, title)

  return { success: true, encounter }
})
