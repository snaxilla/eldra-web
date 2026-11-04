// Unit tests for POST /api/auth/login (server/api/auth/login.post.ts).
// See .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §5.3/§6.1/§10.3 and the Username Login task's own AUTHENTICATION/SERVER/
// ERROR HANDLING/REGRESSION sections.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports that do not
// exist under plain Vitest -- the established pattern in this repo (see
// tests/server/utils/rules-packages.test.ts) is to mock that module at the
// boundary rather than let it execute. resolveLoginEmail
// (server/utils/players.ts) is used FOR REAL, not mocked -- it is pure,
// and using it directly is what actually proves this route calls the one
// canonical implementation rather than a stand-in that could silently
// diverge from it.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const {
  directusRequestMock,
  setSessionCookiesMock,
  resolveAccountForIdentityMock,
  listPlatformGrantsMock,
  clearEldraSessionCookieMock,
  getEldraSessionTokenMock,
  revokeEldraSessionMock
} = vi.hoisted(() => ({
  directusRequestMock: vi.fn(),
  setSessionCookiesMock: vi.fn(),
  resolveAccountForIdentityMock: vi.fn(),
  listPlatformGrantsMock: vi.fn(),
  clearEldraSessionCookieMock: vi.fn(),
  getEldraSessionTokenMock: vi.fn(),
  revokeEldraSessionMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusRequest: directusRequestMock,
  setSessionCookies: setSessionCookiesMock,
  DIRECTUS_ME_FIELDS: 'id,email,first_name,last_name,role.id,role.name'
}))

// Phase 1: the route now also resolves the Eldra Account behind the
// Directus session and returns its explicit platform grants, so the
// browser's `isAdmin` reads the same source the server enforces. Mocked at
// the module boundary like every other store this test does not exercise.
vi.mock('../../../../server/utils/eldra-accounts', () => ({
  resolveAccountForIdentity: resolveAccountForIdentityMock,
  listPlatformGrants: listPlatformGrantsMock
}))

