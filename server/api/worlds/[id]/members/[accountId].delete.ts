// DELETE /api/worlds/:id/members/:accountId -- removes a member.
// removeMember() refuses to remove the owner (see
// server/utils/world-memberships.ts's OWNER INVARIANT note).
//
// createError/defineEventHandler/getRouterParam are imported explicitly
// (the same reason server/middleware/authorize.ts does) so this route is
// directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCapability } from '../../../../utils/authorization'
import { removeMember } from '../../../../utils/world-memberships'

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
  requireCapability(principal, 'world.member.remove', { kind: 'world', worldId })

  await removeMember(worldId, accountId)
  return { removed: true }
})
