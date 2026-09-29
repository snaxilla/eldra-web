// POST /api/worlds/:id/characters/:characterId/progression/confirm
// Character Progression Phase 1A -- confirmProgression(...), this task's own
// FUTURE LEVEL-UP WIZARD CONTRACT requirement (see plan.post.ts's own header
// for the full "same domain, future player gate" reasoning).
//
// AUTHORIZATION: `world.character.edit_any` -- this route DOES mutate
// (persists the character's new class level via
// server/utils/character-progression.ts), matching combat.post.ts/
// cast.post.ts's own capability choice exactly.
//
// REQUEST SHAPE: `{ targetLevel, fingerprint }`. `fingerprint` is the
// STALE-PLAN PROTECTION this task's own "do not blindly trust a
// client-generated plan" requirement demands -- the exact string
// `progression/plan`'s own response returned as `plan.fingerprint`, itself
// nothing more than the character's current level at preview time. This
// route re-reads that level fresh and rejects if it no longer matches (see
// character-progression-plan.ts's own `confirmProgression` for the full
// re-validation sequence) -- the client's own plan is never treated as
// authority, only as the caller's stated intent of "this is the plan I
// previewed."
//
// No client-supplied automatic consequence, required choice, or derived
// number is ever accepted here -- only `targetLevel` (intent: which level
// to advance to) and `fingerprint` (intent: which starting state this was
// planned against). Everything else is re-derived.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../../utils/authorization'
import { confirmProgression, statusForProgressionFailure } from '../../../../../../utils/character-progression-plan'
import { dxFetch } from '../../../../../../utils/entity-factory'

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
  // self-authorizing (ownership-and-permissions.md §9.4), matching
  // combat.post.ts/cast.post.ts's own identical check.
  const entityRes: any = await dxFetch(`/items/entities/${characterId}?fields=id,world_id`)
  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const body: any = await readBody(event).catch(() => ({}))
  const targetLevel = body?.targetLevel
  const fingerprint = body?.fingerprint

  if (typeof targetLevel !== 'number' || !Number.isInteger(targetLevel)) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { targetLevel: number, fingerprint: string }' })
  }
  if (typeof fingerprint !== 'string' || !fingerprint) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { targetLevel: number, fingerprint: string }' })
  }

  const result = await confirmProgression(worldId, characterId, targetLevel, fingerprint)

  if (!result.ok) {
    throw createError({ statusCode: statusForProgressionFailure(result.reason), statusMessage: result.message })
  }

  return { ok: true, progression: result.progression, currentLevel: result.currentLevel }
})
