import type { H3Event } from 'h3'

function getRuntimeDirectusConfig() {
  const config = useRuntimeConfig()

  const baseUrl = String(
    process.env.DIRECTUS_URL ||
    (config as any).directusUrl ||
    process.env.NUXT_PUBLIC_DIRECTUS_URL ||
    config.public.directusUrl ||
    ''
  ).replace(/\/$/, '')

  const serviceToken = String(
    process.env.DIRECTUS_TOKEN ||
    config.directusToken ||
    ''
  )

  if (!baseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Directus URL is not configured'
    })
  }

  return { baseUrl, serviceToken }
}

export function getSessionToken(event: H3Event) {
  return getCookie(event, 'eldra_session') || ''
}

export function getRefreshToken(event: H3Event) {
  return getCookie(event, 'eldra_refresh') || ''
}

// Cookie shape shared by login (server/api/auth/login.post.ts) and refresh
// (refreshDirectusSession, below) so the two can never drift apart --
// exactly the trap DIRECTUS_ME_FIELDS's own comment already warns about
// for a different pair of call sites. Exported so login.post.ts uses this
// SAME function rather than a second, independently-maintained copy of the
// cookie config -- the ad-hoc inline setCookie login.post.ts had before
// this fix is exactly the kind of drift this prevents.
export function setSessionCookies(event: H3Event, accessToken: string, refreshToken: string) {
  setCookie(event, 'eldra_session', accessToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8
  })

  if (refreshToken) {
    // Directus's default REFRESH_TOKEN_TTL is 7 days -- this deployment
    // does not override it (verified: no REFRESH_TOKEN_TTL/ACCESS_TOKEN_TTL
    // env var on the live Directus container), so the cookie's own maxAge
    // matches that default rather than inventing a different one.
    setCookie(event, 'eldra_refresh', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    })
  }
}

function clearSessionCookies(event: H3Event) {
  deleteCookie(event, 'eldra_session', { path: '/' })
  deleteCookie(event, 'eldra_refresh', { path: '/' })
}

// THE FIX for the "authenticated, cookie present, still 401" regression:
// Directus's access tokens default to a 15-minute TTL (ACCESS_TOKEN_TTL,
// unconfigured/default on this deployment's Directus container), while
// `eldra_session` is deliberately a longer-lived cookie (8h, see
// setSessionCookies above) so a user doesn't have to re-enter a password
// every 15 minutes. Once the access token expires, Directus correctly
// rejects it (401) even though the COOKIE carrying it is still present and
// unexpired -- resolvePrincipal (server/utils/authorization.ts) then
// correctly treats that Directus 401 as "not authenticated," which is
// exactly the trace this task asked for. The actual defect is here, one
// layer below: nothing ever exchanged the refresh token Directus issues
// at login for a new access token, because login.post.ts was discarding
// it instead of storing it (server/api/auth/logout.post.ts and
// server/api/auth/me.get.ts already read/delete an `eldra_refresh` cookie
// that login.post.ts never wrote in the first place).
//
// Returns the new access token on success (having already rewritten both
// cookies so the BROWSER's *next* request carries them), or null if there
// is no refresh token or Directus rejects it too -- a null here means the
// session is genuinely over, not merely stale, and callers should treat it
// exactly like today's "invalid session" case.
export async function refreshDirectusSession(event: H3Event): Promise<string | null> {
  const refreshToken = getRefreshToken(event)
  if (!refreshToken) {
    return null
  }

  const { baseUrl } = getRuntimeDirectusConfig()

  try {
    const response: any = await $fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      body: { refresh_token: refreshToken }
    })

    const newAccessToken = response?.data?.access_token || response?.access_token
    // Directus rotates the refresh token on every use by default -- fall
    // back to the one just spent only if the response is somehow missing
    // one, rather than leaving the cookie unset.
    const newRefreshToken = response?.data?.refresh_token || response?.refresh_token || refreshToken

    if (!newAccessToken) {
      return null
    }

    setSessionCookies(event, newAccessToken, newRefreshToken)
    return newAccessToken
  } catch {
    // The refresh token itself is invalid/expired/already used -- the
    // session cannot be recovered. Clear both cookies rather than leaving
    // a stale, unusable pair behind (mirrors me.get.ts's existing
    // clear-on-failure behavior for the access token alone).
    clearSessionCookies(event)
    return null
  }
}

export async function directusServiceRequest(path: string, options: any = {}) {
  const { baseUrl, serviceToken } = getRuntimeDirectusConfig()

  const headers: Record<string, string> = {
    ...(options.headers || {})
  }

  if (!headers.Authorization && serviceToken) {
    headers.Authorization = `Bearer ${serviceToken}`
  }

  return await $fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  })
}

