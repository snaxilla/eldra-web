// POST /api/worlds -- creates a World. This is now the canonical way
// Worlds are created; see
// .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §2.5 (no such route existed before this), §5.3, and §12 Phase 0.
//
// Authorization is platform-scoped (there is no worldId to scope against
// until the World exists), gated by the new `platform.world.create`
// capability -- see server/utils/authorization.ts for why that capability
// was added rather than reused from an existing one. The deny-by-default
// middleware (server/middleware/authorize.ts) has already guaranteed
// event.context.principal is set (or the request never reached this
// handler); requireCapability below is what checks THIS route's specific
// capability, not merely "is authenticated."
//
// createError/defineEventHandler/readBody/setResponseStatus are imported
// explicitly (the same reason server/middleware/authorize.ts does) so this
// route is directly unit-testable under plain Vitest, which has no
// Nuxt/Nitro auto-import shims.
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { requireCapability } from '../../utils/authorization'
import { createWorld } from '../../utils/worlds'

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null

  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  requireCapability(principal, 'platform.world.create', { kind: 'platform' })

  const body = await readBody(event).catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'World name is required' })
  }

  const world = await createWorld({
    name,
    description: typeof body?.description === 'string' ? body.description : null,
    systemKey:
      typeof body?.systemKey === 'string' ? body.systemKey : typeof body?.system_key === 'string' ? body.system_key : null,
    visibility: typeof body?.visibility === 'string' ? body.visibility : null,
    ownerAccountId: principal.accountId
  })

  setResponseStatus(event, 201)
  return { world }
})
