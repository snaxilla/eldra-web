// Unit tests for OIDC identity verification (server/utils/oidc.ts). See
// that module's own header for the library choice (openid-client v6,
// verified against its current docs) and why every security property
// (PKCE, state, nonce, issuer/audience/signature) maps to a specific
// library call rather than being hand-rolled here.
//
// `openid-client` itself is mocked at the module boundary -- what is
// under test here is THIS module's own logic (configuration caching,
// error-to-generic-message mapping, never leaking provider detail,
// never trusting unvalidated input), not the library's own token
// validation, which is exactly the part worth depending on a maintained
// library for rather than re-testing.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  discoveryMock,
  randomPKCECodeVerifierMock,
  calculatePKCECodeChallengeMock,
  randomStateMock,
  randomNonceMock,
  buildAuthorizationUrlMock,
  authorizationCodeGrantMock
} = vi.hoisted(() => ({
  discoveryMock: vi.fn(),
  randomPKCECodeVerifierMock: vi.fn(),
  calculatePKCECodeChallengeMock: vi.fn(),
  randomStateMock: vi.fn(),
  randomNonceMock: vi.fn(),
  buildAuthorizationUrlMock: vi.fn(),
  authorizationCodeGrantMock: vi.fn()
}))

vi.mock('openid-client', () => ({
  discovery: discoveryMock,
  randomPKCECodeVerifier: randomPKCECodeVerifierMock,
  calculatePKCECodeChallenge: calculatePKCECodeChallengeMock,
  randomState: randomStateMock,
  randomNonce: randomNonceMock,
  buildAuthorizationUrl: buildAuthorizationUrlMock,
  authorizationCodeGrant: authorizationCodeGrantMock
}))

import {
  buildAuthorizationRequest,
  completeAuthorizationCodeGrant,
  isOidcConfigured,
  resetOidcConfigurationCache
} from '../../../server/utils/oidc'

const ENV_KEYS = ['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI'] as const

function setConfiguredEnv() {
  process.env.OIDC_ISSUER_URL = 'https://idp.example.com/application/o/eldra/'
  process.env.OIDC_CLIENT_ID = 'eldra-client'
  process.env.OIDC_CLIENT_SECRET = 'super-secret'
  process.env.OIDC_REDIRECT_URI = 'https://eldra.example.com/api/auth/oidc/callback'
}

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key]
}

const fakeConfig = { serverMetadata: () => ({}) }

beforeEach(() => {
  clearEnv()
  resetOidcConfigurationCache()
  discoveryMock.mockReset()
  randomPKCECodeVerifierMock.mockReset()
  calculatePKCECodeChallengeMock.mockReset()
  randomStateMock.mockReset()
  randomNonceMock.mockReset()
  buildAuthorizationUrlMock.mockReset()
  authorizationCodeGrantMock.mockReset()

  discoveryMock.mockResolvedValue(fakeConfig)
  randomPKCECodeVerifierMock.mockReturnValue('code-verifier-value')
  calculatePKCECodeChallengeMock.mockResolvedValue('code-challenge-value')
  randomStateMock.mockReturnValue('state-value')
  randomNonceMock.mockReturnValue('nonce-value')
  buildAuthorizationUrlMock.mockReturnValue(new URL('https://idp.example.com/authorize?x=1'))
})

describe('isOidcConfigured', () => {
  it('is false when nothing is set', () => {
    expect(isOidcConfigured()).toBe(false)
  })

  it('is false when any one of the four values is missing', () => {
    setConfiguredEnv()
    delete process.env.OIDC_CLIENT_SECRET
    expect(isOidcConfigured()).toBe(false)
  })

  it('is true when issuer, client id, client secret, and redirect URI are all set', () => {
    setConfiguredEnv()
    expect(isOidcConfigured()).toBe(true)
  })
})

