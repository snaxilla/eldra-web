// Unit tests for the Phase 0 deny-by-default enforcement middleware
// (server/middleware/authorize.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §11
// (Enforcement) and §12 Phase 0.
//
// resolvePrincipal is mocked at the module boundary -- this file tests the
// middleware's OWN routing/deny logic (which paths are public, which
// require a Principal, what happens when one can't be resolved), not
// resolvePrincipal's internals, which tests/server/utils/authorization.test.ts
// already covers directly.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { resolvePrincipalMock } = vi.hoisted(() => ({
  resolvePrincipalMock: vi.fn()
}))

vi.mock('../../../server/utils/authorization', () => ({
  resolvePrincipal: resolvePrincipalMock
}))

import authorize, { isApiRoute, isInternalApiRoute, isPublicApiRoute, requiresAuthentication } from '../../../server/middleware/authorize'
import type { Principal } from '../../../server/utils/authorization'

// getRequestURL (h3) reads event.node.req.originalUrl (falling back to
// event.path), event.node.req.headers.host, and
// event.node.req.headers['x-forwarded-proto'] /
// event.node.req.connection?.encrypted -- all absent here resolves to
// http://localhost<pathname>, which is all this middleware's own logic
// needs.
function fakeEvent(pathname: string): H3Event {
  return {
    node: { req: { headers: {}, originalUrl: pathname } },
    path: pathname,
    context: {}
  } as unknown as H3Event
}

beforeEach(() => {
  resolvePrincipalMock.mockReset()
})

describe('isApiRoute / isPublicApiRoute / requiresAuthentication -- pure routing decisions', () => {
  it('only /api/** paths are considered API routes', () => {
    expect(isApiRoute('/api/worlds')).toBe(true)
    expect(isApiRoute('/worlds/1')).toBe(false)
    expect(isApiRoute('/login')).toBe(false)
    expect(isApiRoute('/_nuxt/entry.js')).toBe(false)
  })

  it('the public allow-list is exactly the three routes that already read the session', () => {
    expect(isPublicApiRoute('/api/auth/login')).toBe(true)
    expect(isPublicApiRoute('/api/auth/logout')).toBe(true)
    expect(isPublicApiRoute('/api/auth/me')).toBe(true)
  })

  it('a route merely under /api/auth/ is NOT public unless it is exactly one of the three -- no prefix match', () => {
    expect(isPublicApiRoute('/api/auth/register')).toBe(false)
    expect(isPublicApiRoute('/api/auth/')).toBe(false)
  })

  it('non-API paths never require authentication, regardless of the allow-list', () => {
    expect(requiresAuthentication('/worlds/1')).toBe(false)
    expect(requiresAuthentication('/login')).toBe(false)
  })

  it('public API routes do not require authentication', () => {
    expect(requiresAuthentication('/api/auth/login')).toBe(false)
    expect(requiresAuthentication('/api/auth/me')).toBe(false)
  })

  it('deny-by-default: every other /api/** route requires authentication, with no per-route opt-out', () => {
    expect(requiresAuthentication('/api/worlds')).toBe(true)
    expect(requiresAuthentication('/api/worlds/1/rules/activate')).toBe(true)
    expect(requiresAuthentication('/api/worlds/1/entities')).toBe(true)
    // A route this task's own tests never anticipated -- new routes are
    // protected automatically, not by remembering to add them somewhere.
    expect(requiresAuthentication('/api/some/brand-new/route')).toBe(true)
  })

  // REGRESSION: @nuxt/icon serves icon data from /api/_nuxt_icon/:collection
  // (node_modules/@nuxt/icon/dist/module.mjs's own default,
  // `$default: "/api/_nuxt_icon"`) -- a Nuxt-module-internal route this
  // application never owned, but the original blanket "starts with /api/"
  // check gated it behind a login anyway, since server/middleware/* runs
  // for every request Nitro handles regardless of which module registered
  // the route. A leading underscore is the Nuxt ecosystem's own convention
  // for "internal, not application-owned," which is what isInternalApiRoute
  // keys on.
  it('Nuxt/Nitro-module-internal routes (leading underscore) are excluded from the API surface entirely', () => {
    expect(isInternalApiRoute('/api/_nuxt_icon/lucide.json')).toBe(true)
    expect(isInternalApiRoute('/api/_nuxt_icon/simple-icons.json')).toBe(true)
    expect(isInternalApiRoute('/api/worlds')).toBe(false)
  })

  it('internal routes never require authentication, even though they are under /api/', () => {
    expect(requiresAuthentication('/api/_nuxt_icon/lucide.json')).toBe(false)
  })

  it('an application route that merely CONTAINS an underscore deeper in the path is unaffected -- only a /api/_ prefix is excluded', () => {
    expect(isInternalApiRoute('/api/worlds/my_world/entities')).toBe(false)
    expect(requiresAuthentication('/api/worlds/my_world/entities')).toBe(true)
  })
})

describe('the middleware itself', () => {
  it('passes through page/asset requests without resolving a principal at all', async () => {
    const event = fakeEvent('/worlds/1')

    await authorize(event)

    expect(resolvePrincipalMock).not.toHaveBeenCalled()
    expect(event.context.principal).toBeUndefined()
  })

  it('passes through Nuxt-icon-style internal routes without resolving a principal (regression)', async () => {
    const event = fakeEvent('/api/_nuxt_icon/lucide.json')

    await authorize(event)

    expect(resolvePrincipalMock).not.toHaveBeenCalled()
    expect(event.context.principal).toBeUndefined()
  })

  it('passes through public API routes without resolving a principal', async () => {
    const event = fakeEvent('/api/auth/me')

    await authorize(event)

    expect(resolvePrincipalMock).not.toHaveBeenCalled()
  })

  it('throws 401 for a protected API route when no principal resolves -- fails closed, not open', async () => {
    resolvePrincipalMock.mockResolvedValue(null)
    const event = fakeEvent('/api/worlds/1/rules/activate')

    await expect(authorize(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('attaches the resolved principal to event.context and does not throw when one resolves', async () => {
    const principal: Principal = {
      accountId: 'admin-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: true
    }
    resolvePrincipalMock.mockResolvedValue(principal)
    const event = fakeEvent('/api/worlds/1/rules/activate')

    await authorize(event)

    expect(event.context.principal).toBe(principal)
  })
})
