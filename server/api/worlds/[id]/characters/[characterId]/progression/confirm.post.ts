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
// REQUEST SHAPE: `{ targetLevel, fingerprint, answers? }`. `fingerprint` is
// the STALE-PLAN PROTECTION this task's own "do not blindly trust a
// client-generated plan" requirement demands -- the exact string
// `progression/plan`'s own response returned as `plan.fingerprint` (as of
// Character Progression Phase 1B: the character's current level AND the
// active Rules Package's own integrity hash at preview time, not level
// alone). This route re-reads both fresh and rejects if either no longer
// matches (see character-progression-plan.ts's own `confirmProgression` for
// the full re-validation sequence) -- the client's own plan is never
// treated as authority, only as the caller's stated intent of "this is the
// plan I previewed."
//
// `answers` (Character Progression Phase 1B) -- this transition's own
// FINAL choice selections, the same map a caller would have sent as
// `progression/plan`'s own `answers` for its last preview, resubmitted here
// to become authoritative. Re-validated entirely fresh against a plan this
// route re-builds from scratch (never the client's own remembered
// resolution); an answer naming a choice this plan does not actually
// require is silently ignored, never persisted (see
// character-progression-plan.ts's own `confirmProgression`).
//
// No client-supplied automatic consequence or derived number is ever
// accepted here -- only `targetLevel` (intent: which level to advance to),
// `fingerprint` (intent: which starting state this was planned against),
// and `answers` (intent: how to resolve this transition's own required
// choices). Everything else is re-derived.

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

  // Character Progression Phase 1B -- structurally validated only, the
  // identical shape/degradation rule plan.post.ts's own `answers` parsing
  // already follows (see that route's own header for why this is safe:
  // WHICH answers are legal is entirely confirmProgression's own job).
  const rawAnswers = body?.answers
  const answers: Record<string, string[]> = {}
  if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
    for (const [key, value] of Object.entries(rawAnswers)) {
      if (typeof key === 'string' && Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        answers[key] = value as string[]
      }
    }
  }

  const result = await confirmProgression(worldId, characterId, targetLevel, fingerprint, answers)

  if (!result.ok) {
    throw createError({ statusCode: statusForProgressionFailure(result.reason), statusMessage: result.message })
  }

  return { ok: true, progression: result.progression, currentLevel: result.currentLevel }
})
