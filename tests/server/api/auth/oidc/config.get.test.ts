// Unit tests for GET /api/auth/oidc/config (server/api/auth/oidc/config.get.ts).
// Public (server/middleware/authorize.ts's PUBLIC_API_ROUTES) -- what
// app/pages/login.vue asks before deciding whether to show its "Sign in
// with your identity provider" button.

import { describe, expect, it, vi } from 'vitest'

const { isOidcConfiguredMock } = vi.hoisted(() => ({ isOidcConfiguredMock: vi.fn() }))

vi.mock('../../../../../server/utils/oidc', () => ({ isOidcConfigured: isOidcConfiguredMock }))

import handler from '../../../../../server/api/auth/oidc/config.get'

describe('GET /api/auth/oidc/config', () => {
  it('reports configured:true with no other field when OIDC is configured', async () => {
    isOidcConfiguredMock.mockReturnValue(true)

    const result = await handler({} as any)

    expect(result).toEqual({ configured: true })
  })

  it('reports configured:false when OIDC is not configured', async () => {
    isOidcConfiguredMock.mockReturnValue(false)

    const result = await handler({} as any)

    expect(result).toEqual({ configured: false })
  })

  it('never leaks the issuer URL, client id, or secret -- the response has exactly one key', async () => {
    isOidcConfiguredMock.mockReturnValue(true)

    const result: any = await handler({} as any)

    expect(Object.keys(result)).toEqual(['configured'])
  })
})
