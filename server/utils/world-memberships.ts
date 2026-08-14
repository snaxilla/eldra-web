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
//
// MEMBERSHIP ADMINISTRATION (this task): list/add/change-role/remove for an
// existing World. "Assume the account already exists" (this task's own
// FUNCTIONALITY section) -- there is no Accounts collection yet (NON-GOALS:
// no Accounts, no IdentityLinks, no OAuth, no account creation), so
// `accountId` here is, as everywhere else in this codebase today, a
// Directus user id. addMember/updateMemberRole/removeMember therefore
// never create or look up a "new" identity; they only ever attach a role
// to an id the caller already supplies.
//
// THE OWNER INVARIANT (architecture doc §8.5: "exactly one owner per
// World"; §10.1: "a World with zero owners is unadministrable"). Nothing
// in this task implements `world.transfer_ownership` (out of scope --
// FUNCTIONALITY lists invite/assign_role/remove only, not transfer), so
// none of the three write operations below may create a second owner,
// change the existing owner's role, or remove the owner. Each guards
// against exactly one side of that invariant; together they make it
// impossible for this feature to leave a World without exactly the one
// owner it already has.

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

// ---------------------------------------------------------------------------
// Membership Administration -- list / add / change role / remove, for the
// Game Admin "Members" panel and its API routes
// (server/api/worlds/[id]/members/**).
// ---------------------------------------------------------------------------

async function findMembership(worldId: string | number, accountId: string): Promise<WorldMembershipRecord | null> {
  const res = await directusServiceRequest('/items/world_memberships', {
    method: 'GET',
    query: {
      filter: {
        _and: [{ world_id: { _eq: Number(worldId) } }, { account_id: { _eq: accountId } }]
      },
      limit: 1,
      fields: MEMBERSHIP_FIELDS
    }
  })

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return row ? normalizeMembership(row) : null
}

export type WorldMemberSummary = WorldMembershipRecord & { displayName: string }

// "Assume the account already exists" (this task's own FUNCTIONALITY
// section) -- there is no Accounts collection to join against, so a
// member's display name is resolved directly from the Directus user it
// already is, the same identity Principal.accountId already carries
// (server/utils/authorization.ts). This is a display-only convenience: no
// authorization decision anywhere reads a display name.
async function resolveDisplayNames(accountIds: string[]): Promise<Map<string, string>> {
  if (accountIds.length === 0) {
    return new Map()
  }

  const res = await directusServiceRequest('/users', {
    method: 'GET',
    query: {
      filter: { id: { _in: accountIds } },
      limit: -1,
      fields: 'id,email,first_name,last_name'
    }
  })

  const names = new Map<string, string>()
  for (const row of Array.isArray(res?.data) ? res.data : []) {
    const first = String(row?.first_name ?? '').trim()
    const last = String(row?.last_name ?? '').trim()
    const full = `${first} ${last}`.trim()
    names.set(String(row?.id ?? ''), full || String(row?.email ?? '').trim() || String(row?.id ?? ''))
  }
  return names
}

// Every membership row for a World, with a resolved display name attached
// -- what GET /api/worlds/:id/members returns. Members whose Directus user
// could not be resolved (deleted account, lookup failure) still appear,
// falling back to their accountId, rather than silently vanishing from the
// roster.
export async function listMembersForWorld(worldId: string | number): Promise<WorldMemberSummary[]> {
  const res = await directusServiceRequest('/items/world_memberships', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: Number(worldId) } },
      limit: -1,
      fields: MEMBERSHIP_FIELDS
    }
  })

  // Explicitly typed rather than inferred: `res` is `any` (directusServiceRequest's
  // loose return type), so `res.data.map(normalizeMembership)` would
  // otherwise infer as `any[]` despite normalizeMembership's own typed
  // return, making every downstream .map() callback implicitly `any`.
  const memberships: WorldMembershipRecord[] = Array.isArray(res?.data) ? res.data.map(normalizeMembership) : []
  const displayNames = await resolveDisplayNames(memberships.map((m) => m.accountId))

  return memberships.map((membership) => ({
    ...membership,
    displayName: displayNames.get(membership.accountId) || membership.accountId
  }))
}

// Adds an existing account to a World with the given role. Never `owner`
// -- see the OWNER INVARIANT note at the top of this file; assigning
// ownership is `world.transfer_ownership`, out of this task's scope.
export async function addMember(
  worldId: string | number,
  accountId: string,
  role: WorldMembershipRole
): Promise<WorldMembershipRecord> {
  if (role === 'owner') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot add a member with role "owner" -- a World already has exactly one, assigned at creation.'
    })
  }

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
      role,
      created_at: now,
      updated_at: now
    }
  })

  return normalizeMembership(res?.data ?? {})
}

// Changes an existing member's role. Refuses to touch the owner's row in
// either direction (see the OWNER INVARIANT note): the current role may
// not be 'owner' (no silent demotion), and the requested role may not be
// 'owner' either (no silent second-owner creation, and no promotion --
// that is transfer_ownership's job).
export async function updateMemberRole(
  worldId: string | number,
  accountId: string,
  role: WorldMembershipRole
): Promise<WorldMembershipRecord> {
  if (role === 'owner') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot assign role "owner" -- use world transfer-ownership instead (not implemented).'
    })
  }

  const existing = await findMembership(worldId, accountId)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: `Account ${accountId} is not a member of world ${worldId}`
    })
  }

  if (existing.role === 'owner') {
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot change the owner's role -- transfer ownership first (not implemented)."
    })
  }

  // By primary key (existing.id, from findMembership above), not a
  // filter-based bulk update -- the same single-row PATCH-by-id shape
  // every other write in this codebase already uses (e.g.
  // server/api/worlds/[id]/timelines/[timelineId].patch.ts), rather than
  // an unverified bulk-by-filter request shape.
  const res = await directusServiceRequest(`/items/world_memberships/${existing.id}`, {
    method: 'PATCH',
    query: { fields: MEMBERSHIP_FIELDS },
    body: {
      role,
      updated_at: new Date().toISOString()
    }
  })

  return normalizeMembership(res?.data ?? { ...existing, role })
}

// Removes a member. Refuses to remove the owner (see the OWNER INVARIANT
// note) -- a World must always have exactly one.
export async function removeMember(worldId: string | number, accountId: string): Promise<void> {
  const existing = await findMembership(worldId, accountId)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: `Account ${accountId} is not a member of world ${worldId}`
    })
  }

  if (existing.role === 'owner') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot remove the owner -- transfer ownership or delete the World instead.'
    })
  }

  // By primary key -- same reasoning as updateMemberRole above.
  await directusServiceRequest(`/items/world_memberships/${existing.id}`, {
    method: 'DELETE'
  })
}
