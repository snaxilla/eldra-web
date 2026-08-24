// GET /api/worlds/:id/characters/:characterId/derived
// The Character Rules Projection -- rules-package-architecture.md §11.3.
//
// Thin by design: parse the two route params, call getDerivedCharacter,
// translate its result into an HTTP response. Every decision -- assembling
// the character, bridging it into an ActorState, running the evaluator,
// grouping by category -- lives in and is tested against
// server/utils/character-derived.ts; this file makes no shaping decisions.
//
// STATUS MAPPING, and why only one of these is a 404:
//   character-not-found     -> 404. The character genuinely does not exist
//                              in this World (matches assembly.get.ts).
//   no-catalogue-selection  -> 200, available:false. A pre-V2 character.
//   rules-unconfigured      -> 200, available:false. The World has no Rules
//                              Package activated. Legal and common.
//   rules-broken            -> 200, available:false, and DISTINCT from
//                              unconfigured on purpose.
//
// The last three are 200s for the same reason GET /rules/summary already
// returns 200 for a configured-but-broken World: "there is genuinely
// nothing here yet" is an answer, not a transport failure, and a client
// that must branch on `available` anyway gains nothing from a 4xx.
//
// No requireCapability -- matching GET .../assembly, GET /catalogue, and
// GET /rules/summary's shared precedent: reading is not gated the way
// writing is.

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getDerivedCharacter } from '../../../../../utils/character-derived'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or character id' })
  }

  const result = await getDerivedCharacter(worldId, characterId)

  if (!result.available && result.reason === 'character-not-found') {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  return result
})
