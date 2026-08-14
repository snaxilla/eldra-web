// GET /api/accounts/search?q=... -- human-friendly account lookup, so
// Member selection (app/components/admin/members/AdminMembersPanel.vue)
// never asks anyone to type a Directus uuid. See this task's own
// OBJECTIVE: "The UI should operate on human identity. Not storage
// identity."
//
// Authorization: authenticated-only, per this task's own AUTHORIZATION
// section ("Only authenticated users may search... Do NOT redesign
// permissions"). Not gated by a specific capability -- searching accounts
// is not itself a world- or platform-scoped privileged action; there is no
// Scope to check a capability against here. The actual privileged
// operation (adding a member) is already gated by `world.member.invite` at
// POST /api/worlds/:id/members, unchanged by this task. The deny-by-default
// middleware (server/middleware/authorize.ts) already guarantees
// event.context.principal is set before this handler runs for any request
// that reached it; the explicit check below matches the same
// belt-and-suspenders pattern every other route in this codebase uses.
//
// createError/defineEventHandler/getQuery are imported explicitly (the
// same reason server/middleware/authorize.ts does) so this route is
// directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getQuery } from 'h3'
import { searchAccounts } from '../../utils/accounts'

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q : ''

  const accounts = await searchAccounts(q)
  return { accounts }
})
