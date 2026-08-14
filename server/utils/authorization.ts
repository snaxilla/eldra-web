// Phase 0 + Phase 2 of .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) -- the server-side authorization enforcement skeleton, plus
// its real per-world Membership resolution. See that document's §9
// (Authorization), §11 (Enforcement), §12 Phase 0, and §8.5/§12 Phase 2 for
// the design this implements.
//
// TEMPORARY SINGLE-USER MODE, NOW A FALLBACK (architecture doc §12 Phase 2):
// Accounts, IdentityLinks, and Invitations still do not exist (§5, §12
// Phase 1/3+ -- out of scope for this task). WorldMembership now does.
// resolvePrincipal populates Principal.worldCapabilities from REAL
// world_memberships rows (server/utils/world-memberships.ts), and can()
// prefers that data whenever a membership row exists for the World in
// question -- including when it grants LESS than an admin would otherwise
// get, which is the point (architecture doc §8.1: Platform Admin must not
// be a world superuser). `temporarySingleUserMode` now only fires as a
// fallback for a World that has NO membership row at all for this Account
// -- i.e. a World created before this collection existed. That gap closes
// world-by-world as worlds are (re)created through server/utils/worlds.ts,
// and closes entirely only once a future, explicitly-scoped migration
// backfills membership rows from worlds.owner_id for every pre-existing
// World (architecture doc §10.1, this task's own "migration comes later").
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO (this task's own NON-GOALS): no
// Accounts collection, no IdentityLinks, no OAuth, no Invitations, no
// repository extraction, no entity/character ownership. resolvePrincipal
// reads the Directus session directly via server/utils/directus.ts, exactly
// as server/api/auth/me.get.ts already does -- Directus remains the
// credential/session provider (§6.3). can() stays a pure function with no
// I/O; the membership DATA it reads is fetched by resolvePrincipal (already
// infrastructure-adjacent, per §9.3) before can() ever runs, matching the
// architecture doc's rule that policy is domain logic and data access is a
// port (§9.1/§9.2).

// createError is imported explicitly (rather than relied on as a Nitro
// auto-import, the convention server/utils/directus.ts uses) because this
// module -- unlike directus.ts -- is meant to be unit-tested directly under
// plain Vitest, which has no Nuxt/Nitro auto-import shims. h3's createError
// is the exact function Nitro auto-imports at runtime, so this changes
// nothing about production behavior.
import { createError, type H3Event } from 'h3'
import { fetchDirectusMe, getSessionToken } from './directus'
import { resolveAccessFlag } from '../../app/utils/directusAccess'
import { listMembershipsForAccount, type WorldMembershipRole } from './world-memberships'

// ---------------------------------------------------------------------------
// Capability -- the full vocabulary from the architecture doc §8.7. Declaring
// the whole enum now, even though Phase 0 enforces only authentication (not
// individual capabilities) at the route level, is what lets a future route
// call requireCapability(principal, 'world.rules.activate', scope) without
// this file changing shape.
//
// `platform.world.create` is the one addition beyond §8.7's own table: the
// architecture doc names "create a world" as an action a bare Account may
// take (§5.3) but its capability table only ever enumerated
// platform.world.list/.delete, not .create. Completing that pair is a
// naming-consistent gap fix, not a new capability namespace -- flagged here
// since it is the one place this task touched the vocabulary rather than
// just consuming it.
// ---------------------------------------------------------------------------

export type PlatformCapability =
  | 'platform.account.manage'
  | 'platform.package.install'
  | 'platform.package.publish'
  | 'platform.package.remove'
  | 'platform.contentpack.install'
  | 'platform.contentpack.publish'
  | 'platform.contentpack.remove'
  | 'platform.world.create'
  | 'platform.world.list'
  | 'platform.world.delete'
  | 'platform.settings.manage'
  | 'platform.breakglass.enter'

export type WorldCapability =
  | 'world.read'
  | 'world.settings.edit'
  | 'world.delete'
  | 'world.transfer_ownership'
  | 'world.member.invite'
  | 'world.member.remove'
  | 'world.member.assign_role'
  | 'world.rules.activate'
  | 'world.rules.configure'
  | 'world.content.bind_pack'
  | 'world.entity.create'
  | 'world.entity.edit'
  | 'world.entity.delete'
  | 'world.homebrew.manage'
  | 'world.map.edit'
  | 'world.scene.edit'
  | 'world.timeline.edit'
  | 'world.npc.manage'
  | 'world.character.create'
  | 'world.character.edit_own'
  | 'world.character.edit_any'
  | 'world.character.approve'
  | 'world.grant.issue'
  | 'world.roll.execute'
  | 'world.roll.see_gm'
  | 'world.roll.override'
  | 'world.session.run'

export type Capability = PlatformCapability | WorldCapability

const ALL_PLATFORM_CAPABILITIES: readonly PlatformCapability[] = [
  'platform.account.manage',
  'platform.package.install',
  'platform.package.publish',
  'platform.package.remove',
  'platform.contentpack.install',
  'platform.contentpack.publish',
  'platform.contentpack.remove',
  'platform.world.create',
  'platform.world.list',
  'platform.world.delete',
  'platform.settings.manage',
  'platform.breakglass.enter'
]

// Exported so a route can compute "every capability this Principal holds
// in this World" (Beta Zero audit, Issue 2 -- the Build workspace needs to
// ask can() the same question for a small set of capabilities, not
// re-derive role/membership logic of its own) by filtering this list
// through can(), rather than the route inventing its own enumeration that
// could drift from the real vocabulary.
export const ALL_WORLD_CAPABILITIES: readonly WorldCapability[] = [
  'world.read',
  'world.settings.edit',
  'world.delete',
  'world.transfer_ownership',
  'world.member.invite',
  'world.member.remove',
  'world.member.assign_role',
  'world.rules.activate',
  'world.rules.configure',
  'world.content.bind_pack',
  'world.entity.create',
  'world.entity.edit',
  'world.entity.delete',
  'world.homebrew.manage',
  'world.map.edit',
  'world.scene.edit',
  'world.timeline.edit',
  'world.npc.manage',
  'world.character.create',
  'world.character.edit_own',
  'world.character.edit_any',
  'world.character.approve',
  'world.grant.issue',
  'world.roll.execute',
  'world.roll.see_gm',
  'world.roll.override',
  'world.session.run'
]

// ---------------------------------------------------------------------------
// Role -> capability bundles -- architecture doc §8.7's table, transcribed
// exactly. Roles are the assignment primitive (what a WorldMembership row
// stores); capabilities are the enforcement primitive (what can() checks).
// This mapping is the ONLY place that ever changes when a role's bundle is
// revised -- no enforcement site names a role.
//
// Kept in this file (not world-memberships.ts) because it is policy, not
// persistence: it has no I/O and does not know Directus exists, the same
// property can() itself has.
// ---------------------------------------------------------------------------

const GM_CAPABILITIES: readonly WorldCapability[] = ALL_WORLD_CAPABILITIES.filter(
  (capability) => capability !== 'world.delete' && capability !== 'world.transfer_ownership'
)

const WORLDBUILDER_CAPABILITIES: readonly WorldCapability[] = [
  'world.read',
  'world.entity.create',
  'world.entity.edit',
  'world.entity.delete',
  'world.homebrew.manage',
  'world.map.edit',
  'world.scene.edit',
  'world.timeline.edit',
  'world.npc.manage'
]

const PLAYER_CAPABILITIES: readonly WorldCapability[] = [
  'world.read',
  'world.character.create',
  'world.character.edit_own',
  'world.roll.execute'
]

const OBSERVER_CAPABILITIES: readonly WorldCapability[] = ['world.read']

// Observer's `world.read` is unconditional here -- the "(public only)"
// qualifier in §8.7's table is a data-visibility rule (§8.3's may_read),
// layered on top of this capability, not a reason to withhold the
// capability itself. Visibility enforcement is out of this task's scope
// (NON-GOALS: no entity ownership).
export const WORLD_ROLE_CAPABILITIES: Readonly<Record<WorldMembershipRole, readonly WorldCapability[]>> = {
  owner: ALL_WORLD_CAPABILITIES,
  gm: GM_CAPABILITIES,
  worldbuilder: WORLDBUILDER_CAPABILITIES,
  player: PLAYER_CAPABILITIES,
  observer: OBSERVER_CAPABILITIES
}

// ---------------------------------------------------------------------------
// Scope -- architecture doc §9.2/§9.4. A capability check is always against
// ONE of these two shapes; there is no capability that means "everywhere."
// ---------------------------------------------------------------------------

export type Scope = { kind: 'platform' } | { kind: 'world'; worldId: string }

// ---------------------------------------------------------------------------
// Principal -- architecture doc §8.1/§9.3. `worldCapabilities` is now
// populated from REAL WorldMembership rows (Phase 2), keyed by worldId
// (as a string, matching Scope.worldId's type). `temporarySingleUserMode`
// no longer means "ignore worldCapabilities" -- see can() below -- it
// means "if this World has no membership row for me at all, fall back to
// full access" (architecture doc §12 Phase 2's own framing: temporary mode
// as a fallback, not a bypass).
// ---------------------------------------------------------------------------

export type Principal = {
  accountId: string
  platformCapabilities: ReadonlySet<PlatformCapability>
  worldCapabilities: ReadonlyMap<string, ReadonlySet<WorldCapability>>
  // true only for an authenticated Directus admin -- lets tests and can()
  // distinguish "the one effective administrator, with the Phase 2
  // migration-gap fallback available" from an ordinary Account, without
  // either of them special-casing anything other than this one flag.
  temporarySingleUserMode: boolean
}

declare module 'h3' {
  interface H3EventContext {
    principal?: Principal | null
  }
}

function buildPrincipal(
  accountId: string,
  worldCapabilities: ReadonlyMap<string, ReadonlySet<WorldCapability>>,
  temporarySingleUserMode: boolean
): Principal {
  return Object.freeze({
    accountId,
    // Platform capabilities have no Membership equivalent in this task
    // (no PlatformMembership concept exists or is planned -- §8.1's
    // platform/world split is about AUTHORITY, not about there being two
    // membership systems). An admin keeps the full platform set via
    // temporarySingleUserMode's platform-scope branch in can(); a non-admin
    // gets none, exactly as Phase 0 already had it.
    platformCapabilities: temporarySingleUserMode ? new Set(ALL_PLATFORM_CAPABILITIES) : new Set<PlatformCapability>(),
    worldCapabilities,
    temporarySingleUserMode
  })
}

// Every world_memberships row for this Account, mapped through
// WORLD_ROLE_CAPABILITIES. Isolated in its own function (rather than
// inlined into resolvePrincipal) so its one failure mode -- the
// world_memberships collection not yet existing in a given environment,
// per CLAUDE.md's Deployment Checklist ("nothing runs schema migrations
// automatically") -- has a single, clearly-named place to degrade instead
// of crashing every authenticated request.
async function resolveWorldCapabilities(accountId: string): Promise<Map<string, ReadonlySet<WorldCapability>>> {
  let memberships: Awaited<ReturnType<typeof listMembershipsForAccount>>

  try {
    memberships = await listMembershipsForAccount(accountId)
  } catch {
    // Degrade to "no memberships known" rather than failing
    // authentication outright. temporarySingleUserMode's fallback in
    // can() covers admins during this gap; a non-admin simply gets zero
    // world capabilities, matching Phase 0's behavior exactly.
    return new Map()
  }

  const result = new Map<string, ReadonlySet<WorldCapability>>()
  for (const membership of memberships) {
    result.set(membership.worldId, new Set(WORLD_ROLE_CAPABILITIES[membership.role]))
  }
  return result
}

// ---------------------------------------------------------------------------
// resolvePrincipal -- architecture doc §9.3. Infrastructure-adjacent by
// necessity (it reads an H3Event, a session cookie, and now World
// Membership rows), but everything it DECIDES is delegated: whether a
// session is valid comes from Directus (§6.3, unchanged from today); which
// capabilities a World grants comes from WORLD_ROLE_CAPABILITIES (pure,
// above); WHO is the temporary-single-user fallback is exactly the same
// admin check Phase 0 already had.
// ---------------------------------------------------------------------------

export async function resolvePrincipal(event: H3Event): Promise<Principal | null> {
  const token = getSessionToken(event)
  if (!token) {
    return null
  }

  let user: any
  try {
    const response = await fetchDirectusMe(event)
    // Directus wraps single-item responses in a `data` envelope
    // (`{ data: { id, email, role, policies, ... } }`) -- fetchDirectusMe
    // returns that envelope AS-IS, unwrapped, exactly like
    // server/api/auth/me.get.ts's own `user` field does. Every other
    // consumer of this exact shape already unwraps it this same way:
    // server/api/auth/login.post.ts's `me?.data || me`, and
    // app/composables/useAuth.ts's `normalizeUser`
    // (`input?.data ? input.data : input`). This file was the one place
    // that read `user.id` directly on the STILL-WRAPPED envelope, where
    // `id` actually lives at `user.data.id` -- so `accountId` was always
    // undefined and resolvePrincipal always returned null, for every real
    // Directus response, regardless of session validity. THE regression.
    user = response?.data ?? response
  } catch {
    // Expired/invalid session token -- the same failure
    // server/api/auth/me.get.ts already treats as "not authenticated."
    return null
  }

  const accountId = user?.id
  if (!accountId) {
    return null
  }

  const worldCapabilities = await resolveWorldCapabilities(accountId)
  const isAdmin = resolveAccessFlag(user, 'admin_access')

  return buildPrincipal(accountId, worldCapabilities, isAdmin)
}

// ---------------------------------------------------------------------------
// can -- architecture doc §9.2. Pure: no I/O, no H3Event, no Directus. The
// membership data it reads off `principal` was already resolved by
// resolvePrincipal before can() ever runs.
// ---------------------------------------------------------------------------

export function can(principal: Principal | null, capability: Capability, scope: Scope): boolean {
  if (!principal) {
    return false
  }

  if (scope.kind === 'platform') {
    // No WorldMembership equivalent exists for platform scope (see
    // buildPrincipal) -- this branch is unchanged from Phase 0.
    if (principal.temporarySingleUserMode) {
      return true
    }
    return principal.platformCapabilities.has(capability as PlatformCapability)
  }

  const worldCapabilities = principal.worldCapabilities.get(scope.worldId)

  if (worldCapabilities) {
    // A real membership row exists for this World -- it is authoritative,
    // even for the temporary-single-user admin, even when it grants LESS
    // than admin status would otherwise imply. This is what makes Platform
    // Admin not a world superuser (architecture doc §8.1): once a World
    // has an explicit membership for this Account, that membership decides
    // access to it, full stop.
    return worldCapabilities.has(capability as WorldCapability)
  }

  // No membership row exists for this World at all -- the Phase 2
  // migration gap (a World created before world_memberships existed, or
  // before this Account had a row in it). Fall back to full access ONLY
  // for the temporary single-user admin, exactly as Phase 0 behaved for
  // every World. A non-admin Account with no membership row is denied, as
  // it always was.
  return principal.temporarySingleUserMode
}

// ---------------------------------------------------------------------------
// requireCapability -- architecture doc §9.2/§11.3. Throws rather than
// returning a boolean: authorization that returns a boolean gets ignored at
// one call site eventually, and fail-closed means every caller either gets
// the decision enforced FOR them or an exception, never a value they could
// forget to check.
// ---------------------------------------------------------------------------

export function requireCapability(principal: Principal | null, capability: Capability, scope: Scope): void {
  if (!can(principal, capability, scope)) {
    throw createError({
      statusCode: principal ? 403 : 401,
      statusMessage: principal ? `Missing capability '${capability}'` : 'Authentication required'
    })
  }
}
