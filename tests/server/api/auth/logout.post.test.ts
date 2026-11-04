// Unit tests for POST /api/auth/logout (server/api/auth/logout.post.ts).
//
// Security review (OIDC architecture audit): logout now has to revoke/clear
// BOTH session kinds and never leave either in a usable state, regardless
// of which one (or neither, or a stale leftover from switching auth
// methods) authenticated the caller. This had no direct test coverage at
// all before this review -- see server/api/auth/me.get.test.ts's identical
// note on why (Nitro auto-imports under plain Vitest).
//
// h3's real getCookie/deleteCookie are exercised against a minimal
// in-memory cookie jar (same pattern as tests/server/utils/oidc-flow.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { directusRequestMock, getSessionTokenMock, clearEldraSessionCookieMock, getEldraSessionTokenMock, revokeEldraSessionMock } = vi.hoisted(() => ({
  directusRequestMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
  clearEldraSessionCookieMock: vi.fn(),
  getEldraSessionTokenMock: vi.fn(),
  revokeEldraSessionMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusRequest: directusRequestMock,
  getSessionToken: getSessionTokenMock
}))

vi.mock('../../../../server/utils/eldra-sessions', () => ({
  clearEldraSessionCookie: clearEldraSessionCookieMock,
  getEldraSessionToken: getEldraSessionTokenMock,
  revokeEldraSession: revokeEldraSessionMock
}))

import handler from '../../../../server/api/auth/logout.post'

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

function clearedCookieNames(event: H3Event): string[] {
  return setCookieEntries(event)
    .filter((entry) => entry.includes('='))
    .map((entry) => entry.split('=')[0])
}

beforeEach(() => {
  directusRequestMock.mockReset()
  getSessionTokenMock.mockReset()
  clearEldraSessionCookieMock.mockReset()
  getEldraSessionTokenMock.mockReset()
  revokeEldraSessionMock.mockReset()

  getSessionTokenMock.mockReturnValue('')
  getEldraSessionTokenMock.mockReturnValue('')
  directusRequestMock.mockResolvedValue({ ok: true })
})

describe('POST /api/auth/logout', () => {
  it('revokes and clears the OIDC session when its cookie is present', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')

    await handler(fakeEvent())

    expect(revokeEldraSessionMock).toHaveBeenCalledWith('raw-oidc-token')
    expect(clearEldraSessionCookieMock).toHaveBeenCalledWith(expect.anything())
  })

  it('still clears the OIDC cookie even when there was none to revoke', async () => {
    getEldraSessionTokenMock.mockReturnValue('')

    await handler(fakeEvent())

    expect(revokeEldraSessionMock).not.toHaveBeenCalled()
    expect(clearEldraSessionCookieMock).toHaveBeenCalledWith(expect.anything())
  })

  it('clears the Directus cookies regardless of which (or neither) session kind was active', async () => {
    const event = fakeEvent({ eldra_session: 'directus-token', eldra_refresh: 'refresh-token' })

    await handler(event)

    const cleared = clearedCookieNames(event)
    expect(cleared).toContain('eldra_session')
    expect(cleared).toContain('eldra_refresh')
  })

  it('attempts Directus /auth/logout with the refresh token, unauthenticated, when one is present', async () => {
    getSessionTokenMock.mockReturnValue('access-token-1')
    await handler(fakeEvent({ eldra_refresh: 'refresh-token-1' }))

    expect(directusRequestMock).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({
      method: 'POST',
      unauthenticated: true,
      headers: { Authorization: 'Bearer access-token-1' },
      body: { refresh_token: 'refresh-token-1' }
    }))
  })

  it('does not call Directus /auth/logout when there is no refresh token', async () => {
    await handler(fakeEvent())

    expect(directusRequestMock).not.toHaveBeenCalled()
  })

  it('still clears cookies and returns ok even when Directus /auth/logout itself fails', async () => {
    directusRequestMock.mockRejectedValue(new Error('Directus unreachable'))
    const event = fakeEvent({ eldra_refresh: 'refresh-token-1' })

    const result = await handler(event)

    expect(result).toEqual({ ok: true })
    expect(clearedCookieNames(event)).toContain('eldra_session')
  })

  it('both session kinds present: both get revoked/cleared -- logout never leaves either usable', async () => {
    getEldraSessionTokenMock.mockReturnValue('raw-oidc-token')
    const event = fakeEvent({ eldra_session: 'directus-token', eldra_refresh: 'refresh-token' })

    await handler(event)

    expect(revokeEldraSessionMock).toHaveBeenCalledWith('raw-oidc-token')
    expect(clearEldraSessionCookieMock).toHaveBeenCalled()
    const cleared = clearedCookieNames(event)
    expect(cleared).toContain('eldra_session')
    expect(cleared).toContain('eldra_refresh')
  })

  it('always returns { ok: true }', async () => {
    const result = await handler(fakeEvent())
    expect(result).toEqual({ ok: true })
  })
})
