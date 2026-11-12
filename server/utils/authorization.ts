// Phase 0 + Phase 2 of .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) -- the server-side authorization enforcement skeleton, plus
// its real per-world Membership resolution. See that document's §9
// (Authorization), §11 (Enforcement), §12 Phase 0, and §8.5/§12 Phase 2 for
// the design this implements.
//
// PHASE 1 (Eldra Account Foundation) CHANGED TWO THINGS HERE, AND NOTHING
// ELSE. The capability vocabulary, WORLD_ROLE_CAPABILITIES, Scope, and
// can()'s signature and role semantics are untouched. What changed is
// identity resolution:
//
// 1. `Principal.accountId` is now an ELDRA Account id
//    (server/utils/eldra-accounts.ts), not the Directus user id this file
//    used to read straight off `/users/me`. The Directus user is now just
//    one IdentityLink pointing at that Account (architecture doc
//    §6.1/§6.2), and is the only place a Directus user id survives.
//
// 2. `temporarySingleUserMode` IS GONE, and with it the implicit grant it
//    carried. It was set from Directus's own `admin_access` policy flag,
//    which meant "whoever Directus calls an Administrator is an Eldra
//    platform administrator, and is additionally a superuser on every
//    World that happens to have no membership row." Eldra platform
//    capability is now exclusively what `eldra_platform_grants` says it
//    is -- granted deliberately, per capability, per Account, and never
//    derived from Directus's role or policy model. One human may
//    administer both systems; granting one no longer grants the other.
//
// FAIL-CLOSED MEMBERSHIP DATA. resolveWorldCapabilities used to swallow a
// failed membership read and return an empty map, after which can()'s
// world branch fell through to temporarySingleUserMode -- so a Directus
// outage or a missing collection WIDENED an administrator's access from
// "whatever their memberships say" to "everything, everywhere." It now
// propagates, resolvePrincipal fails the request, and no caller can
// mistake "I could not read your memberships" for "you have none."
//
// OIDC (this task) ADDED ONE THING: resolvePrincipal now resolves an
// Account from EITHER a Directus session OR an Eldra-issued one
// (server/utils/eldra-sessions.ts), via the shared
// `resolveAuthenticatedAccount` below. Directus remains the credential
// verifier for its own session kind (§6.3) -- `eldra_session` still
// carries a raw Directus access token, validated by calling Directus,
// completely unchanged. An OIDC-authenticated session was the one case
// with no Directus credential to validate at all, which is why it needed
// its own session mechanism rather than reusing this one.
//
// WHAT STILL DID NOT NEED TO CHANGE, AND WHY THAT MATTERS: everything
// below `resolveAuthenticatedAccount` -- accountLookupKeys,
// resolveWorldCapabilities, listPlatformGrants, buildPrincipal, can() --
// operates ONLY on an already-resolved `EldraAccount`, never on how it
// was authenticated. Tracing confirmed that no business-data read or
// write anywhere in this codebase depends on a user's own Directus
// credential either (directusRequest, the user-scoped Directus client,
// has exactly 5 call sites, all inside login/logout/session-validation
// itself) -- every actual data operation already goes through the
// service-token client, independent of which human is signed in. That is
// why adding a second, provider-neutral way to arrive at a Principal did
// not require touching the authorization boundary, can()'s semantics, or
// a single one of the 62+ directusServiceRequest call sites: that
// boundary was never coupled to Directus's own per-user credential in
// the first place.
//
// WHAT THIS FILE STILL DELIBERATELY DOES NOT DO: no credential storage
// for OIDC (no OIDC access/refresh token is ever written to a cookie or a
// database row -- see server/utils/oidc.ts's own header), no
// Invitations, no repository extraction, no entity/character ownership.
// can() stays a pure function with no I/O; the membership DATA it reads
// is fetched by resolvePrincipal (already infrastructure-adjacent, per
// §9.3) before can() ever runs, matching the architecture doc's rule
// that policy is domain logic and data access is a port (§9.1/§9.2).

