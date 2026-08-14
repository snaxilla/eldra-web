// createError/defineEventHandler are imported explicitly (the same reason
// server/middleware/authorize.ts does) so this route is directly
// unit-testable under plain Vitest.
import { createError, defineEventHandler } from 'h3'
import { directusServiceRequest } from '../../utils/directus'
import { normalizeWorld, type WorldRecord } from '../../utils/worlds'
import { can } from '../../utils/authorization'

// Membership-aware (Beta Zero audit, Issue 1): a Principal must only ever
// see Worlds `can()` already says they may read. `can()` is the existing,
// single source of truth -- this route does not re-derive access from
// role/membership data itself, it just asks the same question every other
// enforcement site asks. The temporarySingleUserMode fallback inside can()
// (server/utils/authorization.ts) is what keeps this working for legacy
// Worlds with no world_memberships row at all; a World WITH a membership
// row is filtered by that row alone, for every principal, admin included.
export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const res = await directusServiceRequest('/items/worlds', {
    method: 'GET',
    query: {
      sort: 'name',
      limit: -1,
      fields: 'id,name,slug,system_key,description,visibility,owner_id'
    }
  })

  const worlds: WorldRecord[] = (Array.isArray(res?.data) ? res.data : []).map(normalizeWorld)

  return worlds.filter((world: WorldRecord) => can(principal, 'world.read', { kind: 'world', worldId: String(world.id) }))
})
