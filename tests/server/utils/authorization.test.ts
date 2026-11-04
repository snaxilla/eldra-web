// Unit tests for the Phase 0 + Phase 2 authorization module
// (server/utils/authorization.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §9
// (Authorization), §12 Phase 0, and §8.5/§12 Phase 2 for the design under
// test.
//
// server/utils/directus.ts and server/utils/world-memberships.ts both rely
// on Nuxt/Nitro auto-imports and/or Directus HTTP calls that do not exist
// under plain Vitest -- the established pattern in this repo (see
// tests/server/utils/rules-packages.test.ts) is to mock both modules at
// the boundary rather than let them execute. resolvePrincipal's/can()'s
// own logic is what is under test here, not Directus's HTTP behavior.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchDirectusMeMock,
  getSessionTokenMock,
  listMembershipsForAccountMock,
  resolveAccountForIdentityMock,
  getAccountByIdMock,
  listIdentitySubjectsForAccountMock,
  listPlatformGrantsMock,
  getEldraSessionTokenMock,
  resolveEldraSessionMock
} = vi.hoisted(() => ({
  fetchDirectusMeMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
  listMembershipsForAccountMock: vi.fn(),
  resolveAccountForIdentityMock: vi.fn(),
  getAccountByIdMock: vi.fn(),
  listIdentitySubjectsForAccountMock: vi.fn(),
  listPlatformGrantsMock: vi.fn(),
  getEldraSessionTokenMock: vi.fn(),
  resolveEldraSessionMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  fetchDirectusMe: fetchDirectusMeMock,
  getSessionToken: getSessionTokenMock
}))

vi.mock('../../../server/utils/world-memberships', () => ({
  listMembershipsForAccount: listMembershipsForAccountMock
}))

// Phase 1: resolvePrincipal now resolves an ELDRA Account from the
// Directus session rather than treating the Directus user id as the
// account id, and reads platform capabilities from explicit grant rows.
// Both are mocked at the module boundary, the same way the Directus and
// membership modules already are.
vi.mock('../../../server/utils/eldra-accounts', () => ({
  DIRECTUS_PROVIDER: 'directus',
  resolveAccountForIdentity: resolveAccountForIdentityMock,
  getAccountById: getAccountByIdMock,
  listIdentitySubjectsForAccount: listIdentitySubjectsForAccountMock,
  listPlatformGrants: listPlatformGrantsMock
}))

// OIDC (this task): resolvePrincipal now checks an Eldra-issued session
// FIRST, before ever looking at the Directus cookie. Mocked at the
// boundary like everything else here; the default below (empty token) is
// what makes every EXISTING Directus-path test keep passing unchanged --
// it is exactly "no Eldra session cookie present."
vi.mock('../../../server/utils/eldra-sessions', () => ({
  getEldraSessionToken: getEldraSessionTokenMock,
  resolveEldraSession: resolveEldraSessionMock
}))

vi.mock('../../../server/utils/accounts', () => ({
  formatAccountDisplayName: (row: any) =>
    `${String(row?.first_name ?? '').trim()} ${String(row?.last_name ?? '').trim()}`.trim() ||
    String(row?.email ?? '')
}))

import { can, requireCapability, resolvePrincipal, WORLD_ROLE_CAPABILITIES, type Principal } from '../../../server/utils/authorization'
import type { WorldMembershipRecord } from '../../../server/utils/world-memberships'

// resolvePrincipal only ever threads its `event` argument through to the
// (mocked) getSessionToken/fetchDirectusMe -- it never reads anything off
// it directly, so an empty object stands in for a real H3Event here.
const fakeEvent = {} as any

// Directus wraps every /users/me response in a `{ data: {...} }` envelope
// -- these mocks return that SAME wrapped shape deliberately, matching
// what fetchDirectusMe actually returns in production. An earlier version
// of these fixtures returned the unwrapped fields directly, which let
// resolvePrincipal's missing `response?.data ?? response` unwrap (fixed
// below) pass 900+ tests while being completely broken against a real
// Directus response -- see the dedicated regression test in the
// 'resolvePrincipal -- Directus response envelope' describe block below.
function directusAdminUser(overrides: Record<string, any> = {}) {
  return {
    data: {
      id: 'admin-account-1',
      email: 'admin@example.com',
      role: {
        id: 'role-admin',
        name: 'Administrator',
        policies: [{ policy: { admin_access: true, app_access: true } }]
      },
      ...overrides
    }
  }
}