// The USER-SCOPED Directus client: it sends the caller's own session token
// and nothing else. `directusServiceRequest` above is the service-token
// client, and the separation between the two is now absolute.
//
// FAIL-CLOSED (Phase 1 authorization preflight, finding A). This function
// used to end with `const tokenToUse = sessionToken || serviceToken` -- so
// a request that was meant to run as the logged-in user, but reached here
// with no `event` (or with an expired/absent `eldra_session` cookie),
// silently ran with the *service* token instead: full Directus privileges,
// bypassing every per-user permission, with no error and nothing in the
// response to distinguish it. Confirmed reachable today, and a trap for
// every future caller that forgets the third argument.
//
// Now: an absent user token is an error, not a downgrade to a stronger
// credential. Three cases, in order:
//   1. The caller supplied its own Authorization header -> use it verbatim
//      (server/api/auth/login.post.ts does this with the access token it
//      just received, before any cookie exists).
//   2. A session token is resolvable from `event` -> use it.
//   3. Neither -> throw 401, UNLESS the caller passed
//      `unauthenticated: true`, which is the explicit opt-in for Directus
//      endpoints that take no credential at all (`/auth/login`,
//      `/auth/logout`, which authenticate by request body). Opting in
//      sends NO Authorization header -- it never substitutes the service
//      token either.
//
// Anything that genuinely wants service-token privileges must say so by
// calling directusServiceRequest. That is the whole point: privilege is
// now something a call site states, never something it inherits by
// omission.
export type UserRequestCredential = {
  // The Authorization header value to send, or null to send none.
  authorization: string | null
  // True when the request must not be sent at all.
  denied: boolean
}

// The credential decision, extracted as a pure function with no
// auto-imported Nitro globals so it is directly unit-testable under plain
// Vitest (the same reason server/utils/authorization.ts imports createError
// explicitly). `directusRequest` below does nothing with credentials that
// is not decided here -- which is what makes "a user-scoped request can
// never fall back to the service token" a property that is tested rather
// than merely reviewed.
export function resolveUserRequestCredential(input: {
  authorizationHeader?: string
  sessionToken?: string
  unauthenticated?: boolean
}): UserRequestCredential {
  if (input.authorizationHeader) {
    return { authorization: input.authorizationHeader, denied: false }
  }

  if (input.sessionToken) {
    return { authorization: `Bearer ${input.sessionToken}`, denied: false }
  }

  if (input.unauthenticated) {
    return { authorization: null, denied: false }
  }

  return { authorization: null, denied: true }
}

export async function directusRequest(path: string, options: any = {}, event?: H3Event) {
  const { baseUrl } = getRuntimeDirectusConfig()

  const { unauthenticated, ...fetchOptions } = options as { unauthenticated?: boolean } & Record<string, any>

  const headers: Record<string, string> = {
    ...(fetchOptions.headers || {})
  }

  const credential = resolveUserRequestCredential({
    authorizationHeader: headers.Authorization,
    sessionToken: event ? getSessionToken(event) : '',
    unauthenticated
  })

  if (credential.denied) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Directus request requires an authenticated session'
    })
  }

  if (credential.authorization) {
    headers.Authorization = credential.authorization
  } else {
    delete headers.Authorization
  }

  return await $fetch(`${baseUrl}${path}`, {
    ...fetchOptions,
    headers
  })
}

// The field set EVERY "who am I" read must request, shared so the two
// callers can never drift apart again.
//
// Two separate traps are encoded in this one string.
//
// 1. Directus returns a relational field (`role`) as a bare primary-key
//    string unless its subfields are named explicitly. `normalizeUser`
//    (app/composables/useAuth.ts) then cannot read anything off it.
//
// 2. `admin_access`/`app_access` live on `directus_policies`, NOT on
//    `directus_roles`, as of Directus 11. Verified against the deployed
//    instance (11.12.0): `GET /fields/directus_roles` lists no
//    `admin_access`. Requesting `role.admin_access` anyway does not
//    error -- Directus answers HTTP 200 and silently reduces the WHOLE
//    selection to `{ id }`:
//
//      fields=id,email,role.id,role.name              -> full record
//      fields=...,role.admin_access                   -> {"id":"..."}
//
//    That returned a user with no role at all, so `isAdmin` was false
//    while `authenticated` stayed true, and middleware/admin.ts
//    redirected every administrator out of /worlds/:id/admin to '/'.
//
// Policies are read from both the role and the user, because Directus 11
// allows either to carry them. See app/utils/directusAccess.ts for the
// matching read side.
export const DIRECTUS_ME_FIELDS =
  'id,email,first_name,last_name,role.id,role.name,' +
  'role.policies.policy.admin_access,role.policies.policy.app_access,' +
  'policies.policy.admin_access,policies.policy.app_access'

export async function fetchDirectusMe(event: H3Event) {
  try {
    return await directusRequest(
      `/users/me?fields=${DIRECTUS_ME_FIELDS}`,
      { method: 'GET' },
      event
    )
  } catch (error: any) {
    // Only the access-token-expired case is recoverable -- anything else
    // (network failure, Directus down, a genuinely malformed request)
    // should fail exactly as it did before this fix, not trigger a
    // refresh attempt that has no chance of helping.
    const statusCode = error?.response?.status ?? error?.statusCode
    if (statusCode !== 401) {
      throw error
    }

    const refreshedToken = await refreshDirectusSession(event)
    if (!refreshedToken) {
      throw error
    }

    // Passed explicitly rather than re-read from the (unchanged, within
    // this same request) incoming cookie -- setSessionCookies wrote the
    // new token to the RESPONSE via setCookie, which the browser will
    // send back on its NEXT request, not this one. directusRequest must
    // be told the fresh token directly to actually use it now.
    return await directusRequest(
      `/users/me?fields=${DIRECTUS_ME_FIELDS}`,
      { method: 'GET', headers: { Authorization: `Bearer ${refreshedToken}` } },
      event
    )
  }
}
