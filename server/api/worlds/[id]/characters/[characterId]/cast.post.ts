// POST /api/worlds/:id/characters/:characterId/cast
// Character Sheet Body Phase 1B.2 -- Authoritative Cast Foundation.
//
// A gameplay COMMAND, not a roll helper: the client says "cast this
// prepared spell" (or "roll this spell's independent damage"); this route
// re-derives everything -- which spell, its attack bonus, its canonical
// damage, its resource cost, whether a slot is available -- from
// server/utils/character-cast.ts, and never trusts a client-supplied
// mechanics fact. See that module's own header for the full ordering,
// atomicity, and capability-classification reasoning this route relies on.
//
// WHY A NEW ROUTE, NOT AN EXTENSION OF /rolls OR /combat:
// - `/rolls` (rolls/index.post.ts) is explicitly scoped to "the server
//   always computes it, no side effects beyond the roll itself" -- its own
//   header names spell resolution as intentionally out of its scope. A
//   leveled Cast mutates the character's persisted `spellcasting` block
//   (expended slots), a real side effect beyond the roll, which would make
//   reusing that route's own stated contract dishonest.
// - `/combat` (combat.post.ts) is TARGETED (attacker + target, AC/hit/miss,
//   HP mutation) -- every archetype this phase supports is explicitly
//   UNTARGETED (see character-cast.ts's own header), so combat.post.ts's
//   own request/response shape does not fit either.
// - `/combat`'s AUTHORIZATION choice is the one thing this route DOES copy
//   exactly: `world.character.edit_any`, because Cast can mutate this
//   character's own persisted state (spellcasting slots) exactly like
//   Combat and Recovery can mutate HP/hit dice -- the same "no per-entity
//   ownership tracked yet, so the conservative capability is the honest
//   one" reasoning applies unchanged. Used uniformly for all three request
//   kinds below (including the stateless independent-damage roll) rather
//   than splitting hairs over which one actually mutates something, for
//   the same reason `/combat` uses one capability for its whole surface.
//
// REQUEST SHAPE -- deliberately minimal (this task's own CAST REQUEST
// SHAPE requirement): `{ actionId, intent?, castLevel?, choices?,
// visibility? }`. `intent` selects which of the character's own
// request-shaped BUTTONS was pressed ('cast', the default -- the primary
// Cast/Attack control; or 'damage' -- the independent Damage control on an
// attack-roll spell like Fire Bolt) -- this is caller INTENT ("which
// control did the player press"), exactly like `combat.post.ts`'s own
// `actionId` is intent, never a mechanics fact. `castLevel` (Character
// Sheet Body Phase 1B.2.1) is the RESOURCE decision -- which slot level to
// consume -- and `choices` is the spell's own structured decisions (today:
// Chromatic Orb's damage type); both are independently re-verified against
// this character's own authoritative state by
// server/utils/character-cast.ts, never trusted as the mechanics they
// select. No spell name, level, attack bonus, damage dice, slot cost, or
// save DC is ever accepted -- FORBIDDEN_CAST_FIELDS below rejects the whole
// request if a caller tries, matching rolls/index.post.ts's own "reject the
// whole request, never silently drop a field" precedent.
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import {
  castSpell,
  rollIndependentSpellDamage,
  statusForCastFailure,
  type CastSpellResult
} from '../../../../../utils/character-cast'
import { dxFetch } from '../../../../../utils/entity-factory'
import type { RollVisibility } from '../../../../../../app/lib/rolls/types'

// This task's own CAST REQUEST SHAPE requirement, restated as a literal
// rejection list -- every number/fact this route (and character-cast.ts
// underneath it) always re-derives itself, never accepts from a caller.
const FORBIDDEN_CAST_FIELDS = [
  'attackBonus', 'spellLevel', 'level', 'damage', 'damageType', 'damageRoll',
  'modifier', 'modifiers', 'bonus', 'dice', 'expression', 'slotCost', 'saveDc',
  'total', 'results', 'seed', 'sourceKey'
] as const

export default defineEventHandler(async (event): Promise<CastSpellResult> => {
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
  // self-authorizing (ownership-and-permissions.md §9.4), matching
  // combat.post.ts/recovery.post.ts's own identical check.
  const entityRes: any = await dxFetch(`/items/entities/${characterId}?fields=id,world_id`)
  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const body: any = await readBody(event).catch(() => ({}))

  for (const field of FORBIDDEN_CAST_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, field)) {
      throw createError({
        statusCode: 400,
        statusMessage: `'${field}' may not be supplied by the client -- the server always re-derives it`
      })
    }
  }

  const actionId = typeof body?.actionId === 'string' ? body.actionId.trim() : ''
  if (!actionId) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { actionId }' })
  }

  const intent = body?.intent === 'damage' ? 'damage' : 'cast'

  // Character Sheet Body Phase 1B.2.1 (Cast Configuration) additions.
  // `castLevel` -- structural parsing only (a positive integer 1-9,
  // matching spellcasting.ts's own `isValidSlotLevel` range); absent stays
  // absent (character-cast.ts's own `resolveRequestedCastLevel` defaults it
  // to the spell's base level). `choices` -- a plain string-to-string map;
  // WHICH choices a spell declares, whether an id/option is legal, is
  // entirely character-cast.ts's own job (CHOICE AUTHORITY) -- this route
  // only rejects a structurally-wrong shape before it gets there.
  let castLevel: number | undefined
  if (body?.castLevel !== undefined) {
    const parsed = body.castLevel
    if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 1 || parsed > 9) {
      throw createError({ statusCode: 400, statusMessage: 'castLevel must be an integer from 1 to 9' })
    }
    castLevel = parsed
  }

  let choices: Record<string, string> | undefined
  if (body?.choices !== undefined) {
    if (!body.choices || typeof body.choices !== 'object' || Array.isArray(body.choices)) {
      throw createError({ statusCode: 400, statusMessage: 'choices must be an object of { choiceId: optionId }' })
    }
    const entries = Object.entries(body.choices as Record<string, unknown>)
    if (entries.some(([key, value]) => typeof key !== 'string' || typeof value !== 'string')) {
      throw createError({ statusCode: 400, statusMessage: 'choices must map string choice ids to string option ids' })
    }
    choices = Object.fromEntries(entries as [string, string][])
  }

  // Fail closed, matching rolls/index.post.ts's own identical default.
  let visibility: RollVisibility = 'private'
  if (body?.visibility !== undefined) {
    if (body.visibility !== 'private' && body.visibility !== 'table') {
      throw createError({
        statusCode: 400,
        statusMessage: `visibility '${body.visibility}' is not recognized -- expected 'private' or 'table'`
      })
    }
    visibility = body.visibility
  }

  const rollerUserId = principal.accountId

  const input = { worldId, characterId, rollerUserId, actionId, visibility, castLevel, choices }
  const result = intent === 'damage'
    ? await rollIndependentSpellDamage(input)
    : await castSpell(input)

  if (!result.ok) {
    throw createError({ statusCode: statusForCastFailure(result.reason), statusMessage: result.message })
  }

  return result
})