// Session-precedence task: a successful Directus login now also displaces
// any existing Eldra-issued OIDC session, mocked at the module boundary
// like every other store this test does not otherwise exercise.
vi.mock('../../../../server/utils/eldra-sessions', () => ({
  clearEldraSessionCookie: clearEldraSessionCookieMock,
  getEldraSessionToken: getEldraSessionTokenMock,
  revokeEldraSession: revokeEldraSessionMock
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

import handler from '../../../../server/api/auth/login.post'

function fakeEvent(body: unknown): H3Event {
  return {
    context: {},
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

function directusLoginSuccess(accessToken = 'access-token-1', refreshToken = 'refresh-token-1') {
  return { data: { access_token: accessToken, refresh_token: refreshToken } }
}

const ELDRA_ACCOUNT_ID = 'eldra-account-0001'

beforeEach(() => {
  directusRequestMock.mockReset()
  setSessionCookiesMock.mockReset()
  resolveAccountForIdentityMock.mockReset()
  listPlatformGrantsMock.mockReset()
  clearEldraSessionCookieMock.mockReset()
  getEldraSessionTokenMock.mockReset()
  revokeEldraSessionMock.mockReset()

  resolveAccountForIdentityMock.mockResolvedValue({
    id: ELDRA_ACCOUNT_ID,
    displayName: 'Admin User',
    status: 'active'
  })
  listPlatformGrantsMock.mockResolvedValue([])
  getEldraSessionTokenMock.mockReturnValue('')
})

describe('POST /api/auth/login', () => {
  it('rejects a request missing an identifier or password with 400', async () => {
    await expect(handler(fakeEvent({ password: 'x' }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(handler(fakeEvent({ username: 'silverhand' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(directusRequestMock).not.toHaveBeenCalled()
  })

  it('username login succeeds: a bare username is resolved to its synthesized email before reaching Directus', async () => {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return directusLoginSuccess()
      return { data: { id: 'account-1', email: 'silverhand@players.eldra.app', first_name: 'V' } }
    })

    const result = await handler(fakeEvent({ username: 'silverhand', password: 'longenough1' }))

    const loginCall = directusRequestMock.mock.calls.find(([path]) => path === '/auth/login')
    expect(loginCall?.[1].body).toEqual({ email: 'silverhand@players.eldra.app', password: 'longenough1' })
    expect(setSessionCookiesMock).toHaveBeenCalledWith(expect.anything(), 'access-token-1', 'refresh-token-1')
    expect(result).toEqual({
      ok: true,
      user: { id: 'account-1', email: 'silverhand@players.eldra.app', first_name: 'V' },
      // Phase 1: the Eldra Account id, NOT the Directus user id in `user`.
      accountId: ELDRA_ACCOUNT_ID,
      platformCapabilities: []
    })
  })

  it('email login still succeeds: an identifier containing "@" is passed through unchanged -- existing administrators are unaffected', async () => {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return directusLoginSuccess()
      return { data: { id: 'admin-1', email: 'admin@example.com' } }
    })

    await handler(fakeEvent({ username: 'admin@example.com', password: 'adminpass1' }))

    const loginCall = directusRequestMock.mock.calls.find(([path]) => path === '/auth/login')
    expect(loginCall?.[1].body).toEqual({ email: 'admin@example.com', password: 'adminpass1' })
  })

  it('also accepts a literal `email` body field, for defensive backward compatibility', async () => {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return directusLoginSuccess()
      return { data: { id: 'admin-1', email: 'admin@example.com' } }
    })

    await handler(fakeEvent({ email: 'admin@example.com', password: 'adminpass1' }))

    const loginCall = directusRequestMock.mock.calls.find(([path]) => path === '/auth/login')
    expect(loginCall?.[1].body).toEqual({ email: 'admin@example.com', password: 'adminpass1' })
  })

  it('an unknown username is rejected exactly like an unknown email always was -- Directus\'s own rejection propagates uncaught', async () => {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') {
        const error: any = new Error('Invalid user credentials.')
        error.statusCode = 401
        error.data = { errors: [{ message: 'Invalid user credentials.', extensions: { code: 'INVALID_CREDENTIALS' } }] }
        throw error
      }
      throw new Error('should not fetch /users/me when login itself failed')
    })

    await expect(handler(fakeEvent({ username: 'no-such-user', password: 'whatever1' }))).rejects.toMatchObject({
      statusCode: 401
    })
    expect(setSessionCookiesMock).not.toHaveBeenCalled()
  })

  it('an incorrect password is rejected the same way, regardless of whether the identifier was a username or an email', async () => {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') {
        const error: any = new Error('Invalid user credentials.')
        error.statusCode = 401
        throw error
      }
      throw new Error('should not fetch /users/me')
    })

    await expect(handler(fakeEvent({ username: 'silverhand', password: 'wrongpassword' }))).rejects.toMatchObject({
      statusCode: 401
    })
    await expect(handler(fakeEvent({ username: 'admin@example.com', password: 'wrongpassword' }))).rejects.toMatchObject({
      statusCode: 401
    })
  })

  it('a player created through Eldra (createPlayer\'s exact synthesized-email shape) can immediately log in with their username', async () => {
    // The same email createPlayer would have written for username
    // "newplayer" -- proving resolveLoginEmail and createPlayer's own
    // usernameToEmail agree, since both are the same function.
    directusRequestMock.mockImplementation(async (path: string, options: any) => {
      if (path === '/auth/login') {
        expect(options.body.email).toBe('newplayer@players.eldra.app')
        return directusLoginSuccess()
      }
      return { data: { id: 'new-account', email: 'newplayer@players.eldra.app', first_name: 'New' } }
    })

    const result = await handler(fakeEvent({ username: 'NewPlayer', password: 'freshpassword1' }))

    expect(result).toEqual({
      ok: true,
      user: { id: 'new-account', email: 'newplayer@players.eldra.app', first_name: 'New' },
      accountId: ELDRA_ACCOUNT_ID,
      platformCapabilities: []
    })
  })

  it('throws 401 when Directus returns no access token, without setting any cookies', async () => {
    directusRequestMock.mockResolvedValue({ data: {} })

    await expect(handler(fakeEvent({ username: 'silverhand', password: 'longenough1' }))).rejects.toMatchObject({
      statusCode: 401
    })
    expect(setSessionCookiesMock).not.toHaveBeenCalled()
  })

  it('session refresh mechanics are untouched: the refresh_token Directus returns is still captured and handed to setSessionCookies', async () => {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return directusLoginSuccess('access-xyz', 'refresh-xyz')
      return { data: { id: 'account-1' } }
    })

    await handler(fakeEvent({ username: 'silverhand', password: 'longenough1' }))

    expect(setSessionCookiesMock).toHaveBeenCalledWith(expect.anything(), 'access-xyz', 'refresh-xyz')
  })
})

