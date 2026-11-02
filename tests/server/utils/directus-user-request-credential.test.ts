// Regression tests for the fail-closed credential decision in
// server/utils/directus.ts (Phase 1 authorization preflight, finding A).
//
// THE DEFECT THESE PIN. `directusRequest` -- the USER-scoped Directus
// client -- used to end with `const tokenToUse = sessionToken ||
// serviceToken`. A call that was meant to run as the logged-in user but
// arrived with no `event`, or with an expired/absent `eldra_session`
// cookie, silently ran with the Directus SERVICE token instead: full
// privileges, every per-user permission bypassed, no error, and nothing in
// the response distinguishing it from a correctly-scoped call. There are
// 62 service-token call sites in this codebase and a user-scoped helper
// that quietly becomes one of them is a trap for every future caller.
//
// resolveUserRequestCredential is that decision, extracted as a pure
// function precisely so this property is tested rather than merely
// reviewed: it has no access to the service token at all, so there is no
// input that can make it produce one.

import { describe, expect, it } from 'vitest'
import { resolveUserRequestCredential } from '../../../server/utils/directus'

describe('resolveUserRequestCredential -- fail closed', () => {
  it('uses the session token when one is resolvable', () => {
    expect(resolveUserRequestCredential({ sessionToken: 'user-token' })).toEqual({
      authorization: 'Bearer user-token',
      denied: false
    })
  })

  it('DENIES a user-scoped request with no session token -- never substitutes any other credential', () => {
    const credential = resolveUserRequestCredential({})

    expect(credential.denied).toBe(true)
    expect(credential.authorization).toBeNull()
  })

  it('denies an empty-string session token the same way as an absent one', () => {
    expect(resolveUserRequestCredential({ sessionToken: '' }).denied).toBe(true)
  })

  it('cannot be made to produce a service token -- there is no input that yields one', () => {
    // Every shape a caller could arrive in, including the one that used to
    // trigger the fallback (no event -> no session token).
    const shapes = [
      {},
      { sessionToken: '' },
      { unauthenticated: false },
      { authorizationHeader: '' },
      { authorizationHeader: '', sessionToken: '' }
    ]

    for (const shape of shapes) {
      const credential = resolveUserRequestCredential(shape)
      expect(credential.denied).toBe(true)
      expect(credential.authorization).toBeNull()
    }
  })

  it("honours a caller's own Authorization header verbatim, in preference to the cookie", () => {
    // server/api/auth/login.post.ts does exactly this: it holds the access
    // token Directus just issued, before any cookie exists on the request.
    const credential = resolveUserRequestCredential({
      authorizationHeader: 'Bearer just-issued',
      sessionToken: 'stale-cookie-token'
    })

    expect(credential).toEqual({ authorization: 'Bearer just-issued', denied: false })
  })

  it('sends NO Authorization header for an explicitly unauthenticated endpoint -- not the service token', () => {
    // `/auth/login` and `/auth/logout` authenticate by request body and
    // take no credential. Opting in must mean "send nothing", never
    // "send something stronger".
    const credential = resolveUserRequestCredential({ unauthenticated: true })

    expect(credential).toEqual({ authorization: null, denied: false })
  })

  it('still prefers a real session token over the unauthenticated opt-in', () => {
    const credential = resolveUserRequestCredential({
      sessionToken: 'user-token',
      unauthenticated: true
    })

    expect(credential).toEqual({ authorization: 'Bearer user-token', denied: false })
  })
})
