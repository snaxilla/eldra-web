// Eldra-owned sessions -- for an OIDC-authenticated principal, which has
// no Directus credential to validate a session against. See
// scripts/directus/create-eldra-sessions-schema.mjs for the collection
// this module is the only reader/writer of, and this task's own CRITICAL
// ARCHITECTURE GATE section for why this was the one genuinely new piece
// of infrastructure required.
//
// A DIRECTUS-AUTHENTICATED SESSION STILL WORKS EXACTLY AS BEFORE, AND
// NEVER TOUCHES THIS MODULE. `eldra_session`/`eldra_refresh` (raw
// Directus access/refresh tokens, validated via Directus `/users/me`)
// are unchanged -- this task's own instruction: "Keep Directus login
// available during the Beta transition." This module exists ONLY for
// the new `eldra_oidc_session` cookie an OIDC login issues.
//
// WHY A NEW SESSION MECHANISM WAS ACTUALLY NEEDED, NOT JUST CONVENIENT.
// Tracing confirmed that every piece of Eldra's existing authorization
// (server/utils/authorization.ts's `can()`/`requireCapability()`, the
// deny-by-default middleware, and 62+ call sites of
// directusServiceRequest for business data) is ALREADY completely
// independent of a user's own Directus credential -- `directusRequest`
// (the user-scoped client) has exactly 5 call sites in the whole
// codebase, every one of them inside login/logout/session-validation
// itself, never inside a single business-data read or write. So the
// ONLY thing an OIDC-authenticated principal was ever missing was a way
// to be RE-IDENTIFIED on each later request without a Directus
// credential to re-validate -- not a way to access Directus-backed data,
// which was never gated by that credential in the first place. This
// module is exactly that re-identification mechanism, nothing more.
//
// NEVER STORES THE RAW TOKEN -- see the schema script's own note on
// `token_hash`. The raw, random token exists only in the browser's
// httpOnly cookie and briefly in server memory per request; this module
// hashes it before every read or write and never logs or returns the
// raw value once issued.
//
// FAIL CLOSED. resolveEldraSession returns null for anything that is not
// an exact, unrevoked, unexpired match -- there is no fallback, no
// partial trust, and no path that widens access on a lookup failure
// (the same fail-closed discipline server/utils/authorization.ts's own
// Phase 1 review already established for membership/platform-grant
// reads).
import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'
import { createHash, randomBytes } from 'node:crypto'
import { directusServiceRequest } from './directus'

const SESSIONS_COLLECTION = 'eldra_sessions'
const SESSION_FIELDS = 'id,account_id,token_hash,created_at,expires_at,revoked_at,last_used_at'

// 7 days -- matching the existing `eldra_refresh` cookie's own lifetime
// (server/utils/directus.ts), so an OIDC-authenticated session and a
// Directus-authenticated one feel the same to a user. No sliding-window
// renewal in this phase: once expired, sign in again. Simpler, and
// nothing in this task asks for silent renewal.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export const ELDRA_SESSION_COOKIE = 'eldra_oidc_session'

// Mirrors server/utils/directus.ts's own `getSessionToken` shape exactly
// -- the cookie read for ONE session kind stays owned by the module that
// issues that kind, so server/utils/authorization.ts never calls h3's
// `getCookie` directly for either kind and can mock both symmetrically.
export function getEldraSessionToken(event: H3Event): string {
  return getCookie(event, ELDRA_SESSION_COOKIE) || ''
}

// Mirrors server/utils/directus.ts's own setSessionCookies cookie
// options exactly (httpOnly/secure/sameSite/path), so an OIDC-issued
// session and a Directus-issued one are indistinguishable to the browser
// in every respect except which cookie name carries them. `maxAge` is
// derived from the session's own `expiresAt` rather than re-stating
// SESSION_TTL_SECONDS, so the cookie's lifetime can never drift from the
// lifetime actually recorded in the store.
export function setEldraSessionCookie(event: H3Event, token: string, expiresAt: string): void {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))

  setCookie(event, ELDRA_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge
  })
}

