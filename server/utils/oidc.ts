// OIDC identity verification -- the ONLY file in this codebase that
// imports `openid-client` or knows an OIDC provider exists. See
// .github/docs/architecture/ownership-and-permissions.md §6.3 (Directus
// is the current CredentialVerifier; this module is the FIRST other one)
// and this task's own CRITICAL ARCHITECTURE GATE section.
//
// PROVIDER-NEUTRAL BY CONSTRUCTION, NOT BY CONVENTION. Nothing here names
// Authentik, or any other product. The only input is whatever an
// operator puts in OIDC_ISSUER_URL/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET/
// OIDC_REDIRECT_URI -- discovery() fetches that issuer's own
// `.well-known/openid-configuration` at runtime and the rest of this
// module operates entirely on the result. Pointing OIDC_ISSUER_URL at
// Zitadel, or any other OIDC-compliant provider, requires no code change
// here -- only a different value in those four variables.
//
// WHAT "OIDC authenticates identity only" MEANS FOR THIS FILE: its output
// is exactly one thing -- a verified `{ issuer, subject, displayName?,
// email? }` tuple. It never touches an Eldra Account, a session, a
// capability, or a cookie. server/api/auth/oidc/*.ts routes are what turn
// that tuple into an Account (via resolveAccountForIdentity) and a
// session (via server/utils/eldra-sessions.ts) -- kept deliberately
// separate so "is this a real, verified identity" and "what does Eldra
// do with it" can never be confused with each other.
//
// LIBRARY CHOICE, VERIFIED AGAINST ITS OWN CURRENT DOCS (not assumed from
// memory): `openid-client` v6.8.9 (npm, confirmed via the registry at
// implementation time) -- the maintained, function-based rewrite of the
// long-standing `panva/openid-client` package, ESM, requires Node >=20
// (this deployment runs Node 22, per Dockerfile). `discovery()`,
// `buildAuthorizationUrl()`, `authorizationCodeGrant()`, and the PKCE/
// state/nonce helpers are exactly the v6 API surface this module uses;
// verified against github.com/panva/openid-client's own v6.x docs, not
// the pre-v6 class-based API this package's EARLIER major versions used.
//
// SECURITY PROPERTIES, each mapped to a specific library call:
//   - PKCE (S256): randomPKCECodeVerifier() + calculatePKCECodeChallenge()
//   - CSRF (state): randomState(), checked via `expectedState`
//   - Replay/injection (nonce): randomNonce(), checked via `expectedNonce`
//     -- setting this ALSO forces the library to require an id_token
//   - Issuer/audience/signature validation: performed INSIDE
//     authorizationCodeGrant()/discovery() by the library itself -- this
//     module never hand-parses or hand-verifies a JWT. That is the
//     entire reason to depend on a maintained OIDC client rather than
//     decoding a token by hand.
//   - Exact redirect URI: OIDC_REDIRECT_URI is sent in the authorization
//     request AND must be registered byte-for-byte with the provider;
//     the provider itself refuses a mismatch before Eldra ever sees a
//     callback.
import * as client from 'openid-client'

const ISSUER_ENV = 'OIDC_ISSUER_URL'
const CLIENT_ID_ENV = 'OIDC_CLIENT_ID'
const CLIENT_SECRET_ENV = 'OIDC_CLIENT_SECRET'
const REDIRECT_URI_ENV = 'OIDC_REDIRECT_URI'

function readOidcEnv() {
  return {
    issuerUrl: process.env[ISSUER_ENV] || '',
    clientId: process.env[CLIENT_ID_ENV] || '',
    clientSecret: process.env[CLIENT_SECRET_ENV] || '',
    redirectUri: process.env[REDIRECT_URI_ENV] || ''
  }
}

// Whether to show the "Sign in with your identity provider" button at
// all (server/api/auth/oidc/config.get.ts) -- all four must be set.
// Deliberately NOT exposed beyond this boolean: the issuer URL, client
// id, and secret never cross into the browser.
export function isOidcConfigured(): boolean {
  const env = readOidcEnv()
  return Boolean(env.issuerUrl && env.clientId && env.clientSecret && env.redirectUri)
}

export class OidcNotConfiguredError extends Error {
  constructor() {
    super('OIDC is not configured')
    this.name = 'OidcNotConfiguredError'
  }
}