// createError is imported explicitly (rather than relied on as a Nitro
// auto-import, the convention server/utils/directus.ts uses) because this
// module -- unlike directus.ts -- is meant to be unit-tested directly under
// plain Vitest, which has no Nuxt/Nitro auto-import shims. h3's createError
// is the exact function Nitro auto-imports at runtime, so this changes
// nothing about production behavior.
import { createError, type H3Event } from 'h3'
import { fetchDirectusMe, getSessionToken } from './directus'
import { formatAccountDisplayName } from './accounts'
import {
  DIRECTUS_PROVIDER,
  getAccountById,
  listLegacyDirectusUuidSubjectsForAccount,
  listPlatformGrants,
  resolveAccountForIdentity,
  type EldraAccount
} from './eldra-accounts'
import { getEldraSessionToken, resolveEldraSession } from './eldra-sessions'
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
  // Content Workspaces & Studio, Phases 1-3 (content-workspaces-and-studio.md
  // §14.2). Authoring a platform-scoped content library is deliberately NOT
  // derivable from any World role: a World entity editor curates their own
  // World's wiki, which says nothing about whether they may edit a library
  // every World can bind. These are platform-scope only, and nobody holds
  // them until they are explicitly granted.
  //
  // Only view/create/edit exist here. The rest of §14.2's table
  // (platform.content.slug_change, platform.content.facet_author,
  // platform.contentpack.promote/.export, world.content.bind_workspace) is
  // deliberately absent until the phase that enforces it -- a capability
  // nothing checks is a claim the code does not keep. Adopting or
  // transferring a lineage uses the EXISTING platform.contentpack.publish
  // (§14.3), because deciding who publishes a lineage is a publishing
  // decision.
  | 'platform.contentworkspace.view'
  | 'platform.contentworkspace.create'
  | 'platform.contentworkspace.edit'
  | 'platform.world.create'
  | 'platform.world.list'
  | 'platform.world.delete'
  | 'platform.settings.manage'
  | 'platform.breakglass.enter'
  // Player Management (Game Admin): reassign or delete a Player Character
  // regardless of which account currently owns it, or which (if any)
  // World role the admin performing the action holds. PLATFORM scope,
  // not world scope -- deliberately, because "regardless of... ordinary
  // World role" is exactly the property a world.* capability cannot give:
  // can()'s world branch is authoritative only when a membership row
  // exists for that World, and a Platform Admin may hold none at all
  // (architecture doc §8.1 -- Platform Admin is not a World superuser).
  // Granting world.character.edit_any instead would have silently handed
  // this authority to every ordinary GM/Owner too, which the brief this
  // capability was added for explicitly rules out ("do not silently
  // broaden World GM capabilities"). A fresh, narrow capability --
  // nobody, including the already-bootstrapped platform administrator,
  // holds it until it is explicitly granted (see
  // scripts/directus/bootstrap-eldra-platform-admin.mjs's own
  // PLATFORM_CAPABILITIES list, which this value was added to in the same
  // change, kept in sync by tests/scripts/platform-admin-plan.test.ts's
  // drift check).
  | 'platform.character.manage'

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

