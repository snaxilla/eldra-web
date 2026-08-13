// Unit tests for POST /api/worlds (server/api/worlds/index.post.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §5.3
// and §12 Phase 0.
//
// requireCapability/can are exercised for REAL (not mocked) -- the point
// of this file is proving the route is actually wired to the Phase 0
// authorization module, not just that createWorld works in isolation
// (tests/server/utils/worlds.test.ts already covers that). createWorld
// itself IS mocked, so these tests are about authorization + request
// handling, not Directus persistence.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { createWorldMock } = vi.hoisted(() => ({
  createWorldMock: vi.fn()
}))

vi.mock('../../../../server/utils/worlds', () => ({
  createWorld: createWorldMock
}))

import handler from '../../../../server/api/worlds/index.post'
import type { Principal } from '../../../../server/utils/authorization'

function temporarySingleUserPrincipal(accountId = 'admin-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map(),
    temporarySingleUserMode: true
  }
}

function powerlessPrincipal(accountId = 'player-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map(),
    temporarySingleUserMode: false
  }
}

function fakeEvent(body: unknown, principal: Principal | null): H3Event {
  return {
    context: { principal },
    // node.res is a minimal stand-in for h3's real setResponseStatus,
    // which mutates event.node.res.statusCode directly on success.
    node: { req: {}, res: { statusCode: 200 } },
    // readBody is auto-imported by h3 at the Nitro level, but this route
    // imports it explicitly (same reasoning as server/middleware/authorize.ts)
    // -- h3's readBody reads the request body via unenv/node internals this
    // fake event doesn't implement, so _requestBody is a private hook this
    // test relies on instead. See the vi.mock of 'h3' below.
    _requestBody: body
  } as unknown as H3Event
}

// h3's real readBody needs a live Node request stream this test has no
// interest in constructing. defineEventHandler/createError/setResponseStatus
// pass through unchanged (real h3); readBody is replaced with one that
// reads the stand-in `_requestBody` fakeEvent() attaches above.
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

beforeEach(() => {
  createWorldMock.mockReset()
})

describe('POST /api/worlds', () => {
  it('fails closed with 401 when no principal is present (deny-by-default)', async () => {
    const event = fakeEvent({ name: 'New World' }, null)

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(createWorldMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for an authenticated principal lacking platform.world.create', async () => {
    const event = fakeEvent({ name: 'New World' }, powerlessPrincipal())

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(createWorldMock).not.toHaveBeenCalled()
  })

  it('succeeds for temporary single-user mode', async () => {
    createWorldMock.mockResolvedValue({ id: 1, name: 'New World', slug: 'new-world' })
    const event = fakeEvent({ name: 'New World' }, temporarySingleUserPrincipal('admin-1'))

    const result = await handler(event)

    expect(result).toEqual({ world: { id: 1, name: 'New World', slug: 'new-world' } })
    expect(createWorldMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'New World', ownerAccountId: 'admin-1' }))
  })

  it('rejects an empty or missing name with 400, before ever calling createWorld', async () => {
    const event = fakeEvent({ name: '   ' }, temporarySingleUserPrincipal())

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(createWorldMock).not.toHaveBeenCalled()
  })

  it('passes the resolved principal accountId as ownerAccountId, not anything client-supplied', async () => {
    createWorldMock.mockResolvedValue({ id: 2, name: 'World' })
    const event = fakeEvent({ name: 'World', ownerAccountId: 'attacker-supplied-id' }, temporarySingleUserPrincipal('real-admin'))

    await handler(event)

    expect(createWorldMock).toHaveBeenCalledWith(expect.objectContaining({ ownerAccountId: 'real-admin' }))
  })
})
