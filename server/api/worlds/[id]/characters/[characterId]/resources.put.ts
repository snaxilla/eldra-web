// PUT /api/worlds/:id/characters/:characterId/resources
// D&D 2024 Character Rules Phase 2A.2 -- MANUAL EXPEND / RESTORE, the one
// write endpoint for the Generic Character Resource system.
//
// Deliberately NOT a full-replace PUT (unlike .../spellcasting.put.ts,
// which accepts a client-computed whole record) -- this phase's own
// explicit MAXIMUM AUTHORITY requirement ("the client must never submit
// maxUses as authority... client buttons are not authority") is stricter
// than that precedent, so this route follows server/utils/character-cast.ts's
// own `expendSpellSlotAuthoritatively` shape instead: the client names WHICH
// resource and WHICH direction (expend/restore); the server independently
// re-derives the authoritative maximum (getDerivedCharacter, never trusted
// from the request) and performs the read-modify-write itself.
//
// Thin by design: parse params -> validate -> call
// server/utils/character-resources.ts -> return. All persistence/authority
// logic lives there (and in character-derived.ts, for `max`) and is tested
// against those modules.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { getDerivedCharacter } from '../../../../../utils/character-derived'
import {
  expendResourceAuthoritatively,
  restoreResourceAuthoritatively
} from '../../../../../utils/character-resources'
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

  // Scope check before the write -- mirrors every sibling route in this
  // family (worldId arrives from the URL, not self-authorizing).
  const entityRes: any = await dxFetch(`/items/entities/${characterId}?fields=id,world_id`)
  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const body = await readBody(event)
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId.trim() : ''
  const action = body?.action === 'expend' || body?.action === 'restore' ? body.action : null

  if (!resourceId || !action) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expected { resourceId: string, action: "expend" | "restore" }'
    })
  }

  // VARIABLE-AMOUNT SPEND (large-pool follow-up, Lay on Hands) -- `amount`
  // is STRUCTURALLY validated here (a positive integer) only; it is never
  // trusted as AUTHORITY. `expendResourceAuthoritatively`/
  // `restoreResourceAuthoritatively` below independently clamp the result
  // against the real max/zero regardless of what this is -- a client
  // sending 99999 can never over-expend or over-restore. Absent/invalid
  // defaults to 1, preserving every existing orb-click caller unchanged.
  const rawAmount = Math.trunc(Number(body?.amount))
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 1

  // MAXIMUM AUTHORITY -- resolved fresh here, never accepted from the
  // request body. A resourceId naming a resource this character has not
  // ACQUIRED (RESOURCE ACQUISITION requirement) or that no longer resolves
  // (UNRESOLVED RESOURCE IDS requirement) is rejected identically -- both
  // simply mean "not in `derived.resources`," with no way for this route to
  // distinguish "never acquired" from "repinned away" from here, which is
  // the correct, honest answer in both cases.
  const derivedResult = await getDerivedCharacter(worldId, characterId)
  if (!derivedResult.available) {
    if (derivedResult.reason === 'character-not-found') {
      throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
    }
    throw createError({ statusCode: 409, statusMessage: derivedResult.message })
  }

  const resource = derivedResult.derived.resources.find((candidate) => candidate.id === resourceId)
  if (!resource) {
    throw createError({
      statusCode: 404,
      statusMessage: `This character has no acquired resource '${resourceId}'`
    })
  }

  const saved = action === 'expend'
    ? await expendResourceAuthoritatively(characterId, resourceId, resource.max, amount)
    : await restoreResourceAuthoritatively(characterId, resourceId, amount)

  // Re-derive once more so the response reflects the ACTUAL post-write
  // remaining/expended, never the client's own optimistic guess -- cheap
  // (the registry/runtime are already warm from the call above) and
  // matches this codebase's existing "server decides, client reflects"
  // posture for every other authoritative mutation.
  const nextExpended = saved.expended[resourceId] ?? 0

  return {
    success: true,
    resource: {
      id: resourceId,
      max: resource.max,
      expended: nextExpended,
      remaining: resource.max - nextExpended
    }
  }
})
