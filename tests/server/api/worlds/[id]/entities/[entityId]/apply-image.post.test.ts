// Unit tests for POST /api/worlds/:id/entities/:entityId/apply-image
// (server/api/worlds/[id]/entities/[entityId]/apply-image.post.ts).
//
// Media ownership policy follow-up. This route already verified the
// entity's owning World before uploading (the `entity.world_id !==
// worldId` check); these tests prove `world_id` now rides the SAME
// multipart create request as the file, and that the existing
// cross-World rejection and authorization behavior are unchanged.
//
// h3's own `readMultipartFormData` is mocked here (not re-exercised
// against real multipart bytes) -- this route's parser is pre-existing,
// untouched behavior, and real multipart parsing is already covered
// elsewhere (tests/server/utils/streaming-multipart.test.ts); mocking it
// is "Directus transport" in spirit -- it is the boundary between this
// route's own logic and h3's request-parsing internals, which this task
// does not touch.
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Principal } from '../../../../../../../server/utils/authorization'

const { requireCapabilityMock, readMultipartFormDataMock } = vi.hoisted(() => ({
  requireCapabilityMock: vi.fn(),
  readMultipartFormDataMock: vi.fn()
}))

vi.mock('../../../../../../../server/utils/authorization', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../../server/utils/authorization')>(
    '../../../../../../../server/utils/authorization'
  )
  return { ...actual, requireCapability: requireCapabilityMock }
})

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readMultipartFormData: readMultipartFormDataMock }
})

const fetchMock = vi.fn()

const handlerModule = await import('../../../../../../../server/api/worlds/[id]/entities/[entityId]/apply-image.post')
const handler = handlerModule.default

function principal(worldId: string): Principal {
  return {
    accountId: 'gm-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.entity.edit'])]]),
    accountLookupKeys: []
  }
}

function fakeEvent(worldId: string, entityId: string, principalValue: Principal | null): H3Event {
  return {
    context: { principal: principalValue, params: { id: worldId, entityId } }
  } as unknown as H3Event
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) }
}

beforeEach(() => {
  requireCapabilityMock.mockReset()
  readMultipartFormDataMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  readMultipartFormDataMock.mockResolvedValue([
    { name: 'file', type: 'image/png', filename: 'x.png', data: Buffer.from([1, 2, 3]) }
  ])
})

describe('POST /api/worlds/:id/entities/:entityId/apply-image', () => {
  it('fails with 404 when the entity belongs to a different World -- cross-World mismatch rejected', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 5, world_id: 7 } })) // entity lookup -- a DIFFERENT World

    await expect(handler(fakeEvent('6', '5', principal('6')))).rejects.toMatchObject({ statusCode: 404 })
    // Only the entity lookup happened -- no upload was ever attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stamps world_id in the SAME multipart request as the file once the entity is verified', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { id: 5, world_id: 6 } })) // entity lookup -- matches
      .mockImplementationOnce(async (_url: string, init: { body?: unknown }) => {
        const form = init.body as FormData
        expect(form.get('world_id')).toBe('6')
        // Pass B review follow-up, Item 2: `.get()` is order-independent
        // and would pass even with the real bug this is guarding against
        // (Directus silently drops every field appended AFTER `file`).
        // `entries()` reflects append order, so this actually proves
        // `file` is LAST.
        const order = [...form.entries()].map(([key]) => key)
        expect(order.indexOf('file')).toBe(order.length - 1)
        expect(order.indexOf('world_id')).toBeLessThan(order.indexOf('file'))
        return jsonResponse({ data: { id: 'file-99' } })
      })
      .mockResolvedValueOnce(jsonResponse({ data: { id: 5, image: 'file-99' } })) // entity PATCH

    const result = await handler(fakeEvent('6', '5', principal('6')))

    expect(result).toMatchObject({ success: true, fileId: 'file-99', imageUrl: '/api/assets/file-99' })
  })

  it('fails with 401 when no principal is present, before any Directus call', async () => {
    await expect(handler(fakeEvent('6', '5', null))).rejects.toMatchObject({ statusCode: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails with 403 when the Principal lacks world.entity.edit', async () => {
    requireCapabilityMock.mockImplementation(() => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    })

    await expect(handler(fakeEvent('6', '5', principal('6')))).rejects.toMatchObject({ statusCode: 403 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