// ---------------------------------------------------------------------------
// COOKIE ORDERING (deployment blocker).
//
// setSessionCookies used to run immediately after Directus accepted the
// password, before any Eldra resolution. A failure in the identity store or
// the grant read then returned an error WITH a valid `eldra_session`
// already set -- after which /api/auth/me stopped short-circuiting on "no
// cookie", started failing the same way, and took every unguarded
// `await fetchMe()` down with it during SSR, including the one on /login.
// The user had no in-app route back.
//
// These pin the invariant that fixes it: no required resolution failure may
// leave a cookie behind.
// ---------------------------------------------------------------------------

describe('POST /api/auth/login -- session cookies are set only after every required resolution succeeds', () => {
  function directusAuthenticates() {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return directusLoginSuccess()
      return { data: { id: 'account-1', email: 'sam@example.com', first_name: 'Sam' } }
    })
  }

  it('sets NO cookie when the Eldra Account cannot be resolved', async () => {
    directusAuthenticates()
    resolveAccountForIdentityMock.mockRejectedValue(
      Object.assign(new Error('Identity store unavailable'), { statusCode: 503 })
    )

    await expect(handler(fakeEvent({ username: 'sam', password: 'pw' }))).rejects.toMatchObject({
      statusCode: 503
    })

    expect(setSessionCookiesMock).not.toHaveBeenCalled()
  })

  it('sets NO cookie when the platform-grant read fails', async () => {
    directusAuthenticates()
    listPlatformGrantsMock.mockRejectedValue(
      Object.assign(new Error('Identity store unavailable'), { statusCode: 503 })
    )

    await expect(handler(fakeEvent({ username: 'sam', password: 'pw' }))).rejects.toMatchObject({
      statusCode: 503
    })

    expect(setSessionCookiesMock).not.toHaveBeenCalled()
  })

  it('sets NO cookie when the post-login /users/me read fails', async () => {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return directusLoginSuccess()
      throw Object.assign(new Error('Directus unavailable'), { statusCode: 502 })
    })

    await expect(handler(fakeEvent({ username: 'sam', password: 'pw' }))).rejects.toMatchObject({
      statusCode: 502
    })

    expect(setSessionCookiesMock).not.toHaveBeenCalled()
  })

  it('still sets no cookie when Directus rejects the password (unchanged behaviour)', async () => {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return { data: {} } // no access_token
      return {}
    })

    await expect(handler(fakeEvent({ username: 'sam', password: 'wrong' }))).rejects.toMatchObject({
      statusCode: 401
    })

    expect(setSessionCookiesMock).not.toHaveBeenCalled()
  })

  it('a successful login still sets both tokens -- and does so only after resolution completed', async () => {
    const order: string[] = []

    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return directusLoginSuccess('access-1', 'refresh-1')
      order.push('users/me')
      return { data: { id: 'account-1', email: 'sam@example.com', first_name: 'Sam' } }
    })
    resolveAccountForIdentityMock.mockImplementation(async () => {
      order.push('resolveAccount')
      return { id: ELDRA_ACCOUNT_ID, displayName: 'Sam', status: 'active' }
    })
    listPlatformGrantsMock.mockImplementation(async () => {
      order.push('listGrants')
      return ['platform.settings.manage']
    })
    setSessionCookiesMock.mockImplementation(() => {
      order.push('setCookies')
    })

    const result = await handler(fakeEvent({ username: 'sam', password: 'pw' }))

    expect(setSessionCookiesMock).toHaveBeenCalledWith(expect.anything(), 'access-1', 'refresh-1')
    expect(order).toEqual(['users/me', 'resolveAccount', 'listGrants', 'setCookies'])
    expect(result).toMatchObject({
      ok: true,
      accountId: ELDRA_ACCOUNT_ID,
      platformCapabilities: ['platform.settings.manage']
    })
  })
})

