// GET /api/worlds/:id/rolls -- Phase 1 of
// .github/docs/architecture/eldra-roll-system.md §7/§14.
//
// Thin by design: query parsing and capability resolution only; every
// filtering/pagination/visibility decision lives in and is tested against
// server/utils/roll-events.ts. Visibility is enforced INSIDE that module,
// server-side, before any row is ever returned (§5) -- this route's own
// job is limited to resolving whether the requester holds
// world.roll.see_gm at all and handing that boolean down, never deciding
// per-row visibility itself.
//
// createError/defineEventHandler/getQuery/getRouterParam are imported
// explicitly (the same reason server/api/worlds/index.post.ts and
// server/middleware/authorize.ts already do) so this route is directly
// unit-testable under plain Vitest, which has no Nuxt/Nitro auto-import
// shims.
import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { can, requireCapability } from '../../../../utils/authorization'
import { listRollEvents, MAX_ROLL_EVENTS_LIMIT } from '../../../../utils/roll-events'

function firstString(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw : ''
}

function parseLimit(value: unknown): number | undefined {
  const raw = firstString(value)
  if (!raw) return undefined

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined

  return Math.min(Math.floor(parsed), MAX_ROLL_EVENTS_LIMIT)
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  // Reading roll history requires only that the requester can read this
  // World at all -- world.roll.execute (the capability to REQUEST a roll)
  // is a different, narrower question, checked only by the POST route.
  requireCapability(principal, 'world.read', { kind: 'world', worldId })

  const query = getQuery(event)
  const encounterId = firstString(query.encounterId) || null
  const actorCharacterId = firstString(query.actorCharacterId) || null
  const cursor = firstString(query.cursor) || null
  const limit = parseLimit(query.limit)

  // world.roll.see_gm (§5) -- resolved once, here, via the same `can()`
  // every other capability check in this app already uses; the actual
  // per-row filtering this unlocks happens inside listRollEvents, never
  // here.
  const canSeeGm = can(principal, 'world.roll.see_gm', { kind: 'world', worldId })

  return await listRollEvents({
    worldId,
    requesterAccountId: principal.accountId,
    canSeeGm,
    encounterId,
    actorCharacterId,
    limit,
    cursor
  })
})
