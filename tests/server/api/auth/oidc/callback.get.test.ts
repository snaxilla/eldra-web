// Unit tests for GET /api/auth/oidc/callback (server/api/auth/oidc/callback.get.ts)
// -- the one route where login and link flows actually diverge. Every
// dependency (flow-cookie read, OIDC verification, Account resolution,
// linking, session issuance) is mocked at the module boundary; this file
// is about THIS route's own sequencing and branching:
//   - flow-state / configuration gating before any OIDC call
//   - login vs link dispatch
//   - a link flow's target Account coming ONLY from the caller's live
//     session (resolveAuthenticatedAccount), never from the flow cookie
//   - no session cookie is ever set for a link flow
//   - an inactive Account never receives a session
//   - every failure path's exact redirect target

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const {
  resolveAuthenticatedAccountMock,
  linkIdentityToAccountMock,
  resolveAccountForIdentityMock,
  createEldraSessionMock,
  setEldraSessionCookieMock,
  completeAuthorizationCodeGrantMock,
  isOidcConfiguredMock,
  readAndClearOidcFlowStateMock,
  sendRedirectMock,
  getRequestURLMock
} = vi.hoisted(() => ({
  resolveAuthenticatedAccountMock: vi.fn(),
  linkIdentityToAccountMock: vi.fn(),
  resolveAccountForIdentityMock: vi.fn(),
  createEldraSessionMock: vi.fn(),
  setEldraSessionCookieMock: vi.fn(),
  completeAuthorizationCodeGrantMock: vi.fn(),
  isOidcConfiguredMock: vi.fn(),
  readAndClearOidcFlowStateMock: vi.fn(),
  sendRedirectMock: vi.fn(),
  getRequestURLMock: vi.fn()
}))

vi.mock('../../../../../server/utils/authorization', () => ({
  resolveAuthenticatedAccount: resolveAuthenticatedAccountMock
}))

vi.mock('../../../../../server/utils/eldra-accounts', () => ({
  linkIdentityToAccount: linkIdentityToAccountMock,
  resolveAccountForIdentity: resolveAccountForIdentityMock
}))

vi.mock('../../../../../server/utils/eldra-sessions', () => ({
  createEldraSession: createEldraSessionMock,
  setEldraSessionCookie: setEldraSessionCookieMock
}))

vi.mock('../../../../../server/utils/oidc', () => ({
  completeAuthorizationCodeGrant: completeAuthorizationCodeGrantMock,
  isOidcConfigured: isOidcConfiguredMock
}))

vi.mock('../../../../../server/utils/oidc-flow', () => ({
  readAndClearOidcFlowState: readAndClearOidcFlowStateMock
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, sendRedirect: sendRedirectMock, getRequestURL: getRequestURLMock }
})

import handler from '../../../../../server/api/auth/oidc/callback.get'

function fakeEvent(): H3Event {
  return {} as unknown as H3Event
}

const IDENTITY = {
  issuer: 'https://idp.example.com/application/o/eldra/',
  subject: 'subject-123',
  displayName: 'Jane Doe',
  email: 'jane@example.com'
}

const LOGIN_FLOW = { codeVerifier: 'cv', state: 'st', nonce: 'nc', kind: 'login' as const, redirect: null, initiatingAccountId: null }
// Matches the `resolveAuthenticatedAccountMock` return value every
// existing link-flow test below already uses -- the fingerprint check
// (security review, OIDC architecture audit) passes by default here so
// those tests keep proving what they originally proved; the dedicated
// mismatch tests below override this field explicitly.
const LINK_FLOW = { codeVerifier: 'cv', state: 'st', nonce: 'nc', kind: 'link' as const, redirect: null, initiatingAccountId: 'caller-account' }

beforeEach(() => {
  resolveAuthenticatedAccountMock.mockReset()
  linkIdentityToAccountMock.mockReset()
  resolveAccountForIdentityMock.mockReset()
  createEldraSessionMock.mockReset()
  setEldraSessionCookieMock.mockReset()
  completeAuthorizationCodeGrantMock.mockReset()
  isOidcConfiguredMock.mockReset()
  readAndClearOidcFlowStateMock.mockReset()
  sendRedirectMock.mockReset()
  getRequestURLMock.mockReset()

  isOidcConfiguredMock.mockReturnValue(true)
  getRequestURLMock.mockReturnValue(new URL('https://eldra.example.com/api/auth/oidc/callback?code=abc&state=st'))
  completeAuthorizationCodeGrantMock.mockResolvedValue({ ok: true, identity: IDENTITY })
})

function redirectedTo(): string {
  expect(sendRedirectMock).toHaveBeenCalledTimes(1)
  return sendRedirectMock.mock.calls[0][1]
}

