// POST /api/worlds/:id/rolls -- Phase 1 of
// .github/docs/architecture/eldra-roll-system.md §7/§14. Supports only
// `sourceType: 'custom'` in this phase (§4/§14's own scope note) --
// ability/saving_throw/skill/action_attack/spell_attack/spell_save/damage
// derivation is Phase 2/3 work and is rejected here with a clear 400,
// never silently accepted and misinterpreted.
//
// Thin by design, matching server/api/worlds/[id]/rules/roll.post.ts's own
// shape almost exactly: this file only parses/validates the request
// shape and translates a rejection into an HTTP status; all persistence
// and roll orchestration lives in and is tested against
// server/utils/roll-events.ts.
//
// createError/defineEventHandler/getRouterParam/readBody/setResponseStatus
// are imported explicitly (the same reason server/api/worlds/index.post.ts
// and server/middleware/authorize.ts already do) so this route is directly
// unit-testable under plain Vitest, which has no Nuxt/Nitro auto-import
// shims.
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requireCapability } from '../../../../utils/authorization'
import { createCustomRollEvent } from '../../../../utils/roll-events'
import type { RollVisibility } from '../../../../../app/lib/rolls/types'

// eldra-roll-system.md §7's own trust boundary, restated as a literal
// rejection list: a client that tries to hand over any of these has
// misunderstood (or is testing) the trust model -- the server always
// computes every one of them itself. Checked before anything else in the
// body is even read for its intended purpose, and rejects the WHOLE
// request rather than silently dropping the offending field, so a caller
// gets a clear signal rather than a response that quietly ignored part of
// what it sent.
const FORBIDDEN_CLIENT_FIELDS = ['total', 'dice', 'seed', 'results'] as const

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  // Identical enforcement to the already-shipped /rules/roll endpoint
  // (eldra-roll-system.md §5/§13) -- same capability, same scope shape.
  requireCapability(principal, 'world.roll.execute', { kind: 'world', worldId })

  const body: any = await readBody(event).catch(() => ({}))

  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, field)) {
      throw createError({
        statusCode: 400,
        statusMessage: `'${field}' may not be supplied by the client -- the server always computes it`
      })
    }
  }

  const sourceType = typeof body?.sourceType === 'string' ? body.sourceType : ''
  if (sourceType !== 'custom') {
    throw createError({
      statusCode: 400,
      statusMessage: `sourceType '${sourceType || '(missing)'}' is not supported yet -- Phase 1 only implements 'custom' (see .github/docs/architecture/eldra-roll-system.md §4/§14)`
    })
  }

  const expression = typeof body?.expression === 'string' ? body.expression.trim() : ''
  if (!expression) {
    throw createError({ statusCode: 400, statusMessage: 'expression is required for a custom roll' })
  }

  // Fail closed (§13): an omitted or malformed visibility defaults to the
  // more restrictive state, never the more open one.
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

  // A custom roll with no label reads perfectly well labeled by its own
  // formula -- eldra-roll-system.md §4's own display example ("2d6+3: 4,
  // 5 (+3) = 12") shows the expression carrying that role already.
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : expression

  const actorCharacterId =
    typeof body?.actorCharacterId === 'string' || typeof body?.actorCharacterId === 'number' ? body.actorCharacterId : null
  const encounterId =
    typeof body?.encounterId === 'string' || typeof body?.encounterId === 'number' ? body.encounterId : null
  const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}

  const roll = await createCustomRollEvent({
    worldId,
    // Never taken from the body -- the authenticated Principal is the only
    // acceptable source for who actually made this roll.
    rollerUserId: principal.accountId,
    actorCharacterId,
    encounterId,
    expression,
    label,
    visibility,
    metadata
  })

  setResponseStatus(event, 201)
  return roll
})
