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
