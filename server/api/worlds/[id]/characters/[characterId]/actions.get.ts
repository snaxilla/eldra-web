// GET /api/worlds/:id/characters/:characterId/actions
// The Character Actions System -- "what can my character do?"
//
// Thin by design: parse the two route params, call getCharacterActions,
// translate its result into an HTTP response. Every decision -- which
// content grants an action, which is equipped/prepared, which Attack
// Bonus/Save DC applies -- lives in and is tested against
// server/utils/character-actions.ts; this file makes no shaping decisions.
//
// STATUS MAPPING mirrors GET .../derived exactly:
//   character-not-found     -> 404.
//   no-catalogue-selection  -> 200, available:false. A pre-V2 character.
//
// Unlike .../derived, there is no `rules-unconfigured`/`rules-broken`
// branch here: an Actions list is still useful with no Rules Package
// activated (every name, range, and damage expression comes from content,
// not the Rules Engine) -- character-actions.ts's own header explains why
// a missing Rules runtime degrades individual rows' numbers rather than
// failing the whole request.
//
// No requireCapability -- matching GET .../derived, GET .../assembly, and
// GET /catalogue's shared precedent: reading is not gated the way writing
// is.

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getCharacterActions } from '../../../../../utils/character-actions'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or character id' })
  }

  const result = await getCharacterActions(worldId, characterId)

  if (!result.available && result.reason === 'character-not-found') {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  return result
})
