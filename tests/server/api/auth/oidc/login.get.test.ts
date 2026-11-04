// Unit tests for GET /api/auth/oidc/login (server/api/auth/oidc/login.get.ts).
// Public -- starts a 'login' flow for a visitor with no Eldra session at
// all. buildAuthorizationRequest/setOidcFlowCookie are mocked at the
// module boundary; this file is about THIS route's own glue: configured
// gate, redirect-target validation, and the exact flow-state shape it
// hands to the cookie.
//
// h3's getQuery reads `event.path` (ufo), not a real Node request --
// see tests/server/api/accounts/search.get.test.ts's own fakeEvent for
// the precedent. sendRedirect DOES need a real res to write a Location
// header against, so it is the one h3 export this file overrides,
// keeping everything else from the real module (same partial-mock shape
// tests/server/api/auth/login.post.test.ts already uses for readBody).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { isOidcConfiguredMock, buildAuthorizationRequestMock, setOidcFlowCookieMock, sendRedirectMock } = vi.hoisted(() => ({
  isOidcConfiguredMock: vi.fn(),
  buildAuthorizationRequestMock: vi.fn(),
  setOidcFlowCookieMock: vi.fn(),
  sendRedirectMock: vi.fn()
}))

vi.mock('../../../../../server/utils/oidc', () => ({
  isOidcConfigured: isOidcConfiguredMock,
  buildAuthorizationRequest: buildAuthorizationRequestMock
}))

vi.mock('../../../../../server/utils/oidc-flow', () => ({
  setOidcFlowCookie: setOidcFlowCookieMock
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, sendRedirect: sendRedirectMock }
})

import handler from '../../../../../server/api/auth/oidc/login.get'

function fakeEvent(query: Record<string, string> = {}): H3Event {
  const search = new URLSearchParams(query).toString()
  return { path: `/api/auth/oidc/login${search ? `?${search}` : ''}` } as unknown as H3Event
}

const AUTH_REQUEST = {
  authorizationUrl: 'https://idp.example.com/authorize?x=1',
  codeVerifier: 'verifier-1',
  state: 'state-1',
  nonce: 'nonce-1'
}

beforeEach(() => {
  isOidcConfiguredMock.mockReset()
  buildAuthorizationRequestMock.mockReset()
  setOidcFlowCookieMock.mockReset()
  sendRedirectMock.mockReset()

  isOidcConfiguredMock.mockReturnValue(true)
  buildAuthorizationRequestMock.mockResolvedValue(AUTH_REQUEST)
})

describe('GET /api/auth/oidc/login', () => {
  it('returns 404 rather than starting a flow when OIDC is not configured', async () => {
    isOidcConfiguredMock.mockReturnValue(false)

    await expect(handler(fakeEvent())).rejects.toMatchObject({ statusCode: 404 })

    expect(buildAuthorizationRequestMock).not.toHaveBeenCalled()
    expect(setOidcFlowCookieMock).not.toHaveBeenCalled()
  })

  it('writes a kind:login flow cookie with the PKCE/state/nonce from buildAuthorizationRequest, with no redirect target', async () => {
    await handler(fakeEvent())

    expect(setOidcFlowCookieMock).toHaveBeenCalledWith(expect.anything(), {
      codeVerifier: 'verifier-1',
      state: 'state-1',
      nonce: 'nonce-1',
      kind: 'login',
      redirect: null,
      initiatingAccountId: null
    })
  })

  it('redirects the browser to the authorization URL', async () => {
    await handler(fakeEvent())

    expect(sendRedirectMock).toHaveBeenCalledWith(expect.anything(), AUTH_REQUEST.authorizationUrl)
  })

  it('carries a valid same-origin ?redirect= through into the flow cookie', async () => {
    await handler(fakeEvent({ redirect: '/worlds/abc' }))

    expect(setOidcFlowCookieMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ redirect: '/worlds/abc' }))
  })

  it('drops an unsafe ?redirect= (absolute URL to another origin) rather than carrying it through', async () => {
    await handler(fakeEvent({ redirect: 'https://evil.example.com' }))

    expect(setOidcFlowCookieMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ redirect: null }))
  })

  it('drops a protocol-relative ?redirect= the same way', async () => {
    await handler(fakeEvent({ redirect: '//evil.example.com' }))

    expect(setOidcFlowCookieMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ redirect: null }))
  })

  // Security review (OIDC redirect-safety audit): this route is the first
  // caller to ever hand safeRedirectTarget's output to a real HTTP
  // Location header (callback.get.ts's sendRedirect), rather than a
  // client-side navigateTo -- the exact new sink that turned a
  // browser-normalization quirk in safeRedirectTarget into a genuine open
  // redirect. Covered at the unit level in tests/utils/safeRedirect.test.ts;
  // repeated here end-to-end to prove THIS route's flow cookie never ends
  // up carrying it.
  it('drops a tab+backslash redirect that bypasses a leading-characters-only check (regression)', async () => {
    await handler(fakeEvent({ redirect: '/\t\\evil.example.com' }))

    expect(setOidcFlowCookieMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ redirect: null }))
  })
})
