// Unit tests for the Phase 0 authorization skeleton
// (server/utils/authorization.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §9
// (Authorization) and §12 Phase 0 for the design under test.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports
// (useRuntimeConfig, createError, getCookie) that do not exist under plain
// Vitest -- the established pattern in this repo (see
// tests/server/utils/rules-packages.test.ts) is to mock that module at the
// boundary rather than let it execute. resolvePrincipal's own logic is what
// is under test here, not Directus's HTTP behavior.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchDirectusMeMock, getSessionTokenMock } = vi.hoisted(() => ({
  fetchDirectusMeMock: vi.fn(),
  getSessionTokenMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  fetchDirectusMe: fetchDirectusMeMock,
  getSessionToken: getSessionTokenMock
}))

import { can, requireCapability, resolvePrincipal, type Principal } from '../../../server/utils/authorization'

// resolvePrincipal only ever threads its `event` argument through to the
// (mocked) getSessionToken/fetchDirectusMe -- it never reads anything off
// it directly, so an empty object stands in for a real H3Event here.
const fakeEvent = {} as any

function directusAdminUser(overrides: Record<string, any> = {}) {
  return {
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

function directusNonAdminUser(overrides: Record<string, any> = {}) {
  return {
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

  it('temporary single-user mode: an authenticated Directus admin resolves to a Principal that holds every capability', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusAdminUser())

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.accountId).toBe('admin-account-1')
    expect(principal!.temporarySingleUserMode).toBe(true)
    // The one effective administrator holds every capability, at every
    // scope -- verified through can(), not by inspecting internal sets,
    // since temporarySingleUserMode is what can() actually reads.
    expect(can(principal, 'platform.breakglass.enter', { kind: 'platform' })).toBe(true)
    expect(can(principal, 'world.rules.activate', { kind: 'world', worldId: 'any-world' })).toBe(true)
  })

  it('an authenticated non-admin resolves to a powerless Principal, never null', async () => {
    getSessionTokenMock.mockReturnValue('token')
    fetchDirectusMeMock.mockResolvedValue(directusNonAdminUser())

    const principal = await resolvePrincipal(fakeEvent)

    expect(principal).not.toBeNull()
    expect(principal!.accountId).toBe('player-account-1')
    expect(principal!.temporarySingleUserMode).toBe(false)
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

  it('temporary single-user mode grants every world capability at any world id, with no membership rows', () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(), // deliberately empty -- see authorization.ts comment
      temporarySingleUserMode: true
    }

    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-a' })).toBe(true)
    expect(can(principal, 'world.delete', { kind: 'world', worldId: 'world-b' })).toBe(true)
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

  it('a principal with explicit world capabilities (the Phase 2 shape) is granted only what it holds, per world', () => {
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
