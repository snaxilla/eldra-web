// GET /api/worlds/:id/members -- lists a World's members, with resolved
// display names, for the Game Admin "Members" panel. See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §8.5
// and this task's own SCOPE.
//
// Gated by `world.member.invite` -- this task's AUTHORIZATION section
// names only invite/assign_role/remove, no separate "list" capability, and
// FUNCTIONALITY frames listing alongside adding/changing/removing as one
// "World Owner / GM can..." set. Owner and GM hold all three named
// capabilities identically (server/utils/authorization.ts's
// WORLD_ROLE_CAPABILITIES), so using .invite here is equivalent in
// practice to using any of the three for who it admits.
//
// createError/defineEventHandler/getRouterParam are imported explicitly
// (the same reason server/middleware/authorize.ts does) so this route is
// directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireCapability } from '../../../../utils/authorization'
import { listMembersForWorld } from '../../../../utils/world-memberships'

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

  const members = await listMembersForWorld(worldId)
  return { members }
})
