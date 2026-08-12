// Unit tests for Directus access-flag resolution
// (app/utils/directusAccess.ts).
//
// The shapes asserted here are not invented -- they are the actual
// responses from the deployed instance (directus/directus:11.12.0),
// captured while tracing why an administrator was being redirected out
// of /worlds/:id/admin:
//
//   fields=id,email,role.id,role.name,role.admin_access
//     -> {"data":{"id":"2d429e8b-..."}}                      COLLAPSED
//
//   fields=id,email,role.id,role.name,
//          role.policies.policy.admin_access,
//          policies.policy.admin_access
//     -> {"data":{"id":"...","email":null,"first_name":"EldraService",
//                 "role":{"id":"...","name":"Administrator",
//                         "policies":[{"policy":{"admin_access":true,
//                                                "app_access":true}}]},
//                 "policies":[{"policy":{"admin_access":true,
//                                        "app_access":true}}]}}

import { describe, expect, it } from 'vitest'
import { policiesGrant, resolveAccessFlag } from '../../app/utils/directusAccess'

describe('policiesGrant', () => {
  it('grants when a policy in the array sets the flag', () => {
    expect(policiesGrant([{ policy: { admin_access: true } }], 'admin_access')).toBe(true)
  })

  it('grants when any policy in a multi-policy array sets the flag', () => {
    const policies = [
      { policy: { admin_access: false, app_access: true } },
      { policy: { admin_access: true, app_access: true } }
    ]
    expect(policiesGrant(policies, 'admin_access')).toBe(true)
  })

  it('does not grant when every policy withholds the flag', () => {
    const policies = [{ policy: { admin_access: false } }, { policy: { admin_access: false } }]
    expect(policiesGrant(policies, 'admin_access')).toBe(false)
  })

  it('keeps admin_access and app_access independent', () => {
    const policies = [{ policy: { admin_access: false, app_access: true } }]
    expect(policiesGrant(policies, 'admin_access')).toBe(false)
    expect(policiesGrant(policies, 'app_access')).toBe(true)
  })

  it('treats a truthy-but-not-true value as no grant', () => {
    // Authorization must not widen on a coercion accident.
    expect(policiesGrant([{ policy: { admin_access: 1 as never } }], 'admin_access')).toBe(false)
  })

  it('tolerates every malformed shape Directus could return', () => {
    expect(policiesGrant(undefined, 'admin_access')).toBe(false)
    expect(policiesGrant(null, 'admin_access')).toBe(false)
    expect(policiesGrant([], 'admin_access')).toBe(false)
    expect(policiesGrant('not-an-array', 'admin_access')).toBe(false)
    expect(policiesGrant([null], 'admin_access')).toBe(false)
    expect(policiesGrant([{ policy: null }], 'admin_access')).toBe(false)
    // An unexpanded relation arrives as a bare id string, not an object.
    expect(policiesGrant([{ policy: 'policy-uuid' as never }], 'admin_access')).toBe(false)
  })
})

describe('resolveAccessFlag -- Directus 11 (policies)', () => {
  it('resolves admin from policies on the role', () => {
    const user = {
      id: 'u1',
      role: { id: 'r1', name: 'Administrator', policies: [{ policy: { admin_access: true } }] }
    }
    expect(resolveAccessFlag(user, 'admin_access')).toBe(true)
  })

  it('resolves admin from policies attached directly to the user, with no role', () => {
    const user = { id: 'u1', policies: [{ policy: { admin_access: true } }] }
    expect(resolveAccessFlag(user, 'admin_access')).toBe(true)
  })

  it('resolves admin from the real deployed Administrator payload', () => {
    const user = {
      id: '2d429e8b-1893-4fd3-9b08-926f4dbbdeca',
      email: null,
      first_name: 'EldraService',
      last_name: null,
      role: {
        id: 'd8d57332-683e-4ca3-925c-51134417caaa',
        name: 'Administrator',
        policies: [{ policy: { admin_access: true, app_access: true } }]
      },
      policies: [{ policy: { admin_access: true, app_access: true } }]
    }
    expect(resolveAccessFlag(user, 'admin_access')).toBe(true)
    expect(resolveAccessFlag(user, 'app_access')).toBe(true)
  })

  it('denies a non-admin whose policies grant only app access', () => {
    const user = {
      id: 'u2',
      role: { id: 'r2', name: 'Player', policies: [{ policy: { admin_access: false, app_access: true } }] }
    }
    expect(resolveAccessFlag(user, 'admin_access')).toBe(false)
    expect(resolveAccessFlag(user, 'app_access')).toBe(true)
  })
})

describe('resolveAccessFlag -- legacy Directus 10 (flag on the role)', () => {
  it('still reads the flag directly off the role', () => {
    const user = { id: 'u1', role: { id: 'r1', name: 'Administrator', admin_access: true } }
    expect(resolveAccessFlag(user, 'admin_access')).toBe(true)
  })

  it('unwraps a nested role envelope', () => {
    const user = { id: 'u1', role: { data: { id: 'r1', admin_access: true } } }
    expect(resolveAccessFlag(user, 'admin_access')).toBe(true)
  })
})

describe('resolveAccessFlag -- the regression this fix exists for', () => {
  it('denies the collapsed {id}-only record Directus 11 returns for an invalid field request', () => {
    // This is what /users/me answered while DIRECTUS_ME_FIELDS asked for
    // `role.admin_access`: HTTP 200, authenticated, and no role at all.
    // It must resolve to "not admin" rather than throwing -- the bug was
    // never a crash, it was a silent demotion.
    expect(resolveAccessFlag({ id: '2d429e8b-1893-4fd3-9b08-926f4dbbdeca' }, 'admin_access')).toBe(false)
  })

  it('denies an unexpanded role returned as a bare id string', () => {
    const user = { id: 'u1', role: 'd8d57332-683e-4ca3-925c-51134417caaa' }
    expect(resolveAccessFlag(user, 'admin_access')).toBe(false)
  })

  it('never throws on absent or malformed input', () => {
    expect(resolveAccessFlag(undefined, 'admin_access')).toBe(false)
    expect(resolveAccessFlag(null, 'admin_access')).toBe(false)
    expect(resolveAccessFlag({}, 'admin_access')).toBe(false)
  })
})