function directusNonAdminUser(overrides: Record<string, any> = {}) {
  return {
    data: {
      id: 'player-account-1',
      email: 'player@example.com',
      role: {
        id: 'role-public',
        name: 'Public',
        policies: [{ policy: { admin_access: false, app_access: true } }]
      },
      ...overrides
    }
  }
}

function membership(overrides: Partial<WorldMembershipRecord> = {}): WorldMembershipRecord {
  return {
    id: 'membership-1',
    worldId: '5',
    accountId: 'account-1',
    role: 'player',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function expectThrowsWithStatus(fn: () => void, statusCode: number) {
  let caught: any
  try {
    fn()
    throw new Error('expected fn() to throw, but it did not')
  } catch (error) {
    caught = error
  }
  expect(caught).toBeDefined()
  expect((caught as { statusCode?: number }).statusCode).toBe(statusCode)
}

// The Eldra Account the mocked identity store resolves a Directus subject
// to. Deliberately NOT shaped like a Directus uuid, and deliberately
// unrelated to the `id` the Directus fixtures above return -- every
// assertion that accountId is the Eldra id rather than the Directus one
// depends on the two being visibly different.
const ELDRA_ACCOUNT_ID = 'eldra-account-0001'

beforeEach(() => {
  fetchDirectusMeMock.mockReset()
  getSessionTokenMock.mockReset()
  listMembershipsForAccountMock.mockReset()
  resolveAccountForIdentityMock.mockReset()
  getAccountByIdMock.mockReset()
  listIdentitySubjectsForAccountMock.mockReset()
  listPlatformGrantsMock.mockReset()
  getEldraSessionTokenMock.mockReset()
  resolveEldraSessionMock.mockReset()

  listMembershipsForAccountMock.mockResolvedValue([]) // no memberships, unless a test overrides it
  resolveAccountForIdentityMock.mockResolvedValue({
    id: ELDRA_ACCOUNT_ID,
    displayName: 'Admin User',
    status: 'active'
  })
  listIdentitySubjectsForAccountMock.mockResolvedValue([])
  listPlatformGrantsMock.mockResolvedValue([]) // no platform grants, unless a test overrides it
  // No Eldra session cookie by default -- every EXISTING test below is a
  // Directus-session test and must fall through to that branch exactly
  // as before OIDC existed.
  getEldraSessionTokenMock.mockReturnValue('')
})

describe('resolvePrincipal', () => {
  it('returns null when there is no session token (unauthenticated caller)', async () => {
    getSessionTokenMock.mockReturnValue('')

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).toBeNull()
    expect(fetchDirectusMeMock).not.toHaveBeenCalled() // deny-by-default: no session, no Directus call at all
  })

  it('returns null when the session token is invalid or expired', async () => {
    getSessionTokenMock.mockReturnValue('stale-token')
    fetchDirectusMeMock.mockRejectedValue(new Error('401 from Directus'))

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).toBeNull()
  })

  it('returns null when Directus reports no user id', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue({})

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).toBeNull()
  })

  // ---------------------------------------------------------------------
  // PHASE 1: Eldra Account identity. These replace the old
  // "temporary single-user mode" tests, which asserted that an
  // authenticated Directus Administrator implicitly held every capability
  // everywhere.
  // ---------------------------------------------------------------------

  it('Principal.accountId is the ELDRA Account id, never the Directus user id', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.accountId).toBe(ELDRA_ACCOUNT_ID)
    expect(principal!.accountId).not.toBe('admin-account-1')
  })

  it('resolves the Account by (provider, provider_subject) only -- never by email or display name', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())

    await resolvePrincipal(fakeEvent)

    expect(resolveAccountForIdentityMock).toHaveBeenCalledTimes(1)
    const [input] = resolveAccountForIdentityMock.mock.calls[0]
    expect(input.provider).toBe('directus')
    expect(input.providerSubject).toBe('admin-account-1')
    // The display name is provisioning seed data, not a lookup key, and
    // there is no email field at all -- matching an Account by a mutable,
    // reassignable address is the takeover vector §6.2 rule 2 forbids.
    expect(Object.keys(input).sort()).toEqual(['displayName', 'provider', 'providerSubject'])
  })

  it('a Directus ADMIN with no Eldra platform grant holds NO platform capability -- Directus admin is not Eldra admin', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())
    listPlatformGrantsMock.mockResolvedValue([])

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.platformCapabilities.size).toBe(0)
    expect(can(principal, 'platform.breakglass.enter', { kind: 'platform' })).toBe(false)
    expect(can(principal, 'platform.settings.manage', { kind: 'platform' })).toBe(false)
    // ...and no World-scope fallback either.
    expect(can(principal, 'world.rules.activate', { kind: 'world', worldId: 'any-world' })).toBe(false)
  })

  it('an explicit Eldra platform grant is what confers platform capability -- and only the granted ones', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())
    listPlatformGrantsMock.mockResolvedValue(['platform.settings.manage', 'platform.world.list'])

    const principal = await resolvePrincipal(fakeEvent)

    expect(listPlatformGrantsMock).toHaveBeenCalledWith(ELDRA_ACCOUNT_ID)
    expect(can(principal, 'platform.settings.manage', { kind: 'platform' })).toBe(true)
    expect(can(principal, 'platform.world.list', { kind: 'platform' })).toBe(true)
    expect(can(principal, 'platform.world.delete', { kind: 'platform' })).toBe(false)
    // A platform grant is still not a World grant.
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'any-world' })).toBe(false)
  })

  it('a Directus NON-admin cannot acquire platform capability by authenticating -- grants are the only source', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser())
    listPlatformGrantsMock.mockResolvedValue([])

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.accountId).toBe(ELDRA_ACCOUNT_ID)
    expect(principal!.platformCapabilities.size).toBe(0)
    expect(can(principal, 'platform.settings.manage', { kind: 'platform' })).toBe(false)
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'any-world' })).toBe(false)
  })

  it('an unrecognized grant row is inert -- a hand-edited capability cannot widen the vocabulary', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())
    listPlatformGrantsMock.mockResolvedValue([
      'platform.settings.manage',
      'platform.everything',
      '*',
      'world.delete'
    ])

    const principal = await resolvePrincipal(fakeEvent)

    expect([...principal!.platformCapabilities]).toEqual(['platform.settings.manage'])
    expect(can(principal, 'platform.world.delete', { kind: 'platform' })).toBe(false)
  })

  it('a suspended Eldra Account is treated as unauthenticated even though Directus accepted the session', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())
    resolveAccountForIdentityMock.mockResolvedValue({
      id: ELDRA_ACCOUNT_ID,
      displayName: 'Suspended Admin',
      status: 'suspended'
    })

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).toBeNull()
  })

  it('memberships are looked up by the Eldra Account id AND every linked provider subject -- pre-Phase-1 rows still resolve', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser())
    listIdentitySubjectsForAccountMock.mockResolvedValue(['player-account-1'])
    listMembershipsForAccountMock.mockResolvedValue([
      // The row shape that exists in the live store today: keyed by the
      // DIRECTUS user id, written before Eldra Accounts existed.
      membership({ worldId: '4', accountId: 'player-account-1', role: 'player' })
    ])

    const principal = await resolvePrincipal(fakeEvent)

    expect(listMembershipsForAccountMock).toHaveBeenCalledWith([ELDRA_ACCOUNT_ID, 'player-account-1'])
    expect(principal!.accountLookupKeys).toEqual([ELDRA_ACCOUNT_ID, 'player-account-1'])
    // Same person, same role, same capabilities as before the account-id change.
    expect(can(principal, 'world.read', { kind: 'world', worldId: '4' })).toBe(true)
    expect(can(principal, 'world.character.create', { kind: 'world', worldId: '4' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: '4' })).toBe(false)
  })

  it('deduplicates the lookup keys', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser())
    listIdentitySubjectsForAccountMock.mockResolvedValue([ELDRA_ACCOUNT_ID, 'subject-a', 'subject-a'])

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal!.accountLookupKeys).toEqual([ELDRA_ACCOUNT_ID, 'subject-a'])
  })

  it('an authenticated account with no memberships resolves to a Principal with zero world capabilities', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser())
    listMembershipsForAccountMock.mockResolvedValue([])

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'any-world' })).toBe(false)
  })

  it('a membership row gets real world capabilities from it -- world capabilities populated', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser({ id: 'player-account-1' }))
    listMembershipsForAccountMock.mockResolvedValue([membership({ worldId: '5', accountId: ELDRA_ACCOUNT_ID, role: 'player' })])

    const principal = await resolvePrincipal(fakeEvent)

    expect(can(principal, 'world.read', { kind: 'world', worldId: '5' })).toBe(true)
    expect(can(principal, 'world.character.create', { kind: 'world', worldId: '5' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: '5' })).toBe(false) // player never gets this
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'some-other-world' })).toBe(false) // no membership there
  })

  it('a fully-granted platform administrator with a lesser membership is bound by it -- Platform Admin is not a world superuser', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser({ id: 'admin-account-1' }))
    listPlatformGrantsMock.mockResolvedValue(['platform.settings.manage', 'platform.world.delete'])
    listMembershipsForAccountMock.mockResolvedValue([membership({ worldId: '5', accountId: ELDRA_ACCOUNT_ID, role: 'observer' })])

    const principal = await resolvePrincipal(fakeEvent)

    // World 5 has an explicit (observer) membership -- it governs, full stop.
    expect(can(principal, 'world.read', { kind: 'world', worldId: '5' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: '5' })).toBe(false)
    expect(can(principal, 'world.rules.activate', { kind: 'world', worldId: '5' })).toBe(false)

    // PHASE 1 BEHAVIOR CHANGE: a World with no membership row used to fall
    // back to the admin bypass. It no longer does, for anyone.
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'unmigrated-world' })).toBe(false)
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'unmigrated-world' })).toBe(false)
  })

  // PHASE 1 BEHAVIOR CHANGE (authorization preflight, finding B). This test
  // previously asserted that a failed membership read "degrades to zero
  // world capabilities (never throws)". That looked safe and was not: an
  // empty capability map sent can()'s world branch into the admin
  // fallback, so a Directus outage WIDENED an administrator's access to
  // every World. A failed read and an empty result are different facts and
  // must not produce the same Principal.
  it('fails closed when membership data cannot be read -- never a Principal that reads as "no memberships"', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())
    listPlatformGrantsMock.mockResolvedValue(['platform.settings.manage'])
    listMembershipsForAccountMock.mockRejectedValue(new Error('collection does not exist yet'))

    await expect(resolvePrincipal(fakeEvent)).rejects.toThrow('collection does not exist yet')
  })

  it('fails closed when the Eldra Account itself cannot be resolved', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())
    resolveAccountForIdentityMock.mockRejectedValue(new Error('identity store unavailable'))

    await expect(resolvePrincipal(fakeEvent)).rejects.toThrow('identity store unavailable')
  })

  it('fails closed when platform grants cannot be read -- no silent demotion either', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())
    listPlatformGrantsMock.mockRejectedValue(new Error('grants unavailable'))

    await expect(resolvePrincipal(fakeEvent)).rejects.toThrow('grants unavailable')
  })
})

