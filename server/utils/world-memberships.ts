// World Membership persistence -- .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §8.5/§10.1/§12 Phase 2. This is the real replacement for
// the temporary `worlds.owner_id` model server/utils/worlds.ts introduced
// in Phase 0: an Account's role in a World is now a row here, not a column
// on `worlds`.
//
// Schema: scripts/directus/create-world-memberships-schema.mjs (collection
// `world_memberships`), registered in bootstrap.mjs. Running
// `node scripts/directus/bootstrap.mjs` against the target Directus
// instance remains the manual post-deploy step CLAUDE.md's Deployment
// Checklist describes -- this module does not run it.
//
// `worlds.owner_id` is INTENTIONALLY left in place and still written by
// server/utils/worlds.ts (per this task's own instruction: "retain
// owner_id only if required for compatibility... migration comes later").
// Nothing here reads or writes it; the two coexist until a future,
// explicitly-scoped migration backfills membership rows for the worlds
// that predate this collection and owner_id can finally be retired.

// createError is imported explicitly (rather than relied on as a Nitro
// auto-import) for the same reason server/utils/authorization.ts does --
// this module is meant to be unit-tested directly under plain Vitest.
import { createError } from 'h3'
import { directusServiceRequest } from './directus'

// The five roles ownership-and-permissions.md §8.5/§8.7 defines. Kept as a
// plain union (not a Directus enum) matching this project's existing
// convention for similar string-typed classification columns
// (entities.visibility) -- validated in application code, not the schema.
export type WorldMembershipRole = 'owner' | 'gm' | 'worldbuilder' | 'player' | 'observer'

export type WorldMembershipRecord = {
  id: string
  worldId: string
  accountId: string
  role: WorldMembershipRole
  createdAt: string | null
}

const MEMBERSHIP_FIELDS = 'id,world_id,account_id,role,created_at'

function normalizeMembership(row: any): WorldMembershipRecord {
  return {
    id: String(row?.id ?? ''),
    worldId: String(row?.world_id ?? ''),
    accountId: String(row?.account_id ?? ''),
    role: row?.role,
    createdAt: row?.created_at ?? null
  }
}

// Application-level invariant (schema note in
// create-world-memberships-schema.mjs explains why this cannot be a
// database constraint under Directus's Fields API): at most one row per
// (world_id, account_id). Exposed so createOwnerMembership can guard
// against calling this twice for the same World -- e.g. a retried
// request -- without producing two membership rows for the same account.
async function membershipExists(worldId: string | number, accountId: string): Promise<boolean> {
  const res = await directusServiceRequest('/items/world_memberships', {
    method: 'GET',
    query: {
      filter: {
        _and: [{ world_id: { _eq: Number(worldId) } }, { account_id: { _eq: accountId } }]
      },
      limit: 1,
      fields: 'id'
    }
  })

  return Array.isArray(res?.data) && res.data.length > 0
}

// Called once, from server/utils/worlds.ts's createWorld, immediately
// after the World row itself is created. This is the ONLY membership this
// task creates -- there is no invitation flow yet (NON-GOALS), so a World
// has exactly one member until Phase 3 exists.
export async function createOwnerMembership(worldId: string | number, accountId: string): Promise<WorldMembershipRecord> {
  if (await membershipExists(worldId, accountId)) {
    throw createError({
      statusCode: 409,
      statusMessage: `Account ${accountId} already has a membership in world ${worldId}`
    })
  }

  const now = new Date().toISOString()

  const res = await directusServiceRequest('/items/world_memberships', {
    method: 'POST',
    query: { fields: MEMBERSHIP_FIELDS },
    body: {
      world_id: Number(worldId),
      account_id: accountId,
      role: 'owner' satisfies WorldMembershipRole,
      created_at: now,
      updated_at: now
    }
  })

  return normalizeMembership(res?.data ?? {})
}

// The read side resolvePrincipal (server/utils/authorization.ts) calls to
// populate Principal.worldCapabilities. Every membership row for this
// Account, across every World -- there is no per-world lookup here because
// resolvePrincipal needs the whole set to build the Principal once per
// request, not once per world.
export async function listMembershipsForAccount(accountId: string): Promise<WorldMembershipRecord[]> {
  const res = await directusServiceRequest('/items/world_memberships', {
    method: 'GET',
    query: {
      filter: { account_id: { _eq: accountId } },
      limit: -1,
      fields: MEMBERSHIP_FIELDS
    }
  })

  return Array.isArray(res?.data) ? res.data.map(normalizeMembership) : []
}