// server/api/auth/logout.post.ts's counterpart for this cookie -- clears
// it unconditionally, independent of whether it was ever set, the same
// "safe to call regardless" shape deleteCookie already has for
// `eldra_session`/`eldra_refresh`.
export function clearEldraSessionCookie(event: H3Event): void {
  deleteCookie(event, ELDRA_SESSION_COOKIE, { path: '/' })
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

function generateRawToken(): string {
  // 256 bits of entropy, URL/cookie-safe.
  return randomBytes(32).toString('base64url')
}

export type EldraSessionRecord = {
  id: string
  accountId: string
  expiresAt: string
  revokedAt: string | null
}

function normalizeSession(row: any): EldraSessionRecord {
  return {
    id: String(row?.id ?? ''),
    accountId: String(row?.account_id ?? ''),
    expiresAt: String(row?.expires_at ?? ''),
    revokedAt: row?.revoked_at ?? null
  }
}

export type CreatedEldraSession = {
  // The RAW token -- set as the cookie value by the caller. This is the
  // only place this value is ever returned; it cannot be recovered from
  // the stored row afterward.
  token: string
  expiresAt: string
}

// Issues a new session for an Account. Called only after
// resolveAccountForIdentity has already confirmed the Account is real
// and active -- this function trusts its caller on that point and does
// not re-check it, matching server/utils/world-memberships.ts's own
// convention of validating identity ONCE, at the boundary that resolves
// it, rather than re-deriving it at every layer beneath.
export async function createEldraSession(accountId: string): Promise<CreatedEldraSession> {
  const token = generateRawToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString()

  await directusServiceRequest(`/items/${SESSIONS_COLLECTION}`, {
    method: 'POST',
    body: {
      account_id: accountId,
      token_hash: hashToken(token),
      created_at: now.toISOString(),
      expires_at: expiresAt
    }
  })

  return { token, expiresAt }
}

// Resolves a raw cookie token to the Account id it authenticates, or
// null for anything that is not an exact, unrevoked, unexpired match --
// including a token that was never issued, one that expired, one that
// was revoked by logout, and a lookup failure of the store itself (a
// thrown error is NOT caught here; it propagates, the same fail-loud
// choice server/utils/authorization.ts's resolvePrincipal already makes
// for a membership-read failure -- a session store outage must read as
// "authorization could not be determined," never as "not signed in,"
// and certainly never as "signed in").
export async function resolveEldraSession(rawToken: string): Promise<{ accountId: string } | null> {
  const token = String(rawToken ?? '').trim()
  if (!token) return null

  const tokenHash = hashToken(token)

  const res: any = await directusServiceRequest(`/items/${SESSIONS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { token_hash: { _eq: tokenHash } },
      limit: 1,
      fields: SESSION_FIELDS
    }
  })

  const row = Array.isArray(res?.data) ? res.data[0] : null
  if (!row) return null

  const session = normalizeSession(row)

  if (session.revokedAt) return null
  if (!session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) return null

  // Best-effort only -- a failure to record `last_used_at` must never
  // turn a valid session into an invalid one. Matches the same
  // "diagnostic write failure must not affect the real outcome" split
  // server/utils/character-ownership.ts's own applyOwnerChange already
  // established for its audit-confirmation write.
  directusServiceRequest(`/items/${SESSIONS_COLLECTION}/${session.id}`, {
    method: 'PATCH',
    body: { last_used_at: new Date().toISOString() }
  }).catch((error) => {
    console.error(`[eldra-sessions] failed to update last_used_at for session ${session.id}:`, error)
  })

  return { accountId: session.accountId }
}

// Revokes a session by its raw cookie token -- logout. Idempotent:
// revoking an already-revoked or nonexistent token is a silent no-op,
// never an error, since logging out twice (a double-click, a retried
// request) must behave exactly like logging out once.
export async function revokeEldraSession(rawToken: string): Promise<void> {
  const token = String(rawToken ?? '').trim()
  if (!token) return

  const tokenHash = hashToken(token)

  const res: any = await directusServiceRequest(`/items/${SESSIONS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { token_hash: { _eq: tokenHash } },
      limit: 1,
      fields: 'id,revoked_at'
    }
  })

  const row = Array.isArray(res?.data) ? res.data[0] : null
  if (!row || row.revoked_at) return

  await directusServiceRequest(`/items/${SESSIONS_COLLECTION}/${row.id}`, {
    method: 'PATCH',
    body: { revoked_at: new Date().toISOString() }
  })
}
