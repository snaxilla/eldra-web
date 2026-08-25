// PUT /api/worlds/:id/characters/:characterId/spellcasting
//
// Known/prepared spells and expended slot counts -- the Spellcasting
// System's stored half. A full replace of one resource, which is why PUT
// rather than POST, matching .../inventory.put.ts and .../health.put.ts:
// re-sending the same body twice leaves the character in the same state.
//
// It stores; it derives nothing. Spellcasting Ability, Spell Save DC, Spell
// Attack Bonus, and Spell Slot progression are never accepted here -- there
// is no field for any of them, because all four are Rules Engine output
// (packages/eldra-dnd5e-2024/definitions.json's `spellcasting` category).
//
// Thin by design: parse params -> validate -> call
// server/utils/character-spellcasting.ts -> return. All persistence logic
// lives there and is tested against it.
//
// Spell references are deliberately NOT verified against the catalogue here
// -- mirrors .../inventory.put.ts's own reasoning exactly: an unresolvable
// reference is already a first-class, displayed state (`status: 'missing'`),
// and rejecting the write would make the sheet unsavable whenever a pack is
// mid-repin.
//
// AUTHORIZATION: `world.character.edit_any`, exactly as every other route in
// this family requires, and for the reason recorded there -- entity
// ownership is not tracked yet, so `edit_own` cannot be checked against real
// ownership and the conservative capability is the honest one. No new
// capability is invented here.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { saveCharacterSpellcasting } from '../../../../../utils/character-spellcasting'
import { normalizeStoredSpellcasting } from '../../../../../../app/lib/characters/spellcasting'
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
  const stored = normalizeStoredSpellcasting(body)

  if (!stored) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expected a spellcasting record with a `spells` array'
    })
  }

  const saved = await saveCharacterSpellcasting(characterId, stored)

  return { success: true, spellcasting: saved }
})