describe('GET /api/auth/oidc/callback -- gating before any OIDC call', () => {
  it('redirects to /login?oidc_error=no-flow when there is no flow cookie, without calling the OIDC library', async () => {
    readAndClearOidcFlowStateMock.mockReturnValue(null)

    await handler(fakeEvent())

    expect(redirectedTo()).toBe('/login?oidc_error=no-flow')
    expect(completeAuthorizationCodeGrantMock).not.toHaveBeenCalled()
  })

  it('redirects to /login?oidc_error=not-configured when OIDC is not configured, even with a valid flow cookie', async () => {
    readAndClearOidcFlowStateMock.mockReturnValue(LOGIN_FLOW)
    isOidcConfiguredMock.mockReturnValue(false)

    await handler(fakeEvent())

    expect(redirectedTo()).toBe('/login?oidc_error=not-configured')
    expect(completeAuthorizationCodeGrantMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/auth/oidc/callback -- OIDC verification failure', () => {
  it.each(['cancelled', 'invalid-state', 'invalid-response', 'not-configured'] as const)(
    'maps a %s failure to the matching oidc_error redirect for a login flow',
    async (reason) => {
      readAndClearOidcFlowStateMock.mockReturnValue(LOGIN_FLOW)
      completeAuthorizationCodeGrantMock.mockResolvedValue({ ok: false, reason, message: 'generic' })

      await handler(fakeEvent())

      expect(redirectedTo()).toBe(`/login?oidc_error=${reason}`)
      expect(resolveAccountForIdentityMock).not.toHaveBeenCalled()
    }
  )

  it('maps a failure the same way for a link flow -- there is no link-specific error surface yet', async () => {
    readAndClearOidcFlowStateMock.mockReturnValue(LINK_FLOW)
    completeAuthorizationCodeGrantMock.mockResolvedValue({ ok: false, reason: 'cancelled', message: 'generic' })

    await handler(fakeEvent())

    expect(redirectedTo()).toBe('/login?oidc_error=cancelled')
    expect(resolveAuthenticatedAccountMock).not.toHaveBeenCalled()
    expect(linkIdentityToAccountMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/auth/oidc/callback -- login flow, verification succeeds', () => {
  beforeEach(() => {
    readAndClearOidcFlowStateMock.mockReturnValue(LOGIN_FLOW)
  })

  it('resolves the Account by (issuer, subject) and never passes an email as the identifying input', async () => {
    resolveAccountForIdentityMock.mockResolvedValue({ id: 'account-1', displayName: 'Jane Doe', status: 'active' })
    createEldraSessionMock.mockResolvedValue({ token: 'raw-token', expiresAt: '2099-01-01T00:00:00.000Z' })

    await handler(fakeEvent())

    expect(resolveAccountForIdentityMock).toHaveBeenCalledWith({
      provider: IDENTITY.issuer,
      providerSubject: IDENTITY.subject,
      displayName: 'Jane Doe'
    })
  })

  it('falls back to email, then subject, for displayName when the provider omits name', async () => {
    resolveAccountForIdentityMock.mockResolvedValue({ id: 'account-1', displayName: 'x', status: 'active' })
    createEldraSessionMock.mockResolvedValue({ token: 'raw-token', expiresAt: '2099-01-01T00:00:00.000Z' })

    completeAuthorizationCodeGrantMock.mockResolvedValue({
      ok: true,
      identity: { ...IDENTITY, displayName: null }
    })
    await handler(fakeEvent())
    expect(resolveAccountForIdentityMock).toHaveBeenCalledWith(expect.objectContaining({ displayName: IDENTITY.email }))

    sendRedirectMock.mockClear()
    resolveAccountForIdentityMock.mockClear()
    completeAuthorizationCodeGrantMock.mockResolvedValue({
      ok: true,
      identity: { ...IDENTITY, displayName: null, email: null }
    })
    await handler(fakeEvent())
    expect(resolveAccountForIdentityMock).toHaveBeenCalledWith(expect.objectContaining({ displayName: IDENTITY.subject }))
  })

  it('issues an Eldra session and sets its cookie only after the Account resolves active, then redirects to "/"', async () => {
    resolveAccountForIdentityMock.mockResolvedValue({ id: 'account-1', displayName: 'Jane Doe', status: 'active' })
    createEldraSessionMock.mockResolvedValue({ token: 'raw-token', expiresAt: '2099-01-01T00:00:00.000Z' })

    await handler(fakeEvent())

    expect(createEldraSessionMock).toHaveBeenCalledWith('account-1')
    expect(setEldraSessionCookieMock).toHaveBeenCalledWith(expect.anything(), 'raw-token', '2099-01-01T00:00:00.000Z')
    expect(redirectedTo()).toBe('/')
  })

  it('redirects to the flow\'s own validated redirect target when one was carried through login.get.ts', async () => {
    readAndClearOidcFlowStateMock.mockReturnValue({ ...LOGIN_FLOW, redirect: '/worlds/abc' })
    resolveAccountForIdentityMock.mockResolvedValue({ id: 'account-1', displayName: 'Jane Doe', status: 'active' })
    createEldraSessionMock.mockResolvedValue({ token: 'raw-token', expiresAt: '2099-01-01T00:00:00.000Z' })

    await handler(fakeEvent())

    expect(redirectedTo()).toBe('/worlds/abc')
  })

  it('refuses to issue a session for a non-active Account, and never calls createEldraSession', async () => {
    resolveAccountForIdentityMock.mockResolvedValue({ id: 'account-1', displayName: 'Jane Doe', status: 'suspended' })

    await handler(fakeEvent())

    expect(createEldraSessionMock).not.toHaveBeenCalled()
    expect(setEldraSessionCookieMock).not.toHaveBeenCalled()
    expect(redirectedTo()).toBe('/login?oidc_error=account-inactive')
  })
})

describe('GET /api/auth/oidc/callback -- link flow, verification succeeds', () => {
  beforeEach(() => {
    readAndClearOidcFlowStateMock.mockReturnValue(LINK_FLOW)
  })

  it('re-derives the link target from the CALLER\'S LIVE session, never by trusting the flow cookie\'s fingerprint as a target', async () => {
    resolveAuthenticatedAccountMock.mockResolvedValue({ id: 'caller-account', displayName: 'Caller', status: 'active' })
    linkIdentityToAccountMock.mockResolvedValue({ outcome: 'linked' })

    await handler(fakeEvent())

    expect(resolveAuthenticatedAccountMock).toHaveBeenCalledWith(expect.anything())
    expect(linkIdentityToAccountMock).toHaveBeenCalledWith({
      accountId: 'caller-account',
      provider: IDENTITY.issuer,
      providerSubject: IDENTITY.subject
    })
  })

  it('never creates or touches a session cookie for a link flow -- the caller was already signed in', async () => {
    resolveAuthenticatedAccountMock.mockResolvedValue({ id: 'caller-account', displayName: 'Caller', status: 'active' })
    linkIdentityToAccountMock.mockResolvedValue({ outcome: 'linked' })

    await handler(fakeEvent())

    expect(createEldraSessionMock).not.toHaveBeenCalled()
    expect(setEldraSessionCookieMock).not.toHaveBeenCalled()
  })

  it('fails the link (no write attempted) when the live session that started it is gone', async () => {
    resolveAuthenticatedAccountMock.mockResolvedValue(null)

    await handler(fakeEvent())

    expect(linkIdentityToAccountMock).not.toHaveBeenCalled()
    expect(redirectedTo()).toBe('/login?oidc_error=invalid-state')
  })

  // Security review (OIDC architecture audit): if the Eldra session in
  // this browser changed between link.get.ts recording who started the
  // flow and this callback completing -- another person signing in on a
  // shared/kiosk browser, or a logout/login in a second tab while the
  // caller was away at the identity provider -- the live session now
  // resolves to a DIFFERENT, real, authenticated Account than the one
  // that asked to link. Without this check the identity would have been
  // linked to whichever Account merely happened to be live at this
  // moment, never the one that actually requested it.
  it('fails the link (no write attempted) when the live account no longer matches the one that started the flow', async () => {
    readAndClearOidcFlowStateMock.mockReturnValue({ ...LINK_FLOW, initiatingAccountId: 'the-account-that-started-this' })
    resolveAuthenticatedAccountMock.mockResolvedValue({ id: 'a-different-now-live-account', displayName: 'Someone Else', status: 'active' })

    await handler(fakeEvent())

    expect(linkIdentityToAccountMock).not.toHaveBeenCalled()
    expect(redirectedTo()).toBe('/login?oidc_error=invalid-state')
  })

  it('succeeds when the live account matches the fingerprint exactly', async () => {
    readAndClearOidcFlowStateMock.mockReturnValue({ ...LINK_FLOW, initiatingAccountId: 'caller-account' })
    resolveAuthenticatedAccountMock.mockResolvedValue({ id: 'caller-account', displayName: 'Caller', status: 'active' })
    linkIdentityToAccountMock.mockResolvedValue({ outcome: 'linked' })

    await handler(fakeEvent())

    expect(linkIdentityToAccountMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'caller-account' }))
    expect(redirectedTo()).toBe('/?oidc_link=linked')
  })

  it.each([
    ['linked', 'linked'],
    ['already-linked', 'already-linked'],
    ['collision', 'collision']
  ] as const)('reports a %s outcome via ?oidc_link=%s', async (outcome, expectedQuery) => {
    resolveAuthenticatedAccountMock.mockResolvedValue({ id: 'caller-account', displayName: 'Caller', status: 'active' })
    linkIdentityToAccountMock.mockResolvedValue({ outcome, linkedAccountId: 'some-other-account' })

    await handler(fakeEvent())

    expect(redirectedTo()).toBe(`/?oidc_link=${expectedQuery}`)
  })
})
