// PUT /api/worlds/:id/characters/:characterId/choices
//
// The player's answers to the ChoiceSets their chosen content declares --
// proficiency choice resolution. A full replace of one resource, which is
// why PUT rather than POST, matching .../abilities.put.ts and the generic
// block-replacement route: re-sending the same body twice leaves the
// character in the same state.
//
// It stores; it derives nothing. What a selected skill MEANS is decided by
// the Rules Engine on the next read (server/utils/character-actor-bridge.ts
// -> the evaluator), never here.
//
// ---------------------------------------------------------------------------
// VALIDATED AGAINST THE FACETS, NOT AGAINST THE REQUEST
// ---------------------------------------------------------------------------
// A client could send any ids at all, so the body is never the authority on
// what is offered. This route re-assembles the character server-side, reads
// the choices its CURRENT Species/Class/Background facets declare, and
// accepts an answer only if it validly answers one of those questions --
// right count, no duplicates, every option actually offered. That is the
// same posture create-v2.post.ts established for catalogue choices ("never
// trusts what this page sends beyond those two fields").
//
// A body naming a choice the character's content does not declare is
// rejected rather than stored-and-ignored: silently accepting an answer to a
// question nobody asked would leave a player believing they had chosen
// something.
//
// AUTHORIZATION: `world.character.edit_any`, exactly as .../abilities.put.ts
// requires, and for the reason recorded there -- entity ownership is not
// tracked yet, so `edit_own` cannot be checked against real ownership and
// the conservative capability is the honest one. No new capability is
// invented here.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { assembleCharacter } from '../../../../../utils/character-assembly'
import { buildActorState } from '../../../../../utils/character-actor-bridge'
import { saveCharacterRulesChoices } from '../../../../../utils/character-rules-choices'
import {
  emptyStoredRulesChoices,
  validateChoiceSelection
} from '../../../../../../app/lib/characters/rules-choices'
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
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const body = await readBody(event)
  const rawSelections = body?.selections

  if (!rawSelections || typeof rawSelections !== 'object' || Array.isArray(rawSelections)) {
    throw createError({ statusCode: 400, statusMessage: 'Expected a `selections` object' })
  }

  // The questions this character is actually being asked, read from its own
  // current content rather than from the request.
  const assembly = await assembleCharacter(worldId, characterId)
  if (!assembly.available) {
    throw createError({
      statusCode: 409,
      statusMessage: assembly.reason === 'character-not-found'
        ? 'Character not found in this world'
        : 'This character has no catalogue selection to derive choices from'
    })
  }

  // No package identity is needed to READ the declared questions -- they
  // come from content facets, not from the Rules Package -- so this call
  // deliberately passes placeholders rather than loading the World runtime.
  // Nothing from the returned ActorState is stored.
  const declared = buildActorState({
    blueprint: assembly.blueprint,
    packageId: '',
    packageVersion: '',
    stateSchemaVersion: 0
  }).declaredChoices

  const stored = emptyStoredRulesChoices()

  for (const [key, value] of Object.entries(rawSelections as Record<string, unknown>)) {
    const choice = declared.find((candidate) => candidate.key === key)

    if (!choice) {
      throw createError({
        statusCode: 400,
        statusMessage: `This character's content declares no choice "${key}"`
      })
    }

    const validation = validateChoiceSelection(choice, value)

    if (!validation.ok) {
      throw createError({
        statusCode: 400,
        statusMessage: `${key}: ${validation.reason}`
      })
    }

    stored.selections[key] = validation.selected
  }

  await saveCharacterRulesChoices(characterId, stored)

  return { stored }
})