// Lazily discovered ONCE per server process, reused across every
// subsequent login/link attempt -- the same "one small, lazily-created,
// reused" shape server/utils/character-resource-atomic.ts's own Pool
// already establishes for a different external dependency, and the
// pattern `discovery()`'s own docs describe: construct a `Configuration`
// once, keep it, reuse it (there is no library-level cache to opt into --
// the `Configuration` it returns IS the reusable unit).
//
// LATENCY INVESTIGATION (worlds.theledouxs.com login-latency report).
// Measured (this file's own tests, and a local reproduction of the
// deployed `.output` build) confirms a SEQUENTIAL second call already
// skipped discovery() entirely before this change -- that part was never
// the bug. What was: two CONCURRENT first-ever calls (e.g. a double
// click, or two near-simultaneous requests hitting a freshly-started
// process) each saw `cachedConfig` as not-yet-set and each independently
// called `client.discovery()` -- a real network round trip to the
// provider, twice, for what should be one. Caching the in-flight PROMISE
// (not merely the resolved value) is what closes that: every caller
// during the discovery window awaits the SAME network call.
//
// Keyed on every value that actually changes WHAT discovery() returns
// (issuer, client id, client secret) -- not merely the issuer URL, which
// would have kept serving a STALE Configuration (built with an old
// client id/secret) if an operator changed one of those without the
// issuer URL also changing. `redirectUri` is deliberately excluded: it is
// never passed into discovery() at all (only used later, in
// buildAuthorizationUrl), so including it would force needless
// re-discovery whenever only the redirect URI changed.
let cachedConfigPromise: Promise<client.Configuration> | null = null
let cachedForKey: string | null = null

function configurationCacheKey(env: ReturnType<typeof readOidcEnv>): string {
  return `${env.issuerUrl}|${env.clientId}|${env.clientSecret}`
}

async function getConfiguration(): Promise<client.Configuration> {
  const env = readOidcEnv()
  if (!isOidcConfigured()) {
    throw new OidcNotConfiguredError()
  }

  const key = configurationCacheKey(env)

  if (cachedConfigPromise && cachedForKey === key) {
    return cachedConfigPromise
  }

  // discovery() fetches `<issuer>/.well-known/openid-configuration` (or
  // provider-specific discovery path variants the library already
  // handles) and validates that the document's own `issuer` field
  // matches the URL given here -- the actual mechanism behind "strict
  // issuer validation": a provider cannot claim to be a different
  // issuer than the one this was configured to trust.
  //
  // The promise is cached BEFORE it settles (not after an await), which
  // is what makes it safe for concurrent callers: the second caller in
  // sees this same in-flight promise already assigned to
  // `cachedConfigPromise` and awaits it instead of starting a second
  // discovery() call of its own.
  cachedForKey = key
  const discoveryPromise = client.discovery(new URL(env.issuerUrl), env.clientId, env.clientSecret)
  cachedConfigPromise = discoveryPromise

  try {
    return await discoveryPromise
  } catch (error) {
    // Never cache a failure -- a transient discovery outage must not
    // permanently break OIDC login for the rest of this process's life.
    // Only clear the cache if nothing has since replaced this exact
    // attempt (a later, different config change may already have
    // started its own discovery by the time this one's catch runs).
    if (cachedConfigPromise === discoveryPromise) {
      cachedConfigPromise = null
      cachedForKey = null
    }
    throw error
  }
}

// Test-only: forces re-discovery on the next call. Production never
// calls this; it exists so unit tests don't leak a mocked Configuration
// across test files.
export function resetOidcConfigurationCache(): void {
  cachedConfigPromise = null
  cachedForKey = null
}

export type OidcAuthorizationRequest = {
  // Where to redirect the browser.
  authorizationUrl: string
  // Opaque values the CALLER must persist (e.g. in a short-lived,
  // httpOnly flow cookie) and hand back unchanged to
  // completeAuthorizationCodeGrant for the matching callback. Never
  // derived from, or trusted as, anything about WHICH Eldra Account this
  // flow is for -- see server/api/auth/oidc/callback.get.ts's own header
  // for why that is resolved from the live session instead, never from
  // this flow state.
  codeVerifier: string
  state: string
  nonce: string
}

// Builds everything needed to start an Authorization Code + PKCE flow.
// `redirectUri` is always OIDC_REDIRECT_URI -- never derived from the
// incoming request's own Host header, which would make the redirect
// target attacker-influenced; it is a fixed, operator-configured value
// that must also be registered with the provider byte-for-byte.
export async function buildAuthorizationRequest(): Promise<OidcAuthorizationRequest> {
  const env = readOidcEnv()
  const config = await getConfiguration()

  const codeVerifier = client.randomPKCECodeVerifier()
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
  const state = client.randomState()
  const nonce = client.randomNonce()

  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: env.redirectUri,
    // `openid` is required for an id_token (issuer+subject) to exist at
    // all; profile/email are requested ONLY for optional, non-authoritative
    // display data -- never used as an identity key (see
    // server/utils/eldra-accounts.ts's own rule: no email parameter
    // exists on the identity-resolution path at all).
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce
  })

  return { authorizationUrl: authorizationUrl.href, codeVerifier, state, nonce }
}

