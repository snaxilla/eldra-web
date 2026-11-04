// Unit tests for GET /api/auth/me (server/api/auth/me.get.ts). Public --
// resolves identity itself rather than reading event.context.principal.
//
// Security review (OIDC architecture audit): this route duplicates
// server/utils/authorization.ts's resolveAuthenticatedAccount session-
// precedence logic (OIDC checked first, never falling through to Directus)
// rather than calling it directly, because it additionally clears a
// bad/expired OIDC cookie. That duplication had NO direct test coverage at
// all before this review -- the route relied on Nitro auto-imports for
// getCookie/deleteCookie/defineEventHandler, which do not exist under plain
// Vitest. Explicit h3 imports (this task) make it testable; everything
// else about the route is unchanged.
//
// h3's real getCookie/deleteCookie are exercised against a minimal
// in-memory cookie jar (same pattern as tests/server/utils/oidc-flow.test.ts),
// since the plain-Directus branch below reads/clears 'eldra_session'/
// 'eldra_refresh' directly.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const {
  fetchDirectusMeMock,
  getAccountByIdMock,
  listPlatformGrantsMock,
  resolveAccountForIdentityMock,
  clearEldraSessionCookieMock,
  getEldraSessionTokenMock,
  resolveEldraSessionMock
} = vi.hoisted(() => ({
  fetchDirectusMeMock: vi.fn(),
  getAccountByIdMock: vi.fn(),
  listPlatformGrantsMock: vi.fn(),
  resolveAccountForIdentityMock: vi.fn(),
  clearEldraSessionCookieMock: vi.fn(),
  getEldraSessionTokenMock: vi.fn(),
  resolveEldraSessionMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  fetchDirectusMe: fetchDirectusMeMock
}))

vi.mock('../../../../server/utils/eldra-accounts', () => ({
  getAccountById: getAccountByIdMock,
  listPlatformGrants: listPlatformGrantsMock,
  resolveAccountForIdentity: resolveAccountForIdentityMock
}))

vi.mock('../../../../server/utils/eldra-sessions', () => ({
  clearEldraSessionCookie: clearEldraSessionCookieMock,
  getEldraSessionToken: getEldraSessionTokenMock,
  resolveEldraSession: resolveEldraSessionMock
}))

import handler from '../../../../server/api/auth/me.get'

// Same minimal Node ServerResponse stand-in tests/server/utils/oidc-flow.test.ts
// uses -- verified there against h3's actual getCookie/setCookie/deleteCookie
// internals.
function fakeEvent(requestCookies: Record<string, string> = {}): H3Event {
  const cookieHeader = Object.entries(requestCookies)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('; ')

  const responseHeaders: Record<string, any> = {}

  return {
    node: {
      req: { headers: { cookie: cookieHeader } },
      res: {
        getHeader: (name: string) => responseHeaders[name.toLowerCase()],
        setHeader: (name: string, value: any) => {
          responseHeaders[name.toLowerCase()] = value
        },
        removeHeader: (name: string) => {
          delete responseHeaders[name.toLowerCase()]
        },
        appendHeader: (name: string, value: any) => {
          const key = name.toLowerCase()
          const current = responseHeaders[key]
          responseHeaders[key] = current === undefined ? value : [...(Array.isArray(current) ? current : [current]), value]
        }
      }
    },
    context: {}
  } as unknown as H3Event
}

function setCookieEntries(event: H3Event): string[] {
  const header = (event as any).node.res.getHeader('set-cookie')
  if (!header) return []
  return Array.isArray(header) ? header : [header]
}

beforeEach(() => {
  fetchDirectusMeMock.mockReset()
  getAccountByIdMock.mockReset()
  listPlatformGrantsMock.mockReset()
  resolveAccountForIdentityMock.mockReset()
  clearEldraSessionCookieMock.mockReset()
  getEldraSessionTokenMock.mockReset()
  resolveEldraSessionMock.mockReset()

  getEldraSessionTokenMock.mockReturnValue('')
})

