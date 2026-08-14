// PATCH /api/worlds/:id/members/:accountId -- changes an existing member's
// role. `role` may not be 'owner' in either direction -- see
// server/utils/world-memberships.ts's OWNER INVARIANT note;
// updateMemberRole() enforces the full rule (including refusing to touch
// the owner's own row), this route only rejects the obviously-invalid
// target role first.
//
// createError/defineEventHandler/getRouterParam/readBody are imported
// explicitly (the same reason server/middleware/authorize.ts does) so this
// route is directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../utils/authorization'
import { updateMemberRole, type WorldMembershipRole } from '../../../../utils/world-memberships'

const ASSIGNABLE_ROLES: readonly WorldMembershipRole[] = ['gm', 'worldbuilder', 'player', 'observer']

export default defineEventHandler(async (event) => {
  const worldId = getRouterParam(event, 'id') || ''
  const accountId = getRouterParam(event, 'accountId') || ''
  if (!worldId || !accountId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id or account id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.member.assign_role', { kind: 'world', worldId })

  const body = await readBody(event).catch(() => ({}))
  const role = typeof body?.role === 'string' ? body.role.trim() : ''

  if (!ASSIGNABLE_ROLES.includes(role as WorldMembershipRole)) {
    throw createError({ statusCode: 400, statusMessage: `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` })
  }

  const membership = await updateMemberRole(worldId, accountId, role as WorldMembershipRole)
  return { membership }
})
