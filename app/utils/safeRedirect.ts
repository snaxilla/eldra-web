// Validates a post-login `?redirect=` target before navigating to it.
//
// Route middleware records where the user was actually trying to go
// (middleware/auth.ts, middleware/admin.ts) and the login page sends them
// back there. That value arrives from the URL, so it is untrusted input:
// without validation, `/login?redirect=https://evil.example` would turn
// the login form into an open redirect. Only same-origin, absolute-path
// targets are accepted; everything else falls back to the caller's own
// default.

// Matches any ASCII control character (0x00-0x1F, 0x7F) or a backslash,
// ANYWHERE in the string -- not just at the start. Security review
// finding (OIDC redirect-safety audit): the WHATWG URL parser every
// browser uses strips ASCII tab/newline from a URL reference BEFORE
// applying its own backslash-as-slash normalization for special schemes
// (http/https). That ordering defeats a leading-characters-only check: a
// value like "/\t\\evil.com" does not start with "/\\" (its second
// character is a tab), so it survived the old `trimmed.startsWith('/\\')`
// check, yet `new URL('/\t\\evil.com', 'https://example.com')` resolves to
// `https://evil.com/` -- confirmed directly against Node's own URL
// implementation (the same WHATWG algorithm browsers use) before this
// fix. A backslash or control character anywhere in an intended same-
// origin path is never legitimate, so rejecting the whole value outright
// (rather than trying to enumerate every position a tab could occupy) is
// both safe and cannot reject any real target.
const UNSAFE_REDIRECT_CHARS = /[\x00-\x1f\x7f\\]/

export function safeRedirectTarget(value: unknown): string | null {
  const target = Array.isArray(value) ? value[0] : value

  if (typeof target !== 'string') return null

  const trimmed = target.trim()

  // Must be an absolute path on this origin.
  if (!trimmed.startsWith('/')) return null

  // Control characters (CR/LF/tab/etc.) and backslashes are never part of
  // a legitimate same-origin path -- see UNSAFE_REDIRECT_CHARS's own
  // comment for the browser-normalization bypass this specifically
  // closes, and server/api/auth/oidc/callback.get.ts's own header for the
  // new sink (a literal HTTP Location header) that made this exploitable
  // rather than merely malformed.
  if (UNSAFE_REDIRECT_CHARS.test(trimmed)) return null

  // `//host` (protocol-relative) escapes to another origin despite
  // starting with '/'. (The `/\host` backslash variant is now covered by
  // the blanket backslash check above.)
  if (trimmed.startsWith('//')) return null

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