// ---------------------------------------------------------------------
// OIDC (this task): resolvePrincipal now resolves an Account from EITHER
// an Eldra-issued session OR a Directus one. These pin that the two
// branches are mutually exclusive (the Eldra-session branch, when a
// token is present, is checked FIRST and never falls through to
// Directus), and that an OIDC-authenticated Principal is built through
// the exact same path (accountLookupKeys, world/platform capabilities,
// buildPrincipal) as a Directus one -- proving OIDC authentication
// cannot bypass or shortcut Eldra's own authorization resolution.
// ---------------------------------------------------------------------

describe('resolvePrincipal -- Eldra-issued session (OIDC)', () => {
  it('resolves a Principal from an Eldra session token, never touching Directus at all', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-eldra-token')
    resolveEldraSessionMock.mockResolvedValue({ accountId: ELDRA_ACCOUNT_ID })
    getAccountByIdMock.mockResolvedValue({ id: ELDRA_ACCOUNT_ID, displayName: 'OIDC User', status: 'active' })
    listPlatformGrantsMock.mockResolvedValue(['platform.world.list'])

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.accountId).toBe(ELDRA_ACCOUNT_ID)
    expect(can(principal, 'platform.world.list', { kind: 'platform' })).toBe(true)
    expect(fetchDirectusMeMock).not.toHaveBeenCalled()
    expect(getSessionTokenMock).not.toHaveBeenCalled()
    expect(resolveAccountForIdentityMock).not.toHaveBeenCalled()
  })

  it('returns null for an invalid/expired/revoked Eldra session token -- fail closed, never falls through to Directus', async () => {
    getEldraSessionTokenMock.mockReturnValue('stale-or-revoked-token')
    resolveEldraSessionMock.mockResolvedValue(null)
    getSessionTokenMock.mockReturnValue('a-directus-token-that-must-be-ignored')

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).toBeNull()
    expect(fetchDirectusMeMock).not.toHaveBeenCalled()
  })

  it('returns null when the session resolves but its Account no longer exists', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-eldra-token')
    resolveEldraSessionMock.mockResolvedValue({ accountId: 'deleted-account' })
    getAccountByIdMock.mockResolvedValue(null)

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).toBeNull()
  })

  it('returns null for a suspended Account, even with a valid Eldra session token', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-eldra-token')
    resolveEldraSessionMock.mockResolvedValue({ accountId: ELDRA_ACCOUNT_ID })
    getAccountByIdMock.mockResolvedValue({ id: ELDRA_ACCOUNT_ID, displayName: 'X', status: 'suspended' })

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).toBeNull()
  })

  it('a first-login OIDC Account with no grants and no memberships holds zero capabilities -- never a default/elevated Principal', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-eldra-token')
    resolveEldraSessionMock.mockResolvedValue({ accountId: ELDRA_ACCOUNT_ID })
    getAccountByIdMock.mockResolvedValue({ id: ELDRA_ACCOUNT_ID, displayName: 'New OIDC User', status: 'active' })
    listPlatformGrantsMock.mockResolvedValue([])
    listMembershipsForAccountMock.mockResolvedValue([])

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.platformCapabilities.size).toBe(0)
    expect(can(principal, 'platform.settings.manage', { kind: 'platform' })).toBe(false)
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'any-world' })).toBe(false)
  })

  it('fails closed (propagates) when the Eldra session store itself cannot be read', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-eldra-token')
    resolveEldraSessionMock.mockRejectedValue(new Error('session store unavailable'))

    await expect(resolvePrincipal(fakeEvent)).rejects.toThrow('session store unavailable')
  })

  it('an EMPTY Eldra session token cookie falls through to the Directus branch, exactly like no cookie at all', async () => {
    getEldraSessionTokenMock.mockReturnValue('')
    getSessionTokenMock.mockReturnValue('a-real-directus-token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(resolveEldraSessionMock).not.toHaveBeenCalled()
    expect(fetchDirectusMeMock).toHaveBeenCalled()
  })
})

