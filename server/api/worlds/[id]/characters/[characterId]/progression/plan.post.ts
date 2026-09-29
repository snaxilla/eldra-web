// POST /api/worlds/:id/characters/:characterId/progression/plan
// Character Progression Phase 1A -- previewProgression(...), this task's own
// FUTURE LEVEL-UP WIZARD CONTRACT requirement: this route (and its
// server/utils/character-progression-plan.ts implementation) is the SAME
// entry point a future player-facing Level Up Wizard will call, only gated
// by a different capability check later. Read-only: no write happens on
// this path, ever.
//
// AUTHORIZATION: `world.character.edit_any`, matching combat.post.ts/
// cast.post.ts's own precedent -- gated the same as every other
// character-mutating admin surface (Game Admin only for this phase; see
// this task's own explicit "do NOT expose Level Manager to players yet").
// Preview itself does not mutate anything, but is gated identically to
// confirm rather than splitting hairs over which sub-operation actually
// writes, mirroring cast.post.ts's own identical reasoning for its
// stateless independent-damage-roll request.
//
// REQUEST SHAPE: `{ targetLevel, answers? }`. `answers` (Character
// Progression Phase 1B) is a map of TENTATIVE choice selections -- see
// server/utils/character-progression-plan.ts's own CHOICE ANSWERS DURING
// PREVIEW header -- laid on top of this character's own real persisted
// choices for THIS preview only, never persisted anywhere by this route.
// Every other fact (current level, automatic consequences, required
// choices, whether a submitted answer is even legal) is entirely
// server-derived; the client cannot submit a plan.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../../utils/authorization'
import { planProgression, statusForProgressionFailure } from '../../../../../../utils/character-progression-plan'
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

  // Scope check before the read -- worldId arrives from the URL and is not
  // self-authorizing (ownership-and-permissions.md §9.4), matching
  // combat.post.ts/cast.post.ts's own identical check.
  const entityRes: any = await dxFetch(`/items/entities/${characterId}?fields=id,world_id`)
  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const body: any = await readBody(event).catch(() => ({}))
  const targetLevel = body?.targetLevel

  if (typeof targetLevel !== 'number' || !Number.isInteger(targetLevel)) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { targetLevel: number }' })
  }

  // Character Progression Phase 1B -- structurally validated only (a map of
  // string keys to string-array values); WHETHER a given key/selection is
  // legal is planProgression's own job (it is applied only alongside the
  // real declared choices this exact plan produces, never trusted as a
  // fact on its own). An absent/malformed `answers` degrades to `{}`,
  // reproducing Phase 1A's own exact no-choice behavior.
  const rawAnswers = body?.answers
  const answers: Record<string, string[]> = {}
  if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
    for (const [key, value] of Object.entries(rawAnswers)) {
      if (typeof key === 'string' && Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        answers[key] = value as string[]
      }
    }
  }

  const result = await planProgression(worldId, characterId, targetLevel, answers)

  if (!result.ok) {
    throw createError({ statusCode: statusForProgressionFailure(result.reason), statusMessage: result.message })
  }

  return { ok: true, plan: result.plan }
})
