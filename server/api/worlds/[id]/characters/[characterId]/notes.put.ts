// PUT /api/worlds/:id/characters/:characterId/notes
//
// A character's free-text notes -- the second V1 feature on the new
// Character Architecture, following the pattern .../inventory.put.ts
// established. A full replace of one resource, which is why PUT rather than
// POST, matching every other block-replacement route in this family:
// re-sending the same body twice leaves the character in the same state.
//
// It stores; it derives nothing. There is no field here the Rules Engine
// reads or writes.
//
// The body is normalized through the same `normalizeStoredCharacterNotes`
// the read path uses, so a client cannot write a record the reader would
// reject. Unlike ability scores or inventory, there is no bounds check that
// can actually fail here -- any string is a legal note -- so this route
// rejects only a malformed ENVELOPE (not an object at all), never a field's
// content.
//
// AUTHORIZATION: `world.character.edit_any`, exactly as every other route in
// this family requires, and for the reason recorded there -- entity
// ownership is not tracked yet, so `edit_own` cannot be checked against real
// ownership and the conservative capability is the honest one. No new
// capability is invented here.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { saveCharacterNotes } from '../../../../../utils/character-notes'
import { normalizeStoredCharacterNotes } from '../../../../../../app/lib/characters/character-notes'
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
  const stored = normalizeStoredCharacterNotes(body)

  if (!stored) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expected a notes record'
    })
  }

  await saveCharacterNotes(characterId, stored)

  return { stored }
})