describe('resolvePrincipal -- Directus response envelope (regression)', () => {
  // Directus wraps single-item responses in `{ data: {...} }`. fetchDirectusMe
  // returns that envelope as-is; resolvePrincipal previously read `user.id`
  // directly on the STILL-WRAPPED object instead of `user.data.id`, so
  // `accountId` was always undefined and resolvePrincipal always returned
  // null for every real Directus response -- authenticated or not, expired
  // token or fresh. Every other consumer of this exact shape already
  // unwrapped it correctly (server/api/auth/login.post.ts's `me?.data || me`,
  // app/composables/useAuth.ts's `normalizeUser`), which is why this was a
  // resolvePrincipal-only defect. These two tests pin both the real shape
  // and the defensive fallback so this cannot silently regress again.
  it('unwraps a real Directus-shaped { data: {...} } response', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue({
      data: {
        id: 'account-wrapped',
        role: { policies: [{ policy: { admin_access: true } }] }
      }
    })

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    // The Directus subject inside the envelope is what gets read and
    // handed to the identity store; the Account id it maps to is what
    // lands on the Principal.
    expect(resolveAccountForIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubject: 'account-wrapped' })
    )
    expect(principal!.accountId).toBe(ELDRA_ACCOUNT_ID)
  })

  it('also tolerates an already-unwrapped response (defensive fallback, not the shape Directus actually sends)', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue({
      id: 'account-flat',
      role: { policies: [{ policy: { admin_access: true } }] }
    })

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(resolveAccountForIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubject: 'account-flat' })
    )
    expect(principal!.accountId).toBe(ELDRA_ACCOUNT_ID)
  })
})

