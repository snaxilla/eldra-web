// GET /api/worlds/:id/rules/choice-options
//
// The prompt-and-label half of a ChoiceSet, for surfaces that must render a
// choice before a character exists (the Character Builder). Thin by design:
// parse the param, call the util, return it -- all logic and every decision
// about what is safe to expose lives in
// server/utils/world-rules-choice-options.ts.

import { getWorldRulesChoiceOptions } from '../../../../utils/world-rules-choice-options'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  return getWorldRulesChoiceOptions(worldId)
})
