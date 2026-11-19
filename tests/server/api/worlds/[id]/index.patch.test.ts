// Unit tests for PATCH /api/worlds/:id (server/api/worlds/[id]/index.patch.ts).
//
// World Properties -- Game Admin -> World Properties -> change name ->
// Save. `renameWorld` (server/utils/worlds.ts) is mocked here -- its own
// validation/no-op/identity-preservation behavior is already covered
// directly in tests/server/utils/worlds.test.ts; these tests are about
// this route's own authorization and HTTP-status mapping, exercising the
// REAL `requireCapability`/`can()` (not mocked), matching
// tests/server/api/worlds/[id]/index.get.test.ts's own precedent.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import type { Principal } from '../../../../../server/utils/authorization'

const { renameWorldMock } = vi.hoisted(() => ({
  renameWorldMock: vi.fn()
}))

vi.mock('../../../../../server/utils/worlds', () => ({
  renameWorld: renameWorldMock
}))

const handlerModule = await import('../../../../../server/api/worlds/[id]/index.patch')
const handler = handlerModule.default

function principal(worldCapabilities: [string, string[]][]): Principal {
  return {
    accountId: 'account-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map(worldCapabilities.map(([worldId, caps]) => [worldId, new Set(caps as any)])),
    accountLookupKeys: ['account-1']
  }
}

function ownerPrincipal(worldId: string): Principal {
  return principal([[worldId, ['world.read', 'world.settings.edit', 'world.entity.edit']]])
}

function worldbuilderPrincipal(worldId: string): Principal {
  // Holds world.entity.edit but NOT world.settings.edit -- exactly the
  // substitution this task's own instruction forbids ("do not substitute
  // world.entity.edit for World-settings authority").
  return principal([[worldId, ['world.read', 'world.entity.edit']]])
}

beforeEach(() => {
  renameWorldMock.mockReset()
})

// h3's readBody reads from the request stream, which this fake event has
// none of -- stub it directly rather than constructing a real body stream,
// matching the "mock h3 partially via importActual" precedent used
// elsewhere (e.g. apply-image.post.test.ts) when a route's own body-read
// is not what a test is about.
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn(async (event: any) => event.__body ?? {}) }
})

function fakeEventWithBody(worldId: string, p: Principal | null, body: any): H3Event {
  return {
    context: { principal: p, params: { id: worldId } },
    __body: body
  } as unknown as H3Event
}

describe('PATCH /api/worlds/:id -- authorization', () => {
  it('401s with no principal, never calling renameWorld', async () => {
    await expect(handler(fakeEventWithBody('5', null, { name: 'New Name' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(renameWorldMock).not.toHaveBeenCalled()
  })

  it('403s for a Principal holding world.entity.edit but NOT world.settings.edit -- the exact substitution forbidden by this task', async () => {
    await expect(
      handler(fakeEventWithBody('5', worldbuilderPrincipal('5'), { name: 'New Name' }))
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(renameWorldMock).not.toHaveBeenCalled()
  })

  it('403s for a Principal with no membership in this World at all', async () => {
    await expect(
      handler(fakeEventWithBody('5', principal([]), { name: 'New Name' }))
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(renameWorldMock).not.toHaveBeenCalled()
  })

  it('allows an owner (world.settings.edit) through to renameWorld', async () => {
    renameWorldMock.mockResolvedValue({ ok: true, changed: true, world: { id: 5, name: 'New Name', slug: 'old-slug' } })

    const result: any = await handler(fakeEventWithBody('5', ownerPrincipal('5'), { name: 'New Name' }))

    expect(renameWorldMock).toHaveBeenCalledWith('5', 'New Name')
    expect(result.world.name).toBe('New Name')
    expect(result.changed).toBe(true)
  })

  it('400s on a missing world id without ever resolving a principal', async () => {
    await expect(handler(fakeEventWithBody('', ownerPrincipal(''), { name: 'New Name' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(renameWorldMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/worlds/:id -- renameWorld result mapping', () => {
  it('maps an invalid-name/empty result to 400', async () => {
    renameWorldMock.mockResolvedValue({ ok: false, stage: 'invalid-name', reason: 'empty' })

    await expect(handler(fakeEventWithBody('5', ownerPrincipal('5'), { name: '' }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('maps an invalid-name/too-long result to 400', async () => {
    renameWorldMock.mockResolvedValue({ ok: false, stage: 'invalid-name', reason: 'too-long' })

    await expect(
      handler(fakeEventWithBody('5', ownerPrincipal('5'), { name: 'x'.repeat(300) }))
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('maps a not-found result to 404', async () => {
    renameWorldMock.mockResolvedValue({ ok: false, stage: 'not-found' })

    await expect(handler(fakeEventWithBody('999', ownerPrincipal('999'), { name: 'New Name' }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a non-string body.name is treated as empty, never forwarded as-is', async () => {
    renameWorldMock.mockResolvedValue({ ok: false, stage: 'invalid-name', reason: 'empty' })

    await expect(
      handler(fakeEventWithBody('5', ownerPrincipal('5'), { name: 12345 }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(renameWorldMock).toHaveBeenCalledWith('5', '')
  })

  it('reports changed:false for a no-op rename, as a success, not an error', async () => {
    renameWorldMock.mockResolvedValue({ ok: true, changed: false, world: { id: 5, name: 'Same Name', slug: 'same-slug' } })

    const result: any = await handler(fakeEventWithBody('5', ownerPrincipal('5'), { name: 'Same Name' }))

    expect(result.changed).toBe(false)
    expect(result.world.name).toBe('Same Name')
  })
})
