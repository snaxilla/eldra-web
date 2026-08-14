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

const { directusRequestMock, setSessionCookiesMock } = vi.hoisted(() => ({
  directusRequestMock: vi.fn(),
  setSessionCookiesMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusRequest: directusRequestMock,
  setSessionCookies: setSessionCookiesMock,
  DIRECTUS_ME_FIELDS: 'id,email,first_name,last_name,role.id,role.name'
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

beforeEach(() => {
  directusRequestMock.mockReset()
  setSessionCookiesMock.mockReset()
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
    expect(result).toEqual({ ok: true, user: { id: 'account-1', email: 'silverhand@players.eldra.app', first_name: 'V' } })
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

    expect(result).toEqual({ ok: true, user: { id: 'new-account', email: 'newplayer@players.eldra.app', first_name: 'New' } })
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
