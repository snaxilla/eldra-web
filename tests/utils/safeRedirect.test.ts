// Unit tests for post-login redirect validation
// (app/utils/safeRedirect.ts). The value comes from the URL, so these
// tests are as much about what must be REJECTED as what is accepted.

import { describe, expect, it } from 'vitest'
import { safeRedirectTarget } from '../../app/utils/safeRedirect'

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