// ONE ACTIVE LOGIN SESSION PER BROWSER (session-precedence task): a
// successful Directus login displaces any Eldra-issued OIDC session this
// browser was also carrying, symmetric to
// server/api/auth/oidc/callback.get.ts's own displacement of a Directus
// session on a successful OIDC login. Neither side's displacement runs
// for a FAILED login (both tested below), and the account-linking flow
// (server/api/auth/oidc/link.get.ts / callback.get.ts's link branch) is
// untouched by this task and still never revokes or clears anything.
describe('POST /api/auth/login -- displaces an existing Eldra OIDC session', () => {
  function directusAuthenticates() {
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return directusLoginSuccess()
      return { data: { id: 'account-1', email: 'sam@example.com', first_name: 'Sam' } }
    })
  }

  it('revokes and clears an existing OIDC session when one is present, before setting the new Directus cookie', async () => {
    directusAuthenticates()
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')
    const order: string[] = []
    revokeEldraSessionMock.mockImplementation(async () => { order.push('revokeOidc') })
    clearEldraSessionCookieMock.mockImplementation(() => { order.push('clearOidc') })
    setSessionCookiesMock.mockImplementation(() => { order.push('setDirectusCookies') })

    await handler(fakeEvent({ username: 'sam', password: 'pw' }))

    expect(revokeEldraSessionMock).toHaveBeenCalledWith('raw-oidc-token')
    expect(clearEldraSessionCookieMock).toHaveBeenCalledWith(expect.anything())
    expect(order).toEqual(['revokeOidc', 'clearOidc', 'setDirectusCookies'])
  })

  it('does not call revokeEldraSession when there was no OIDC session to begin with, but still clears the cookie defensively', async () => {
    directusAuthenticates()
    getEldraSessionTokenMock.mockReturnValue('')

    await handler(fakeEvent({ username: 'sam', password: 'pw' }))

    expect(revokeEldraSessionMock).not.toHaveBeenCalled()
    expect(clearEldraSessionCookieMock).toHaveBeenCalledWith(expect.anything())
  })

  it('an Eldra session-store failure while revoking does not turn this successful Directus login into a failed one', async () => {
    directusAuthenticates()
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')
    revokeEldraSessionMock.mockRejectedValue(Object.assign(new Error('Session store unavailable'), { statusCode: 503 }))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await handler(fakeEvent({ username: 'sam', password: 'pw' }))

    expect(result).toMatchObject({ ok: true, accountId: ELDRA_ACCOUNT_ID })
    expect(setSessionCookiesMock).toHaveBeenCalled()
    expect(clearEldraSessionCookieMock).toHaveBeenCalled()
    expect(logged).toHaveBeenCalled() // the detail goes to the server log, not the response
    logged.mockRestore()
  })

  it('does NOT revoke or clear an existing OIDC session when the login fails (bad credentials)', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')
    directusRequestMock.mockImplementation(async (path: string) => {
      if (path === '/auth/login') {
        throw Object.assign(new Error('Invalid user credentials.'), { statusCode: 401 })
      }
      throw new Error('should not fetch /users/me when login itself failed')
    })

    await expect(handler(fakeEvent({ username: 'sam', password: 'wrong' }))).rejects.toMatchObject({ statusCode: 401 })

    expect(revokeEldraSessionMock).not.toHaveBeenCalled()
    expect(clearEldraSessionCookieMock).not.toHaveBeenCalled()
  })

  it('does NOT revoke or clear an existing OIDC session when a later required resolution step fails', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')
    directusAuthenticates()
    resolveAccountForIdentityMock.mockRejectedValue(Object.assign(new Error('Identity store unavailable'), { statusCode: 503 }))

    await expect(handler(fakeEvent({ username: 'sam', password: 'pw' }))).rejects.toMatchObject({ statusCode: 503 })

    expect(revokeEldraSessionMock).not.toHaveBeenCalled()
    expect(clearEldraSessionCookieMock).not.toHaveBeenCalled()
    expect(setSessionCookiesMock).not.toHaveBeenCalled()
  })
})
