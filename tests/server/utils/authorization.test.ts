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

const { fetchDirectusMeMock, getSessionTokenMock, listMembershipsForAccountMock } = vi.hoisted(() => ({
  fetchDirectusMeMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
  listMembershipsForAccountMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  fetchDirectusMe: fetchDirectusMeMock,
  getSessionToken: getSessionTokenMock
}))

vi.mock('../../../server/utils/world-memberships', () => ({
  listMembershipsForAccount: listMembershipsForAccountMock
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

beforeEach(() => {
  fetchDirectusMeMock.mockReset()
  getSessionTokenMock.mockReset()
  listMembershipsForAccountMock.mockReset()
  listMembershipsForAccountMock.mockResolvedValue([]) // no memberships, unless a test overrides it
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

  it('temporary single-user mode: an authenticated Directus admin with NO memberships still holds every capability (the migration-gap fallback)', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())
    listMembershipsForAccountMock.mockResolvedValue([])

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.accountId).toBe('admin-account-1')
    expect(principal!.temporarySingleUserMode).toBe(true)
    expect(can(principal, 'platform.breakglass.enter', { kind: 'platform' })).toBe(true)
    expect(can(principal, 'world.rules.activate', { kind: 'world', worldId: 'any-world' })).toBe(true)
  })

  it('an authenticated non-admin with no memberships resolves to a Principal with zero world capabilities', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser())
    listMembershipsForAccountMock.mockResolvedValue([])

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.accountId).toBe('player-account-1')
    expect(principal!.temporarySingleUserMode).toBe(false)
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'any-world' })).toBe(false)
  })

  it('a non-admin WITH a membership row gets real world capabilities from it -- world capabilities populated', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser({ id: 'player-account-1' }))
    listMembershipsForAccountMock.mockResolvedValue([membership({ worldId: '5', accountId: 'player-account-1', role: 'player' })])

    const principal = await resolvePrincipal(fakeEvent)

    expect(can(principal, 'world.read', { kind: 'world', worldId: '5' })).toBe(true)
    expect(can(principal, 'world.character.create', { kind: 'world', worldId: '5' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: '5' })).toBe(false) // player never gets this
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'some-other-world' })).toBe(false) // no membership there
  })

  it('an admin WITH a real (lesser) membership for a World is bound by it, not by admin status -- Platform Admin is not a world superuser', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser({ id: 'admin-account-1' }))
    listMembershipsForAccountMock.mockResolvedValue([membership({ worldId: '5', accountId: 'admin-account-1', role: 'observer' })])

    const principal = await resolvePrincipal(fakeEvent)

    // World 5 has an explicit (observer) membership -- it governs, full stop.
    expect(can(principal, 'world.read', { kind: 'world', worldId: '5' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: '5' })).toBe(false)
    expect(can(principal, 'world.rules.activate', { kind: 'world', worldId: '5' })).toBe(false)

    // A DIFFERENT World with no membership row at all still falls back to
    // the admin bypass -- the migration gap is per-World, not global.
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'unmigrated-world' })).toBe(true)
  })

  it('degrades to zero world capabilities (never throws) if the memberships collection cannot be read', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser())
    listMembershipsForAccountMock.mockRejectedValue(new Error('collection does not exist yet'))

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(can(principal, 'world.read', { kind: 'world', worldId: 'any-world' })).toBe(false)
  })

  it('admin_access carried directly on the user (not the role) is still recognized', async () => {
    // resolveAccessFlag checks policies on the user directly, policies on
    // the role, and the role's own flag (v10 fallback) -- exercising the
    // user-level policy path specifically here.
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue({
      id: 'admin-account-2',
      policies: [{ policy: { admin_access: true } }]
    })

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal!.temporarySingleUserMode).toBe(true)
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
    expect(principal!.accountId).toBe('account-wrapped')
    expect(principal!.temporarySingleUserMode).toBe(true)
  })

  it('also tolerates an already-unwrapped response (defensive fallback, not the shape Directus actually sends)', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue({
      id: 'account-flat',
      role: { policies: [{ policy: { admin_access: true } }] }
    })

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.accountId).toBe('account-flat')
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

  it('temporary single-user mode grants every platform capability', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: true
    }

    expect(can(principal, 'platform.world.delete', { kind: 'platform' })).toBe(true)
    expect(can(principal, 'platform.contentpack.install', { kind: 'platform' })).toBe(true)
  })

  it('temporary fallback still works: an admin with NO membership row for a World gets every world capability there', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(), // no membership rows at all -- the migration gap
      temporarySingleUserMode: true
    }

    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-a' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-b' })).toBe(true)
  })

  it('owner can(): a real owner membership grants every world capability for that world', () => {
    const principal: Principal = {
      accountId: 'account-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['world-5', new Set(WORLD_ROLE_CAPABILITIES.owner)]]),
      temporarySingleUserMode: false
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
      temporarySingleUserMode: false
    }

    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-5' })).toBe(false)
    expect(can(principal, 'world.rules.activate', { kind: 'world', worldId: 'world-5' })).toBe(false)
    expect(can(principal, 'world.member.invite', { kind: 'world', worldId: 'world-5' })).toBe(false)
    // but a Player's own capabilities still work
    expect(can(principal, 'world.character.create', { kind: 'world', worldId: 'world-5' })).toBe(true)
    expect(can(principal, 'world.roll.execute', { kind: 'world', worldId: 'world-5' })).toBe(true)
  })

  it('a real membership is authoritative even for temporarySingleUserMode -- an admin bound to observer stays observer for that world', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['world-5', new Set(WORLD_ROLE_CAPABILITIES.observer)]]),
      temporarySingleUserMode: true
    }

    expect(can(principal, 'world.read', { kind: 'world', worldId: 'world-5' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-5' })).toBe(false)
    // an UNMIGRATED world (no membership row) still falls back for this admin
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'other-world' })).toBe(true)
  })

  it('a powerless (non-admin, non-temporary) principal is denied every capability', () => {
    const principal: Principal = {
      accountId: 'player-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: false
    }

    expect(can(principal, 'world.read', { kind: 'world', worldId: '1' })).toBe(false)
    expect(can(principal, 'platform.world.list', { kind: 'platform' })).toBe(false)
  })

  it('a principal with explicit world capabilities is granted only what it holds, per world', () => {
    const principal: Principal = {
      accountId: 'player-2',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['world-5', new Set(['world.read'])]]),
      temporarySingleUserMode: false
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
      temporarySingleUserMode: false
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
      temporarySingleUserMode: false
    }

    expectThrowsWithStatus(() => requireCapability(principal, 'world.read', { kind: 'world', worldId: '1' }), 403)
  })

  it('does not throw when the principal holds the capability', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: true
    }

    expect(() => requireCapability(principal, 'world.rules.activate', { kind: 'world', worldId: '1' })).not.toThrow()
  })
})
