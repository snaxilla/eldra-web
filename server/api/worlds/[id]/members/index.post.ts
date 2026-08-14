// POST /api/worlds/:id/members -- adds an EXISTING account to a World with
// a given role. No invitations, no email, no OAuth, no account creation
// (this task's own NON-GOALS): the caller supplies an `accountId` that
// already identifies a real, authenticated account, and this route only
// ever attaches a role to it -- it never creates or looks up an identity.
//
// `role` may not be 'owner' -- see server/utils/world-memberships.ts's
// OWNER INVARIANT note; addMember() enforces this too, but rejecting it
// here first avoids a round trip for the obviously-invalid case.
//
// createError/defineEventHandler/getRouterParam/readBody/setResponseStatus
// are imported explicitly (the same reason server/middleware/authorize.ts
// does) so this route is directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { requireCapability } from '../../../../utils/authorization'
import { addMember, type WorldMembershipRole } from '../../../../utils/world-memberships'

const ASSIGNABLE_ROLES: readonly WorldMembershipRole[] = ['gm', 'worldbuilder', 'player', 'observer']

export default defineEventHandler(async (event) => {
  const worldId = getRouterParam(event, 'id') || ''
  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.member.invite', { kind: 'world', worldId })

  const body = await readBody(event).catch(() => ({}))
  const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
  const role = typeof body?.role === 'string' ? body.role.trim() : ''

  if (!accountId) {
    throw createError({ statusCode: 400, statusMessage: 'accountId is required' })
  }

  if (!ASSIGNABLE_ROLES.includes(role as WorldMembershipRole)) {
    throw createError({ statusCode: 400, statusMessage: `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` })
  }

  const membership = await addMember(worldId, accountId, role as WorldMembershipRole)

  setResponseStatus(event, 201)
  return { membership }
})
