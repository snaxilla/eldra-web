// GET /api/worlds/:id/characters/:characterId/progression
// Character Progression Phase 1A -- reads this character's current
// progression state (which class levels it has, and the resulting total
// character level) for the Game Admin Level Manager's own "CURRENT" display.
//
// Read-only, no capability check -- matching GET .../derived, GET .../actions,
// and GET .../assembly's own shared precedent: reading a character's
// existing state is not gated the way requesting/confirming a level
// transition is (progression/plan.post.ts, progression/confirm.post.ts,
// both `world.character.edit_any`). The Level Manager panel itself is
// hidden client-side for anyone without that capability (matching every
// other admin-only Sheet control's own "client hint, server is the real
// gate" posture) -- but simply reading a character's OWN level is exactly
// as harmless as reading its derived stats already is.

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { resolveCurrentProgression, statusForProgressionFailure } from '../../../../../utils/character-progression-plan'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or character id' })
  }

  const result = await resolveCurrentProgression(worldId, characterId)

  if (!result.ok) {
    throw createError({ statusCode: statusForProgressionFailure(result.reason), statusMessage: result.message })
  }

  return { ok: true, ...result.state }
})
