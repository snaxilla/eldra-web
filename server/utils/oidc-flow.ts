// The short-lived httpOnly cookie that carries PKCE/state/nonce across the
// OIDC redirect round-trip (server/api/auth/oidc/login.get.ts and
// link.get.ts write it; callback.get.ts reads it). Split out of
// server/utils/oidc.ts because that module's own contract is "never
// touches a cookie" (see its header) -- this one is pure HTTP plumbing and
// knows nothing about token exchange.
//
// WHAT THIS DELIBERATELY DOES NOT CARRY: a target Account id. A 'link' flow
// only ever records `kind: 'link'` here -- callback.get.ts re-derives WHICH
// Account to link by reading the caller's own LIVE session at callback
// time, never from this cookie. If this cookie carried an accountId, a
// tampered or replayed value could point the link step at an attacker-
// chosen Account; not carrying one removes that vector structurally rather
// than by validating it carefully.
//
// SINGLE-USE. readAndClearOidcFlowState deletes the cookie the moment it
// reads it, before the caller even attempts the token exchange -- so a
// retried or replayed callback request (double-click, browser back
// button, an attacker resubmitting a captured callback URL) finds no flow
// state the second time, independent of whatever `completeAuthorizationCodeGrant`
// decides about the state/nonce/PKCE values themselves.
import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'

export const OIDC_FLOW_COOKIE = 'eldra_oidc_flow'

// 10 minutes -- long enough for a human to complete an identity provider's
// login UI, short enough that a stale cookie from an abandoned flow is not
// a long-lived replay target.
const FLOW_TTL_SECONDS = 60 * 10

export type OidcFlowKind = 'login' | 'link'

export type OidcFlowState = {
  codeVerifier: string
  state: string
  nonce: string
  kind: OidcFlowKind
  // A validated same-origin, absolute-path post-login destination, or
  // null. Already passed through app/utils/safeRedirect.ts's
  // safeRedirectTarget by the time it is written here -- this module does
  // not re-validate it, since by then it is Eldra's own cookie value, not
  // untrusted request input.
  redirect: string | null
}

export function setOidcFlowCookie(event: H3Event, flow: OidcFlowState): void {
  setCookie(event, OIDC_FLOW_COOKIE, JSON.stringify(flow), {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: FLOW_TTL_SECONDS
  })
}

function isValidFlowState(value: any): value is OidcFlowState {
  return (
    value &&
    typeof value.codeVerifier === 'string' && value.codeVerifier &&
    typeof value.state === 'string' && value.state &&
    typeof value.nonce === 'string' && value.nonce &&
    (value.kind === 'login' || value.kind === 'link') &&
    (value.redirect === null || typeof value.redirect === 'string')
  )
}

// Reads AND deletes the flow cookie in one step -- see this module's own
// header for why single-use matters. Returns null for anything that is not
// a well-formed flow state: no cookie (expired, never set, or already
// consumed), or a malformed/tampered value. Never throws -- a missing or
// bad flow cookie is an ordinary "your sign-in session could not be
// verified, try again" outcome, not a server error.
export function readAndClearOidcFlowState(event: H3Event): OidcFlowState | null {
  const raw = getCookie(event, OIDC_FLOW_COOKIE)
  deleteCookie(event, OIDC_FLOW_COOKIE, { path: '/' })

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return isValidFlowState(parsed) ? parsed : null
  } catch {
    return null
  }
}