describe('WORLD_ROLE_CAPABILITIES', () => {
  it('owner holds every world capability', () => {
    expect(WORLD_ROLE_CAPABILITIES.owner).toContain('world.delete')
    expect(WORLD_ROLE_CAPABILITIES.owner).toContain('world.transfer_ownership')
    expect(WORLD_ROLE_CAPABILITIES.owner).toContain('world.rules.activate')
  })

  it('gm holds everything except delete and transfer_ownership', () => {
    expect(WORLD_ROLE_CAPABILITIES.gm).not.toContain('world.delete')
    expect(WORLD_ROLE_CAPABILITIES.gm).not.toContain('world.transfer_ownership')
    expect(WORLD_ROLE_CAPABILITIES.gm).toContain('world.rules.activate')
    expect(WORLD_ROLE_CAPABILITIES.gm).toContain('world.character.approve')
  })

  it('worldbuilder holds content-authority capabilities but not table-authority ones', () => {
    expect(WORLD_ROLE_CAPABILITIES.worldbuilder).toContain('world.entity.edit')
    expect(WORLD_ROLE_CAPABILITIES.worldbuilder).toContain('world.map.edit')
    expect(WORLD_ROLE_CAPABILITIES.worldbuilder).not.toContain('world.rules.activate')
    expect(WORLD_ROLE_CAPABILITIES.worldbuilder).not.toContain('world.grant.issue')
    expect(WORLD_ROLE_CAPABILITIES.worldbuilder).not.toContain('world.roll.see_gm')
  })

  it('player can create/edit own characters and roll, nothing else', () => {
    expect(WORLD_ROLE_CAPABILITIES.player).toEqual(
      expect.arrayContaining(['world.read', 'world.character.create', 'world.character.edit_own', 'world.roll.execute'])
    )
    expect(WORLD_ROLE_CAPABILITIES.player).not.toContain('world.character.edit_any')
    expect(WORLD_ROLE_CAPABILITIES.player).not.toContain('world.entity.edit')
  })

  it('observer can only read', () => {
    expect(WORLD_ROLE_CAPABILITIES.observer).toEqual(['world.read'])
  })
})

