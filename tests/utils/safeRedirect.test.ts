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
