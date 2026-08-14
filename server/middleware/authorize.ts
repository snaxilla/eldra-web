// Phase 0 of .github/docs/architecture/ownership-and-permissions.md
// (Revision 2), §9.3/§11.3/§12. This is the deny-by-default enforcement
// boundary that milestone exists to build: today NOTHING reads the session
// outside three /api/auth/* routes (architecture doc §2.1), so every other
// API route accepts any caller who can reach the origin. This middleware
// closes that hole at the transport boundary, once, rather than depending
// on every one of 142 route files remembering to check.
//
// SCOPE: only /api/** requests are considered. Page requests (SSR, static
// assets, etc.) are untouched -- they are unaffected by this milestone and
// remain governed by app/middleware/auth.ts / admin.ts exactly as before.
//
// WHAT THIS DOES NOT DO: it does not enforce individual capabilities. Every
// non-public /api/** route requires ONLY "a resolved Principal" today --
// i.e. an authenticated caller -- because Phase 0 has no Membership model
// to check a capability against yet (architecture doc §12 Phase 0
// NON-GOALS: no repositories, no per-world roles). requireCapability()
// exists in server/utils/authorization.ts for routes to call explicitly
// once there is something meaningful to check against; this middleware's
// job is narrower and non-negotiable: no unauthenticated request reaches
// any non-public API route. That is "the enforcement boundary. Nothing
// more" (this task's own GOAL section).
//
// The resolved Principal is attached to event.context.principal so route
// handlers that DO call requireCapability() later never re-resolve it.
//
// createError/defineEventHandler/getRequestURL are imported explicitly
// (rather than relied on as Nitro auto-imports) so this module's pure
// routing-decision helpers below are importable and unit-testable under
// plain Vitest, which has no Nuxt/Nitro auto-import shims -- merely
// importing a module that references an auto-import-only global throws at
// import time. h3's exports are the exact functions Nitro auto-imports at
// runtime, so this changes nothing about production behavior.
import { createError, defineEventHandler, getRequestURL, type H3Event } from 'h3'
import { resolvePrincipal } from '../utils/authorization'

// The exact three routes the architecture doc's own audit (§2.1) found
// already reading the session cookie -- restated here as a literal
// allowlist rather than a prefix match, so a future route under
// /api/auth/** does not silently become public by accident.
export const PUBLIC_API_ROUTES = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/me'])

// Nuxt/Nitro modules that register their own server routes under /api/**
// (a naming convention this app's own routes never use) -- e.g.
// @nuxt/icon's server bundle, which serves icon data from
// /api/_nuxt_icon/:collection (verified: node_modules/@nuxt/icon/dist/module.mjs's
// own default, `$default: "/api/_nuxt_icon"`). server/middleware/* runs for
// EVERY request Nitro handles, regardless of which module registered the
// underlying route, so this middleware's original blanket "starts with
// /api/" check was gating icon data behind a login it has nothing to do
// with -- a leading underscore is the existing Nuxt ecosystem convention
// module authors already use to mark a route as internal/not
// application-owned, so it is what this exclusion keys on rather than a
// hardcoded list of module paths that would need updating per module.
const INTERNAL_API_PREFIXES = ['/api/_']

export function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.has(pathname)
}

export function isInternalApiRoute(pathname: string): boolean {
  return INTERNAL_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// True exactly for the requests this middleware must deny absent a
// resolved Principal: under /api/, not on the public allowlist, and not a
// Nuxt/Nitro-module-internal route this application never owned in the
// first place. Exported standalone so "which paths are protected" is
// testable as pure string logic, independent of constructing an H3Event.
export function requiresAuthentication(pathname: string): boolean {
  return isApiRoute(pathname) && !isPublicApiRoute(pathname) && !isInternalApiRoute(pathname)
}

export default defineEventHandler(async (event: H3Event) => {
  const pathname = getRequestURL(event).pathname

  if (!requiresAuthentication(pathname)) {
    return
  }

  const principal = await resolvePrincipal(event)

  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  event.context.principal = principal
})