describe('can', () => {
  it('denies every capability for a null principal -- deny-by-default', () => {
    expect(can(null, 'platform.account.manage', { kind: 'platform' })).toBe(false)
    expect(can(null, 'world.read', { kind: 'world', worldId: '1' })).toBe(false)
  })

  // PHASE 1 BEHAVIOR CHANGE: these two previously asserted that
  // `temporarySingleUserMode` granted every platform capability, and every
  // world capability on any World without a membership row. Both of those
  // implicit grants are gone -- platform capability comes only from
  // eldra_platform_grants, and World capability only from a membership row.
  it('platform capability comes only from explicitly granted capabilities', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(['platform.world.delete']),
      worldCapabilities: new Map(),
      accountLookupKeys: ['admin-1']
    }

    expect(can(principal, 'platform.world.delete', { kind: 'platform' })).toBe(true)
    expect(can(principal, 'platform.contentpack.install', { kind: 'platform' })).toBe(false)
  })

  it('there is no admin fallback for a World with no membership row -- not even for every platform capability at once', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set([
        'platform.settings.manage',
        'platform.world.create',
        'platform.world.list',
        'platform.world.delete',
        'platform.breakglass.enter'
      ]),
      worldCapabilities: new Map(), // no membership rows at all
      accountLookupKeys: ['admin-1']
    }

    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-a' })).toBe(false)
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'world-b' })).toBe(false)
  })

  it('owner can(): a real owner membership grants every world capability for that world', () => {
    const principal: Principal = {
      accountId: 'account-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['world-5', new Set(WORLD_ROLE_CAPABILITIES.owner)]]),
      accountLookupKeys: []
    }

    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-5' })).toBe(true)
    expect(can(principal, 'world.transfer_ownership', { kind: 'world', worldId: 'world-5' })).toBe(true)
    expect(can(principal, 'world.rules.activate', { kind: 'world', worldId: 'world-5' })).toBe(true)
  })

  it('player cannot(): a real player membership does not grant owner/gm-only capabilities', () => {
    const principal: Principal = {
      accountId: 'account-2',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['world-5', new Set(WORLD_ROLE_CAPABILITIES.player)]]),
      accountLookupKeys: []
    }

    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-5' })).toBe(false)
    expect(can(principal, 'world.rules.activate', { kind: 'world', worldId: 'world-5' })).toBe(false)
    expect(can(principal, 'world.member.invite', { kind: 'world', worldId: 'world-5' })).toBe(false)
    // but a Player's own capabilities still work
    expect(can(principal, 'world.character.create', { kind: 'world', worldId: 'world-5' })).toBe(true)
    expect(can(principal, 'world.roll.execute', { kind: 'world', worldId: 'world-5' })).toBe(true)
  })

  it('a real membership is authoritative for a platform administrator -- an admin bound to observer stays observer for that world', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(['platform.settings.manage', 'platform.world.delete']),
      worldCapabilities: new Map([['world-5', new Set(WORLD_ROLE_CAPABILITIES.observer)]]),
      accountLookupKeys: ['admin-1']
    }

    expect(can(principal, 'world.read', { kind: 'world', worldId: 'world-5' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-5' })).toBe(false)
    // PHASE 1: an unmigrated World no longer falls back -- it is closed.
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'other-world' })).toBe(false)
  })

  it('a powerless (non-admin, non-temporary) principal is denied every capability', () => {
    const principal: Principal = {
      accountId: 'player-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      accountLookupKeys: []
    }

    expect(can(principal, 'world.read', { kind: 'world', worldId: '1' })).toBe(false)
    expect(can(principal, 'platform.world.list', { kind: 'platform' })).toBe(false)
  })

  it('a principal with explicit world capabilities is granted only what it holds, per world', () => {
    const principal: Principal = {
      accountId: 'player-2',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['world-5', new Set(['world.read'])]]),
      accountLookupKeys: []
    }

    expect(can(principal, 'world.read', { kind: 'world', worldId: 'world-5' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-5' })).toBe(false)
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'other-world' })).toBe(false)
  })

  it('a principal with explicit platform capabilities is granted only what it holds', () => {
    const principal: Principal = {
      accountId: 'staff-1',
      platformCapabilities: new Set(['platform.world.list']),
      worldCapabilities: new Map(),
      accountLookupKeys: []
    }

    expect(can(principal, 'platform.world.list', { kind: 'platform' })).toBe(true)
    expect(can(principal, 'platform.world.delete', { kind: 'platform' })).toBe(false)
  })
})

describe('requireCapability', () => {
  it('throws 401 when there is no principal (unauthenticated)', () => {
    expectThrowsWithStatus(() => requireCapability(null, 'world.read', { kind: 'world', worldId: '1' }), 401)
  })

  it('throws 403 when the principal exists but lacks the capability', () => {
    const principal: Principal = {
      accountId: 'player-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      accountLookupKeys: []
    }

    expectThrowsWithStatus(() => requireCapability(principal, 'world.read', { kind: 'world', worldId: '1' }), 403)
  })

  it('does not throw when the principal holds the capability', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['1', new Set(WORLD_ROLE_CAPABILITIES.gm)]]),
      accountLookupKeys: ['admin-1']
    }

    expect(() => requireCapability(principal, 'world.rules.activate', { kind: 'world', worldId: '1' })).not.toThrow()
  })
})
