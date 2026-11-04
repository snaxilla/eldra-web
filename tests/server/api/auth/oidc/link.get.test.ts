// Unit tests for GET /api/auth/oidc/link (server/api/auth/oidc/link.get.ts).
// NOT in server/middleware/authorize.ts's PUBLIC_API_ROUTES -- the deny-by-
// default middleware is what actually enforces "caller must already be
// authenticated" for this route (tests/server/middleware/authorize.test.ts
// covers that boundary); this file only has to prove the route itself
// starts the SAME OIDC round-trip login.get.ts does, tagged kind:'link',
// and never writes an accountId into the flow cookie (see
// server/utils/oidc-flow.ts's own header for why that matters).

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

import handler from '../../../../../server/api/auth/oidc/link.get'

const AUTH_REQUEST = {
  authorizationUrl: 'https://idp.example.com/authorize?x=1',
  codeVerifier: 'verifier-1',
  state: 'state-1',
  nonce: 'nonce-1'
}

function fakeEvent(principal: unknown = { accountId: 'account-1' }): H3Event {
  return { context: { principal }, path: '/api/auth/oidc/link' } as unknown as H3Event
}

beforeEach(() => {
  isOidcConfiguredMock.mockReset()
  buildAuthorizationRequestMock.mockReset()
  setOidcFlowCookieMock.mockReset()
  sendRedirectMock.mockReset()

  isOidcConfiguredMock.mockReturnValue(true)
  buildAuthorizationRequestMock.mockResolvedValue(AUTH_REQUEST)
})

describe('GET /api/auth/oidc/link', () => {
  it('returns 404 rather than starting a flow when OIDC is not configured', async () => {
    isOidcConfiguredMock.mockReturnValue(false)

    await expect(handler(fakeEvent())).rejects.toMatchObject({ statusCode: 404 })
    expect(setOidcFlowCookieMock).not.toHaveBeenCalled()
  })

  it('writes a kind:link flow cookie, with no redirect and NO accountId of any kind', async () => {
    await handler(fakeEvent({ accountId: 'the-caller-account' }))

    const [, flow] = setOidcFlowCookieMock.mock.calls[0]
    expect(flow).toEqual({
      codeVerifier: 'verifier-1',
      state: 'state-1',
      nonce: 'nonce-1',
      kind: 'link',
      redirect: null
    })
    expect(JSON.stringify(flow)).not.toContain('the-caller-account')
  })

  it('redirects the browser to the authorization URL', async () => {
    await handler(fakeEvent())

    expect(sendRedirectMock).toHaveBeenCalledWith(expect.anything(), AUTH_REQUEST.authorizationUrl)
  })
})
