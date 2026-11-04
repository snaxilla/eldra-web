// Unit tests for post-login redirect validation
// (app/utils/safeRedirect.ts). The value comes from the URL, so these
// tests are as much about what must be REJECTED as what is accepted.

import { describe, expect, it } from 'vitest'
import { buildLoginRedirect, resolvePostLoginDestination, safeRedirectTarget } from '../../app/utils/safeRedirect'

describe('safeRedirectTarget -- accepts internal paths', () => {
  it('accepts the world admin route that triggered this fix', () => {
    expect(safeRedirectTarget('/worlds/12/admin')).toBe('/worlds/12/admin')
  })

  it('preserves query strings and hashes', () => {
    expect(safeRedirectTarget('/worlds/12/admin?tab=rules#top')).toBe('/worlds/12/admin?tab=rules#top')
  })

  it('accepts the site root', () => {
    expect(safeRedirectTarget('/')).toBe('/')
  })

  it('takes the first entry when the query param repeats', () => {
    expect(safeRedirectTarget(['/worlds/12/admin', '/other'])).toBe('/worlds/12/admin')
  })

  it('trims surrounding whitespace', () => {
    expect(safeRedirectTarget('  /worlds/12/admin  ')).toBe('/worlds/12/admin')
  })
})

describe('safeRedirectTarget -- rejects off-origin targets (open redirect)', () => {
  it('rejects an absolute URL', () => {
    expect(safeRedirectTarget('https://evil.example/phish')).toBeNull()
  })

  it('rejects a protocol-relative URL', () => {
    expect(safeRedirectTarget('//evil.example/phish')).toBeNull()
  })

  it('rejects a backslash-escaped authority, which browsers normalize to //', () => {
    expect(safeRedirectTarget('/\\evil.example/phish')).toBeNull()
  })

  it('rejects a javascript: payload', () => {
    expect(safeRedirectTarget('javascript:alert(1)')).toBeNull()
  })

  it('rejects a bare relative path with no leading slash', () => {
    expect(safeRedirectTarget('worlds/12/admin')).toBeNull()
  })

  // Security review (OIDC redirect-safety audit): browsers strip ASCII
  // tab/newline from a URL reference BEFORE applying backslash-as-slash
  // normalization, so a tab inserted between the leading slash and a
  // backslash defeats a check that only looks at the literal leading
  // characters. Confirmed directly against Node's own WHATWG URL
  // implementation: `new URL('/\t\\evil.example', base).host === 'evil.example'`.
  // This was reachable through server/api/auth/oidc/login.get.ts's
  // `?redirect=` -- the first caller to ever hand this value to a real
  // HTTP Location header (sendRedirect) rather than client-side
  // navigateTo.
  it('rejects a backslash-escaped authority even with a tab inserted before it (browser tab-stripping bypass)', () => {
    expect(safeRedirectTarget('/\t\\evil.example/phish')).toBeNull()
    expect(safeRedirectTarget('/\n\\evil.example/phish')).toBeNull()
    expect(safeRedirectTarget('/\r\\evil.example/phish')).toBeNull()
  })

  it('rejects a backslash anywhere in the target, not only at the start', () => {
    expect(safeRedirectTarget('/worlds/12\\evil.example')).toBeNull()
  })

  // CRLF embedded in a redirect target can never reach a legitimate
  // same-origin path, and the same new HTTP-header sink above means a
  // value like this would otherwise hit sendRedirect's Location header
  // (Node's http layer throws ERR_INVALID_CHAR for it rather than
  // permitting injection, but a crafted value should never get that far).
  it('rejects a value with an embedded CR/LF (HTTP header injection attempt)', () => {
    expect(safeRedirectTarget('/foo\r\nSet-Cookie: evil=1')).toBeNull()
  })
})

describe('safeRedirectTarget -- rejects malformed and looping input', () => {
  it('rejects missing/non-string values', () => {
    expect(safeRedirectTarget(undefined)).toBeNull()
    expect(safeRedirectTarget(null)).toBeNull()
    expect(safeRedirectTarget(42)).toBeNull()
    expect(safeRedirectTarget('')).toBeNull()
  })

  it('refuses to redirect back to the login page itself', () => {
    expect(safeRedirectTarget('/login')).toBeNull()
    expect(safeRedirectTarget('/login?redirect=/worlds/12/admin')).toBeNull()
  })
})

// Authentication Flow Cleanup -- resolvePostLoginDestination is the single
// function login.vue calls both after a fresh login and for an
// already-authenticated visitor's own guard, so these tests directly cover
// this task's own TESTING items 2-5.
describe('resolvePostLoginDestination', () => {
  it('preserves a valid requested internal destination (item 2/3: login preserves and returns to the requested route)', () => {
    expect(resolvePostLoginDestination('/worlds/12/admin')).toBe('/worlds/12/admin')
  })

  it('falls back to "/" when there is no redirect to honor (item 4)', () => {
    expect(resolvePostLoginDestination(undefined)).toBe('/')
    expect(resolvePostLoginDestination(null)).toBe('/')
  })

  it('accepts a caller-supplied fallback other than "/"', () => {
    expect(resolvePostLoginDestination(undefined, '/worlds')).toBe('/worlds')
  })

  it('rejects an external redirect target and falls back instead (item 5)', () => {
    expect(resolvePostLoginDestination('https://evil.example/phish')).toBe('/')
    expect(resolvePostLoginDestination('//evil.example/phish', '/worlds')).toBe('/worlds')
  })
})

// The shared redirect-location builder app/middleware/auth.ts and
// app/middleware/admin.ts both call (item 1: unauthenticated request ->
// login, with the originally requested route preserved for the round trip
// resolvePostLoginDestination completes above).
describe('buildLoginRedirect', () => {
  it('builds a /login location carrying the originally requested path as ?redirect=', () => {
    expect(buildLoginRedirect('/worlds/12/admin')).toEqual({
      path: '/login',
      query: { redirect: '/worlds/12/admin' }
    })
  })

  it('round-trips cleanly through resolvePostLoginDestination', () => {
    const location = buildLoginRedirect('/worlds/12/admin')
    expect(resolvePostLoginDestination(location.query.redirect)).toBe('/worlds/12/admin')
  })
})