describe('GET /api/auth/me -- Eldra-issued (OIDC) session, checked first', () => {
  it('resolves an authenticated OIDC account without ever calling fetchDirectusMe', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')
    resolveEldraSessionMock.mockResolvedValue({ accountId: 'account-1' })
    getAccountByIdMock.mockResolvedValue({ id: 'account-1', displayName: 'Jane Doe', status: 'active' })
    listPlatformGrantsMock.mockResolvedValue(['platform.world.list'])

    const result = await handler(fakeEvent())

    expect(result).toEqual({
      authenticated: true,
      user: { email: 'Jane Doe' },
      accountId: 'account-1',
      platformCapabilities: ['platform.world.list']
    })
    expect(fetchDirectusMeMock).not.toHaveBeenCalled()
  })

  it('never returns a raw OIDC token, provider claim, or secret -- only the Account\'s own display name', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')
    resolveEldraSessionMock.mockResolvedValue({ accountId: 'account-1' })
    getAccountByIdMock.mockResolvedValue({ id: 'account-1', displayName: 'Jane Doe', status: 'active' })
    listPlatformGrantsMock.mockResolvedValue([])

    const result = await handler(fakeEvent())

    expect(JSON.stringify(result)).not.toContain('raw-oidc-token')
  })

  it('clears the OIDC cookie and reports unauthenticated for an invalid/expired/revoked token -- never falls through to Directus', async () => {
    getEldraSessionTokenMock.mockReturnValue('stale-token')
    resolveEldraSessionMock.mockResolvedValue(null)

    const result = await handler(fakeEvent({ eldra_session: 'a-directus-token-that-must-be-ignored' }))

    expect(result).toEqual({ authenticated: false, user: null, accountId: null, platformCapabilities: [] })
    expect(clearEldraSessionCookieMock).toHaveBeenCalledWith(expect.anything())
    expect(fetchDirectusMeMock).not.toHaveBeenCalled()
  })

  it('clears the OIDC cookie and reports unauthenticated for a suspended Account, even with a resolvable session', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')
    resolveEldraSessionMock.mockResolvedValue({ accountId: 'account-1' })
    getAccountByIdMock.mockResolvedValue({ id: 'account-1', displayName: 'Jane Doe', status: 'suspended' })

    const result = await handler(fakeEvent())

    expect(result.authenticated).toBe(false)
    expect(clearEldraSessionCookieMock).toHaveBeenCalled()
  })

  it('an EMPTY OIDC token cookie falls through to the Directus branch, exactly like no cookie at all', async () => {
    getEldraSessionTokenMock.mockReturnValue('')

    const result = await handler(fakeEvent())

    expect(result).toEqual({ authenticated: false, user: null, accountId: null, platformCapabilities: [] })
    expect(resolveEldraSessionMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/auth/me -- Directus session (unchanged behaviour)', () => {
  // Login-latency investigation (no unnecessary Directus call when
  // logged out). A fresh, cookie-less visitor opening the login page
  // calls this route (app/composables/useAuth.ts's fetchMe, from
  // app/middleware/auth.ts and app/pages/login.vue) -- this pins that it
  // short-circuits before ever reaching Directus or the Eldra session
  // store, rather than merely returning the right JSON shape by
  // coincidence while still paying for a call behind the scenes.
  it('reports unauthenticated with no eldra_session cookie at all, WITHOUT calling Directus session validation or the Eldra session store', async () => {
    const result = await handler(fakeEvent())

    expect(result).toEqual({ authenticated: false, user: null, accountId: null, platformCapabilities: [] })
    expect(fetchDirectusMeMock).not.toHaveBeenCalled()
    expect(resolveEldraSessionMock).not.toHaveBeenCalled()
    expect(getAccountByIdMock).not.toHaveBeenCalled()
    expect(resolveAccountForIdentityMock).not.toHaveBeenCalled()
  })

  it('clears both Directus cookies and reports unauthenticated when the session token is rejected', async () => {
    fetchDirectusMeMock.mockRejectedValue(new Error('invalid token'))
    const event = fakeEvent({ eldra_session: 'bad-token' })

    const result = await handler(event)

    expect(result).toEqual({ authenticated: false, user: null, accountId: null, platformCapabilities: [] })
    const cleared = setCookieEntries(event)
    expect(cleared.some((entry) => entry.startsWith('eldra_session=;'))).toBe(true)
    expect(cleared.some((entry) => entry.startsWith('eldra_refresh=;'))).toBe(true)
  })

  it('resolves the Eldra Account and platform grants for a valid Directus session', async () => {
    fetchDirectusMeMock.mockResolvedValue({ data: { id: 'directus-user-1', email: 'admin@example.com' } })
    resolveAccountForIdentityMock.mockResolvedValue({ id: 'account-9', displayName: 'Admin', status: 'active' })
    listPlatformGrantsMock.mockResolvedValue(['platform.settings.manage'])

    const result = await handler(fakeEvent({ eldra_session: 'good-token' }))

    expect(result).toMatchObject({
      authenticated: true,
      accountId: 'account-9',
      platformCapabilities: ['platform.settings.manage']
    })
    expect(resolveAccountForIdentityMock).toHaveBeenCalledWith({
      provider: 'directus',
      providerSubject: 'directus-user-1',
      displayName: expect.anything()
    })
  })

  it('does NOT clear cookies when the Account/grant read fails after a valid session -- fails loudly instead of signing out', async () => {
    fetchDirectusMeMock.mockResolvedValue({ data: { id: 'directus-user-1', email: 'admin@example.com' } })
    resolveAccountForIdentityMock.mockRejectedValue(Object.assign(new Error('Identity store unavailable'), { statusCode: 503 }))
    const event = fakeEvent({ eldra_session: 'good-token' })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })

    expect(setCookieEntries(event)).toHaveLength(0)
  })
})
