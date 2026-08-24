// PUT /api/worlds/:id/characters/:characterId/inventory
//
// What a character carries -- the first V1 feature on the new Character
// Architecture. A full replace of one resource, which is why PUT rather than
// POST, matching .../abilities.put.ts and .../choices.put.ts: re-sending the
// same body twice leaves the character in the same state.
//
// It stores; it derives nothing. No weight, no carrying capacity, no armour
// class, no attunement limit -- every one of those is Rules Engine output
// and every one is this migration's explicit non-goal.
//
// ---------------------------------------------------------------------------
// NORMALIZED, NOT TRUSTED
// ---------------------------------------------------------------------------
// The body goes through the same `normalizeStoredInventory` the read path
// uses, so a client cannot write a record the reader would reject -- the
// failure mode that leaves a player with an inventory that saves and then
// reads back empty.
//
// Item references are deliberately NOT verified against the catalogue here.
// An unresolvable reference is already a first-class, displayed state
// (`status: 'missing'`), because a GM can unbind a Content Pack at any time
// and a character must survive it. Rejecting the write would make the sheet
// unsavable whenever a pack is mid-repin, which is worse than storing a
// reference that currently shows as unavailable.
//
// AUTHORIZATION: `world.character.edit_any`, exactly as .../abilities.put.ts
// and .../choices.put.ts require, and for the reason recorded there -- entity
// ownership is not tracked yet, so `edit_own` cannot be checked against real
// ownership and the conservative capability is the honest one. No new
// capability is invented here.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { saveCharacterInventory } from '../../../../../utils/character-inventory'
import { normalizeStoredInventory } from '../../../../../../app/lib/characters/inventory'
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
  const stored = normalizeStoredInventory(body)

  if (!stored) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expected an inventory record with an `items` array'
    })
  }

  await saveCharacterInventory(characterId, stored)

  return { stored }
})
