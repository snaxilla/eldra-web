// Validates a post-login `?redirect=` target before navigating to it.
//
// Route middleware records where the user was actually trying to go
// (middleware/auth.ts, middleware/admin.ts) and the login page sends them
// back there. That value arrives from the URL, so it is untrusted input:
// without validation, `/login?redirect=https://evil.example` would turn
// the login form into an open redirect. Only same-origin, absolute-path
// targets are accepted; everything else falls back to the caller's own
// default.

export function safeRedirectTarget(value: unknown): string | null {
  const target = Array.isArray(value) ? value[0] : value

  if (typeof target !== 'string') return null

  const trimmed = target.trim()

  // Must be an absolute path on this origin.
  if (!trimmed.startsWith('/')) return null

  // `//host` (protocol-relative) and `/\host` (browser-normalized to the
  // same thing) both escape to another origin despite starting with '/'.
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null

  // Never bounce back to the login page itself -- that would loop.
  if (trimmed === '/login' || trimmed.startsWith('/login?')) return null

  return trimmed
}

// Authentication Flow Cleanup -- the single place that decides where a
// visitor lands AFTER a successful (or already-valid) login: the
// `?redirect=` target they were actually headed to, if any and if it
// survives `safeRedirectTarget`'s validation, else `fallback`. Used by
// login.vue for both of its own call sites (a fresh login's `submit()`,
// and an already-authenticated visitor's guard) so the two can never
// diverge -- there is exactly one definition of "where does login send
// you," not one per caller.
export function resolvePostLoginDestination(redirectQuery: unknown, fallback: string = '/'): string {
  return safeRedirectTarget(redirectQuery) || fallback
}

// The redirect location app/middleware/auth.ts and app/middleware/admin.ts
// both navigate an unauthenticated visitor to -- factored out so the two
// middlewares can't drift into subtly different shapes (one is the
// canonical mechanism this task explicitly says to prefer over a second,
// parallel auth system). `path` is the ALREADY-current route's own
// `to.fullPath`, not user input from a query string, so it does not need
// `safeRedirectTarget` validation here -- that validation happens on the
// way BACK OUT, in `resolvePostLoginDestination` above, once this value
// has round-tripped through the URL and become untrusted again.
export function buildLoginRedirect(path: string): { path: string; query: { redirect: string } } {
  return { path: '/login', query: { redirect: path } }
}
