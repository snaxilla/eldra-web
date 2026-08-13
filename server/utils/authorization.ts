// Phase 0 of .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) -- the server-side authorization enforcement skeleton. See
// that document's §9 (Authorization), §11 (Enforcement), and §12 Phase 0
// for the design this implements.
//
// TEMPORARY SINGLE-USER MODE (architecture doc §12 Phase 0, §8.7): Accounts,
// WorldMemberships, and Invitations do not exist yet (§5, §12 Phase 1+).
// Until they do, any authenticated Directus admin is treated as holding
// every capability at every scope -- the "one effective administrator" the
// current deployment actually has (architecture doc §2.7: all three live
// Directus users are Administrators). This is NOT a permanent model. It
// exists only to establish the enforcement SEAM -- can() / requireCapability()
// -- so that Phase 2's real per-world Membership resolution replaces
// resolvePrincipal's internals without changing a single call site that
// already calls can() or requireCapability().
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO (architecture doc Phase 0
// NON-GOALS): no Accounts collection, no repositories, no per-world role
// resolution, no OAuth. resolvePrincipal reads the Directus session
// directly via server/utils/directus.ts, exactly as server/api/auth/me.get.ts
// already does -- Directus remains the credential/session provider (§6.3).
// Nothing below imports Directus's HTTP client into can(), which stays a
// pure function with no I/O, matching the architecture doc's rule that
// policy is domain logic and data access is a port (§9.1/§9.2).

// createError is imported explicitly (rather than relied on as a Nitro
// auto-import, the convention server/utils/directus.ts uses) because this
// module -- unlike directus.ts -- is meant to be unit-tested directly under
// plain Vitest, which has no Nuxt/Nitro auto-import shims. h3's createError
// is the exact function Nitro auto-imports at runtime, so this changes
// nothing about production behavior.
import { createError, type H3Event } from 'h3'
import { fetchDirectusMe, getSessionToken } from './directus'
import { resolveAccessFlag } from '../../app/utils/directusAccess'

// ---------------------------------------------------------------------------
// Capability -- the full vocabulary from the architecture doc §8.7. Declaring
// the whole enum now, even though Phase 0 enforces only authentication (not
// individual capabilities) at the route level, is what lets a future route
// call requireCapability(principal, 'world.rules.activate', scope) without
// this file changing shape.
// ---------------------------------------------------------------------------

export type PlatformCapability =
  | 'platform.account.manage'
  | 'platform.package.install'
  | 'platform.package.publish'
  | 'platform.package.remove'
  | 'platform.contentpack.install'
  | 'platform.contentpack.publish'
  | 'platform.contentpack.remove'
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
  'platform.world.list',
  'platform.world.delete',
  'platform.settings.manage',
  'platform.breakglass.enter'
]

// ---------------------------------------------------------------------------
// Scope -- architecture doc §9.2/§9.4. A capability check is always against
// ONE of these two shapes; there is no capability that means "everywhere."
// ---------------------------------------------------------------------------

export type Scope = { kind: 'platform' } | { kind: 'world'; worldId: string }

// ---------------------------------------------------------------------------
// Principal -- architecture doc §8.1/§9.3. `platformCapabilities` and
// `worldCapabilities` are deliberately the two fields real Membership
// resolution will populate in Phase 2; only HOW they get filled in changes,
// not their shape or how can() reads them.
// ---------------------------------------------------------------------------

export type Principal = {
  accountId: string
  platformCapabilities: ReadonlySet<PlatformCapability>
  worldCapabilities: ReadonlyMap<string, ReadonlySet<WorldCapability>>
  // true only under temporary single-user mode (§12 Phase 0) -- lets tests
  // and future code distinguish "the placeholder policy" from real
  // Membership-backed resolution, without can() special-casing anything
  // other than this one flag.
  temporarySingleUserMode: boolean
}

declare module 'h3' {
  interface H3EventContext {
    principal?: Principal | null
  }
}

// A Principal in temporary single-user mode holds every world capability at
// every world, because there is no Membership model yet to say otherwise.
// worldCapabilities therefore isn't populated per-world id -- can() reads
// `temporarySingleUserMode` directly instead of pretending to enumerate
// "every world that will ever exist."
function buildTemporarySingleUserPrincipal(accountId: string): Principal {
  return Object.freeze({
    accountId,
    platformCapabilities: new Set(ALL_PLATFORM_CAPABILITIES),
    worldCapabilities: new Map(),
    temporarySingleUserMode: true
  })
}

// An authenticated Directus user who is NOT an admin resolves to a
// Principal with zero capabilities rather than null. This keeps
// "authenticated, no rights" distinct from "not authenticated at all" --
// the same distinction the architecture doc's may_read() model depends on
// (§8.3) -- even though no non-admin Directus user exists on the live
// instance today (§2.7).
function buildPowerlessPrincipal(accountId: string): Principal {
  return Object.freeze({
    accountId,
    platformCapabilities: new Set<PlatformCapability>(),
    worldCapabilities: new Map<string, ReadonlySet<WorldCapability>>(),
    temporarySingleUserMode: false
  })
}

// ---------------------------------------------------------------------------
// resolvePrincipal -- architecture doc §9.3. Infrastructure-adjacent by
// necessity (it reads an H3Event and a session cookie), but everything it
// DECIDES is delegated: whether a session is valid comes from Directus
// (§6.3, unchanged from today); WHO gets which capabilities is temporary-
// single-user policy, isolated in the two builders above so Phase 2 can
// replace their internals without this function's signature or call sites
// changing.
// ---------------------------------------------------------------------------

export async function resolvePrincipal(event: H3Event): Promise<Principal | null> {
  const token = getSessionToken(event)
  if (!token) {
    return null
  }

  let user: any
  try {
    user = await fetchDirectusMe(event)
  } catch {
    // Expired/invalid session token -- the same failure
    // server/api/auth/me.get.ts already treats as "not authenticated."
    return null
  }

  const accountId = user?.id
  if (!accountId) {
    return null
  }

  const isAdmin = resolveAccessFlag(user, 'admin_access')
  return isAdmin ? buildTemporarySingleUserPrincipal(accountId) : buildPowerlessPrincipal(accountId)
}

// ---------------------------------------------------------------------------
// can -- architecture doc §9.2. Pure: no I/O, no H3Event, no Directus. This
// is the function Phase 2's real Membership data plugs into unchanged.
// ---------------------------------------------------------------------------

export function can(principal: Principal | null, capability: Capability, scope: Scope): boolean {
  if (!principal) {
    return false
  }

  if (principal.temporarySingleUserMode) {
    // The one effective administrator: every capability, every scope,
    // until real Membership rows exist to say otherwise.
    return true
  }

  if (scope.kind === 'platform') {
    return principal.platformCapabilities.has(capability as PlatformCapability)
  }

  const worldCapabilities = principal.worldCapabilities.get(scope.worldId)
  return worldCapabilities?.has(capability as WorldCapability) ?? false
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