describe('buildAuthorizationRequest', () => {
  it('generates PKCE verifier/challenge, state, and nonce, and builds the authorization URL from them', async () => {
    setConfiguredEnv()

    const request = await buildAuthorizationRequest()

    expect(request.codeVerifier).toBe('code-verifier-value')
    expect(request.state).toBe('state-value')
    expect(request.nonce).toBe('nonce-value')
    expect(calculatePKCECodeChallengeMock).toHaveBeenCalledWith('code-verifier-value')

    const [, params] = buildAuthorizationUrlMock.mock.calls[0]
    expect(params.code_challenge).toBe('code-challenge-value')
    expect(params.code_challenge_method).toBe('S256')
    expect(params.state).toBe('state-value')
    expect(params.nonce).toBe('nonce-value')
    expect(params.redirect_uri).toBe('https://eldra.example.com/api/auth/oidc/callback')
    expect(params.scope).toContain('openid')
  })

  it('uses the configured OIDC_REDIRECT_URI verbatim -- never derived from a request header', async () => {
    setConfiguredEnv()

    await buildAuthorizationRequest()

    const [, params] = buildAuthorizationUrlMock.mock.calls[0]
    expect(params.redirect_uri).toBe(process.env.OIDC_REDIRECT_URI)
  })

  it('throws when OIDC is not configured, rather than silently proceeding', async () => {
    await expect(buildAuthorizationRequest()).rejects.toThrow()
    expect(discoveryMock).not.toHaveBeenCalled()
  })

  it('discovers the configured issuer exactly once across repeated calls (cached configuration)', async () => {
    setConfiguredEnv()

    await buildAuthorizationRequest()
    await buildAuthorizationRequest()

    expect(discoveryMock).toHaveBeenCalledTimes(1)
  })

  it('re-discovers if the configured issuer URL changes', async () => {
    setConfiguredEnv()
    await buildAuthorizationRequest()

    process.env.OIDC_ISSUER_URL = 'https://a-different-idp.example.com/'
    await buildAuthorizationRequest()

    expect(discoveryMock).toHaveBeenCalledTimes(2)
  })

  // Login-latency investigation. A SEQUENTIAL second call already never
  // re-discovered (the test above) -- the real gap was CONCURRENT first
  // calls (a double click, or two near-simultaneous requests hitting a
  // freshly-started process) each seeing no cached Configuration yet and
  // each independently paying a discovery() network round trip. Caching
  // the in-flight PROMISE, not only the resolved value, is what this
  // proves closed.
  it('discovers exactly once even when buildAuthorizationRequest is called concurrently, before the first discovery() resolves', async () => {
    setConfiguredEnv()

    let resolveDiscovery!: (value: typeof fakeConfig) => void
    discoveryMock.mockReset()
    discoveryMock.mockImplementation(() => new Promise((resolve) => { resolveDiscovery = resolve }))

    // Three callers race in before discovery() has settled at all.
    const first = buildAuthorizationRequest()
    const second = buildAuthorizationRequest()
    const third = buildAuthorizationRequest()

    resolveDiscovery(fakeConfig)
    await Promise.all([first, second, third])

    expect(discoveryMock).toHaveBeenCalledTimes(1)
  })

  it('re-discovers if the client id changes, even though the issuer URL did not', async () => {
    setConfiguredEnv()
    await buildAuthorizationRequest()

    process.env.OIDC_CLIENT_ID = 'a-different-client-id'
    await buildAuthorizationRequest()

    expect(discoveryMock).toHaveBeenCalledTimes(2)
  })

  it('re-discovers if the client secret changes, even though the issuer URL did not -- a rotated secret must never be served a stale Configuration built with the old one', async () => {
    setConfiguredEnv()
    await buildAuthorizationRequest()

    process.env.OIDC_CLIENT_SECRET = 'a-different-secret'
    await buildAuthorizationRequest()

    expect(discoveryMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT re-discover when only the redirect URI changes -- it is never part of discovery() at all', async () => {
    setConfiguredEnv()
    await buildAuthorizationRequest()

    process.env.OIDC_REDIRECT_URI = 'https://eldra.example.com/a/different/callback/path'
    await buildAuthorizationRequest()

    expect(discoveryMock).toHaveBeenCalledTimes(1)
  })

  it('never caches a rejected discovery -- a transient outage is retried on the next call, not replayed forever', async () => {
    setConfiguredEnv()
    discoveryMock.mockRejectedValueOnce(new Error('provider unreachable'))

    await expect(buildAuthorizationRequest()).rejects.toThrow('provider unreachable')

    discoveryMock.mockResolvedValueOnce(fakeConfig)
    await expect(buildAuthorizationRequest()).resolves.toBeDefined()

    expect(discoveryMock).toHaveBeenCalledTimes(2)
  })

  it('a process restart (fresh module state) re-discovers rather than reusing anything from before it', async () => {
    setConfiguredEnv()
    await buildAuthorizationRequest()
    expect(discoveryMock).toHaveBeenCalledTimes(1)

    // Simulates a real process restart more faithfully than this test
    // file's own resetOidcConfigurationCache escape hatch: a genuinely
    // fresh module instance, with its own independent module-level
    // cache state, picking up whatever environment settings are current
    // at that moment.
    vi.resetModules()
    const fresh = await import('../../../server/utils/oidc')
    await fresh.buildAuthorizationRequest()

    expect(discoveryMock).toHaveBeenCalledTimes(2)
  })
})

describe('completeAuthorizationCodeGrant', () => {
  const expected = { codeVerifier: 'cv', state: 'st', nonce: 'nc' }

  it('returns the verified issuer/subject/displayName/email on success', async () => {
    setConfiguredEnv()
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({
        iss: 'https://idp.example.com/application/o/eldra/',
        sub: 'subject-123',
        name: 'Jane Doe',
        email: 'jane@example.com'
      })
    })

    const result = await completeAuthorizationCodeGrant(new URL('https://eldra.example.com/api/auth/oidc/callback?code=abc'), expected)

    expect(result).toEqual({
      ok: true,
      identity: {
        issuer: 'https://idp.example.com/application/o/eldra/',
        subject: 'subject-123',
        displayName: 'Jane Doe',
        email: 'jane@example.com'
      }
    })
  })

  it('passes pkceCodeVerifier/expectedState/expectedNonce/idTokenExpected through to the library -- the actual CSRF/replay/PKCE enforcement', async () => {
    setConfiguredEnv()
    authorizationCodeGrantMock.mockResolvedValue({ claims: () => ({ iss: 'https://idp.example.com/', sub: 'x' }) })

    await completeAuthorizationCodeGrant(new URL('https://eldra.example.com/callback?code=abc'), expected)

    const [, , checks] = authorizationCodeGrantMock.mock.calls[0]
    expect(checks).toMatchObject({
      pkceCodeVerifier: 'cv',
      expectedState: 'st',
      expectedNonce: 'nc',
      idTokenExpected: true
    })
  })

  it('treats the provider\'s own cancellation response (error=access_denied) as "cancelled", without ever calling the library', async () => {
    setConfiguredEnv()

    const result = await completeAuthorizationCodeGrant(
      new URL('https://eldra.example.com/callback?error=access_denied'),
      expected
    )

    expect(result).toMatchObject({ ok: false, reason: 'cancelled' })
    expect(authorizationCodeGrantMock).not.toHaveBeenCalled()
  })

  it('maps a library-thrown state/nonce/PKCE/signature failure to a generic message -- never leaking the underlying error', async () => {
    setConfiguredEnv()
    authorizationCodeGrantMock.mockRejectedValue(new Error('state mismatch: expected st got evil-state'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await completeAuthorizationCodeGrant(new URL('https://eldra.example.com/callback?code=abc&state=evil-state'), expected)

    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('evil-state')
    expect(JSON.stringify(result)).not.toContain('state mismatch')
    expect(logged).toHaveBeenCalled() // the detail goes to the server log, not the caller
    logged.mockRestore()
  })

  it('maps a provider-outage (token endpoint unreachable) failure to a generic message, not a 500 stack trace', async () => {
    setConfiguredEnv()
    authorizationCodeGrantMock.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await completeAuthorizationCodeGrant(new URL('https://eldra.example.com/callback?code=abc'), expected)

    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED')
    logged.mockRestore()
  })

  it('returns not-configured, without throwing, when OIDC is not configured', async () => {
    const result = await completeAuthorizationCodeGrant(new URL('https://eldra.example.com/callback?code=abc'), expected)

    expect(result).toMatchObject({ ok: false, reason: 'not-configured' })
    expect(authorizationCodeGrantMock).not.toHaveBeenCalled()
  })

  it('treats a response with no issuer/subject as invalid, never fabricating an identity', async () => {
    setConfiguredEnv()
    authorizationCodeGrantMock.mockResolvedValue({ claims: () => ({}) })

    const result = await completeAuthorizationCodeGrant(new URL('https://eldra.example.com/callback?code=abc'), expected)

    expect(result.ok).toBe(false)
  })

  it('never includes email in the identity match-relevant fields -- email is present only as separate, clearly-labeled display data', async () => {
    setConfiguredEnv()
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ iss: 'https://idp.example.com/', sub: 'subject-abc', email: 'same@example.com' })
    })

    const result = await completeAuthorizationCodeGrant(new URL('https://eldra.example.com/callback?code=abc'), expected)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.identity.subject).toBe('subject-abc')
      expect(result.identity.email).toBe('same@example.com')
      // The identity key this module hands upstream is issuer+subject --
      // email is a sibling field, never folded into it.
      expect(Object.keys(result.identity).sort()).toEqual(['displayName', 'email', 'issuer', 'subject'])
    }
  })
})