export type VerifiedOidcIdentity = {
  // The validated ID Token's own `iss` -- this, paired with `subject`, IS
  // the identity key (server/utils/eldra-accounts.ts's `provider` value
  // for an OIDC-authenticated identity is this issuer string, never a
  // product name). Comes directly from the library's own validated
  // claims, never from configuration or request input.
  issuer: string
  subject: string
  // Optional, NEVER authoritative, NEVER used to resolve or merge an
  // identity -- display data only, read opportunistically if the
  // provider included it.
  displayName: string | null
  email: string | null
}

export type OidcCallbackFailureReason =
  | 'not-configured'
  | 'cancelled'
  | 'invalid-state'
  | 'invalid-response'

export type OidcCallbackResult =
  | { ok: true; identity: VerifiedOidcIdentity }
  | { ok: false; reason: OidcCallbackFailureReason; message: string }

// Completes the Authorization Code + PKCE exchange for one callback
// request, performing EVERY check this module advertises: PKCE
// (`pkceCodeVerifier`), state (`expectedState`), nonce (`expectedNonce`,
// which also forces `idTokenExpected`), and issuer/audience/signature
// (internal to the library -- never hand-rolled here).
//
// NEVER THROWS -- every failure, including ones the library itself
// throws for (expired/replayed state, a provider's `error=access_denied`
// cancellation response, a malformed callback URL, a network failure
// reaching the token endpoint) is caught and returned as a typed,
// generic-message result. The caller (callback.get.ts) is responsible
// for logging detail server-side; nothing here leaks provider internals,
// stack traces, or raw OAuth error codes into what eventually reaches
// the browser.
export async function completeAuthorizationCodeGrant(
  currentUrl: URL,
  expected: { codeVerifier: string; state: string; nonce: string }
): Promise<OidcCallbackResult> {
  if (!isOidcConfigured()) {
    return { ok: false, reason: 'not-configured', message: 'Identity provider sign-in is not configured.' }
  }

  // The provider's own cancellation/denial response -- a real, expected
  // outcome (the user clicked "Cancel" or "Deny"), not a protocol error.
  // Checked before calling into the library at all, since the library's
  // own error for this case is not necessarily distinguishable from a
  // genuine validation failure, and this one specific case deserves its
  // own calmer message.
  const providerError = currentUrl.searchParams.get('error')
  if (providerError) {
    return {
      ok: false,
      reason: 'cancelled',
      message: providerError === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in was not completed.'
    }
  }

  let config: client.Configuration
  try {
    config = await getConfiguration()
  } catch {
    return { ok: false, reason: 'not-configured', message: 'Identity provider sign-in is not configured.' }
  }

  try {
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: expected.codeVerifier,
      expectedState: expected.state,
      expectedNonce: expected.nonce,
      idTokenExpected: true
    })

    const claims = tokens.claims()
    if (!claims?.iss || !claims?.sub) {
      // Should be unreachable -- idTokenExpected:true means the grant
      // call itself throws first if no valid id_token came back -- but
      // this module's own contract (VerifiedOidcIdentity always has both)
      // must hold even if the library's behavior ever changes under us.
      return { ok: false, reason: 'invalid-response', message: 'Identity provider response was incomplete.' }
    }

    const displayNameClaim = claims.name ?? claims.preferred_username ?? null
    const emailClaim = claims.email ?? null

    return {
      ok: true,
      identity: {
        issuer: String(claims.iss),
        subject: String(claims.sub),
        displayName: typeof displayNameClaim === 'string' ? displayNameClaim : null,
        email: typeof emailClaim === 'string' ? emailClaim : null
      }
    }
  } catch (error: any) {
    // Everything else -- state/nonce/PKCE mismatch (tampering, replay, or
    // an expired/already-used flow), signature/issuer/audience failure,
    // or the token endpoint being unreachable (provider outage) -- lands
    // here. Server-side detail only; see this function's own header.
    console.error('[oidc] authorization code grant failed:', error?.message || error)
    return {
      ok: false,
      reason: 'invalid-state',
      message: 'Your sign-in session could not be verified. Please try signing in again.'
    }
  }
}