// Exported so a provisioning script (scripts/directus/bootstrap-eldra-platform-admin.mjs)
// and its own test (tests/scripts/platform-admin-plan.test.ts) can assert
// their hand-copied PLATFORM_CAPABILITIES list never drifts from this one
// -- the actual vocabulary resolvePlatformCapabilities filters grants
// against lives here, once.
export const ALL_PLATFORM_CAPABILITIES: readonly PlatformCapability[] = [
  'platform.account.manage',
  'platform.package.install',
  'platform.package.publish',
  'platform.package.remove',
  'platform.contentpack.install',
  'platform.contentpack.publish',
  'platform.contentpack.remove',
  'platform.contentworkspace.view',
  'platform.contentworkspace.create',
  'platform.contentworkspace.edit',
  'platform.world.create',
  'platform.world.list',
  'platform.world.delete',
  'platform.settings.manage',
  'platform.breakglass.enter',
  'platform.character.manage'
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
// Principal -- architecture doc §8.1/§9.3. Every field is now explicit
// data: platform capabilities come from eldra_platform_grants rows, world
// capabilities from world_memberships rows mapped through
// WORLD_ROLE_CAPABILITIES. There is no longer any flag that means "and
// also allow everything else."
// ---------------------------------------------------------------------------

export type Principal = {
  // The ELDRA Account id (server/utils/eldra-accounts.ts) -- provider
  // neutral, generated by Eldra, and deliberately NOT the Directus user
  // id the session authenticated as.
  accountId: string
  platformCapabilities: ReadonlySet<PlatformCapability>
  worldCapabilities: ReadonlyMap<string, ReadonlySet<WorldCapability>>
  // Every id that may legitimately identify this Account in a store that
  // predates Phase 1: the Eldra Account id itself, plus each linked
  // DIRECTUS identity's user id -- never any other provider's subject.
  //
  // WHY THIS EXISTS. world_memberships.account_id and
  // roll_events.roller_user_id were both written with Directus user ids
  // before Phase 1, and this phase deliberately does not re-key live
  // content (that is its own approved migration). Reads against those two
  // stores therefore have to match either identifier, and this is the
  // single place that set is assembled -- so no call site re-derives it,
  // and so removing the compatibility path later means deleting one field
  // and its uses rather than hunting for ad-hoc copies.
  //
  // WORLDS-LOADING REGRESSION (generic OIDC identity linking) -- fixed at
  // the SOURCE, not here: this set used to include EVERY linked
  // provider's subject (listIdentitySubjectsForAccount), which was safe
  // only because every provider_subject in the identity-link store
  // happened to be a Directus user id until OIDC linking made that no
  // longer true. Both legacy columns above are `uuid`-typed, and an
  // OIDC/social provider's `sub` claim has no shape guarantee at all --
  // Postgres rejected the first non-UUID value outright ("invalid input
  // syntax for type uuid"), taking down the Worlds list for the account
  // that linked it. `listLegacyDirectusUuidSubjectsForAccount` (below) now
  // filters to the Directus provider specifically, with a UUID-shape
  // check as defense in depth -- see its own header in eldra-accounts.ts.
  //
  // It is NOT an authorization input: nothing grants a capability because
  // of which key matched. New rows are always written with `accountId`,
  // so the legacy half of this set only ever shrinks.
  accountLookupKeys: readonly string[]
}

declare module 'h3' {
  interface H3EventContext {
    principal?: Principal | null
  }
}

function buildPrincipal(input: {
  accountId: string
  accountLookupKeys: readonly string[]
  platformCapabilities: ReadonlySet<PlatformCapability>
  worldCapabilities: ReadonlyMap<string, ReadonlySet<WorldCapability>>
}): Principal {
  return Object.freeze({
    accountId: input.accountId,
    accountLookupKeys: Object.freeze([...input.accountLookupKeys]),
    platformCapabilities: input.platformCapabilities,
    worldCapabilities: input.worldCapabilities
  })
}

// Narrows the raw capability strings stored in eldra_platform_grants to the
// vocabulary this file actually defines, dropping anything it does not
// recognize.
//
// This is deliberately a filter and not a cast: a grant row is data in a
// store a human can edit, so a typo, a renamed capability, or an
// optimistic future value must be inert rather than trusted. A row can
// only ever grant a capability that already exists here -- it can never
// extend the vocabulary.
function resolvePlatformCapabilities(granted: readonly string[]): ReadonlySet<PlatformCapability> {
  const vocabulary = new Set<string>(ALL_PLATFORM_CAPABILITIES)
  const resolved = new Set<PlatformCapability>()

  for (const capability of granted) {
    if (vocabulary.has(capability)) {
      resolved.add(capability as PlatformCapability)
    }
  }

  return resolved
}

// Every world_memberships row for this Account, mapped through
// WORLD_ROLE_CAPABILITIES.
//
// NO LONGER SWALLOWS FAILURES (Phase 1 authorization preflight, finding
// B). This function used to catch a failed membership read and return an
// empty map, on the reasoning that a missing collection should not break
// every authenticated request. The consequence was the opposite of safe:
// an empty map sent can()'s world branch into its temporarySingleUserMode
// fallback, so a transport error or an unprovisioned collection silently
// promoted an administrator from "membership-limited" to "superuser on
// every World." A read failure and a genuinely empty membership list are
// not the same fact and must not produce the same Principal.
//
// It therefore propagates. resolvePrincipal turns that into a failed
// request (see its own handling), which is the fail-closed direction: a
// caller is told the decision could not be made, rather than handed a
// Principal that quietly means more than the data supports. An
// unprovisioned `world_memberships` collection is now a deployment error
// that surfaces immediately instead of a silent widening -- which is what
// CLAUDE.md's Deployment Checklist step 3 ("verify schema-dependent
// features actually work") exists to catch.
//
// `accountLookupKeys` rather than a single id: see Principal's own field
// comment for why rows written before Phase 1 must still resolve.
async function resolveWorldCapabilities(
  accountLookupKeys: readonly string[]
): Promise<Map<string, ReadonlySet<WorldCapability>>> {
  const memberships = await listMembershipsForAccount(accountLookupKeys)

  const result = new Map<string, ReadonlySet<WorldCapability>>()
  for (const membership of memberships) {
    const existing = result.get(membership.worldId)
    const granted = WORLD_ROLE_CAPABILITIES[membership.role]

    if (!existing) {
      result.set(membership.worldId, new Set(granted))
      continue
    }

    // Two rows for one World can only happen while both a legacy
    // Directus-keyed row and an Eldra-keyed row exist for the same
    // Account -- the transitional state accountLookupKeys exists to read
    // across. Union rather than last-write-wins, so the transition can
    // never silently REMOVE a capability the Account already had; the
    // one-row-per-(world, account) invariant world-memberships.ts
    // enforces for writes makes this unreachable once the legacy rows are
    // re-keyed.
    const merged = new Set(existing)
    for (const capability of granted) {
      merged.add(capability)
    }
    result.set(membership.worldId, merged)
  }

  return result
}

// ---------------------------------------------------------------------------
// resolvePrincipal -- architecture doc §9.3. Infrastructure-adjacent by
// necessity (it reads an H3Event, a session cookie, Eldra Account rows and
// World Membership rows), but everything it DECIDES is delegated: whether
// a session is valid comes from Directus (§6.3, unchanged -- Directus is
// still the credential verifier during Beta); WHICH Account that session
// belongs to comes from the IdentityLink store; which platform
// capabilities it holds comes from explicit grant rows; which capabilities
// a World grants comes from WORLD_ROLE_CAPABILITIES (pure, above).
//
// THREE DISTINCT OUTCOMES, deliberately not collapsed:
//   null    -- not authenticated (no cookie, or Directus rejected it).
//              Exactly what server/api/auth/me.get.ts already treats as
//              signed out.
//   throws  -- authenticated, but the authorization data needed to decide
//              anything could not be read. Fail closed and loudly: the
//              caller gets an error, never a thinner Principal that would
//              read as "this user legitimately has no access."
//   Principal -- authenticated, and every capability in it is backed by a
//              row.
// ---------------------------------------------------------------------------

// TWO SESSION KINDS, RESOLVED IN A DEFINED ORDER (OIDC, this task).
// Directus-authenticated sessions still carry a raw Directus access
// token in `eldra_session`, validated via Directus `/users/me` --
// completely unchanged. An OIDC-authenticated session instead carries an
// Eldra-ISSUED opaque token in a SEPARATE cookie
// (server/utils/eldra-sessions.ts's ELDRA_SESSION_COOKIE), because there
// is no Directus credential to validate it against. The two cookies are
// checked independently, in a fixed order, and NEVER cross-trusted: a
// request with a valid Eldra-session cookie is never ALSO re-validated
// against Directus, and vice versa.
//
// Exported so server/api/auth/me.get.ts can ask the SAME question
// ("which Account, if any, authenticates this request") without
// re-implementing either branch -- the one thing that must never drift
// between the two is which cookie wins when (it can't: only one will
// ever be present for a given login, but a stale leftover from switching
// auth methods must not silently grant something the live method
// didn't).
export async function resolveAuthenticatedAccount(event: H3Event): Promise<EldraAccount | null> {
  const eldraSessionToken = getEldraSessionToken(event)
  if (eldraSessionToken) {
    // Not wrapped in try/catch: a session-STORE failure (not "no
    // session," an actual read error) must fail the request, the same
    // fail-loud choice the Directus branch below already makes for its
    // own /users/me call failing for a reason other than "invalid token."
    const session = await resolveEldraSession(eldraSessionToken)
    if (!session) {
      return null
    }

    const account = await getAccountById(session.accountId)
    if (!account || account.status !== 'active') {
      return null
    }
    return account
  }

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

  const directusUserId = user?.id
  if (!directusUserId) {
    return null
  }

  // The Directus user id is a PROVIDER SUBJECT from here on, never an
  // account id. resolveAccountForIdentity matches only on
  // (provider, provider_subject) -- never on email or display name, which
  // is the account-takeover rule the architecture doc states as §6.2 rule
  // 2 and which that function enforces by not accepting an email at all.
  // The display name is passed for first-sight provisioning only.
  //
  // Not wrapped in a try/catch: a failure here is "authenticated, but I
  // cannot tell which Account you are", which must fail the request rather
  // than degrade to an anonymous or empty Principal.
  const account = await resolveAccountForIdentity({
    provider: DIRECTUS_PROVIDER,
    providerSubject: String(directusUserId),
    displayName: formatAccountDisplayName(user)
  })

  if (account.status !== 'active') {
    // A suspended Account authenticates against Directus perfectly well
    // -- Directus knows nothing about Eldra Account status. Treating it
    // as unauthenticated is the fail-closed reading, and keeps
    // suspension a single Eldra-owned fact rather than something that
    // also has to be mirrored into Directus.
    return null
  }

  return account
}

export async function resolvePrincipal(event: H3Event): Promise<Principal | null> {
  const account = await resolveAuthenticatedAccount(event)
  if (!account) {
    return null
  }

  const accountLookupKeys = [
    account.id,
    ...(await listLegacyDirectusUuidSubjectsForAccount(account.id))
  ].filter((key, index, keys) => Boolean(key) && keys.indexOf(key) === index)

  const [worldCapabilities, platformGrants] = await Promise.all([
    resolveWorldCapabilities(accountLookupKeys),
    listPlatformGrants(account.id)
  ])

  return buildPrincipal({
    accountId: account.id,
    accountLookupKeys,
    platformCapabilities: resolvePlatformCapabilities(platformGrants),
    worldCapabilities
  })
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
    // Platform capability is now exactly what eldra_platform_grants says
    // -- the `temporarySingleUserMode` short-circuit that used to sit here
    // ("an authenticated Directus Administrator may do anything at
    // platform scope") is gone. A Directus Administrator with no grant row
    // holds nothing here, which is the entire point of Phase 1.
    return principal.platformCapabilities.has(capability as PlatformCapability)
  }

  const worldCapabilities = principal.worldCapabilities.get(scope.worldId)

  if (!worldCapabilities) {
    // No membership row for this World means no access to it. Platform
    // Admin is not a World superuser (architecture doc §8.1) and now has
    // no fallback that could make it one -- a World this Account holds no
    // role in is closed to it, administrator or not.
    //
    // Worlds that predate world_memberships therefore need a real owner
    // row, which scripts/directus/bootstrap-eldra-platform-admin.mjs
    // backfills as a deliberate, reviewable step rather than an implicit
    // runtime grant.
    return false
  }

  // The membership row is authoritative, including when it grants LESS
  // than platform administration might suggest.
  return worldCapabilities.has(capability as WorldCapability)
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
