// Unit tests for POST /api/worlds/:id/presentation/upload-background
// (server/api/worlds/[id]/presentation/upload-background.post.ts).
//
// Media ownership policy follow-up. This route already resolved and
// verified `worldId` via its own route param + `world.settings.edit`
// capability check before uploading; these tests prove `world_id` now
// rides the SAME multipart create request as the file.
//
// h3's own `readMultipartFormData` is mocked (see
// apply-image.post.test.ts's own header for why).
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Principal } from '../../../../../../server/utils/authorization'

const { requireCapabilityMock, readMultipartFormDataMock } = vi.hoisted(() => ({
  requireCapabilityMock: vi.fn(),
  readMultipartFormDataMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/authorization', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../server/utils/authorization')>(
    '../../../../../../server/utils/authorization'
  )
  return { ...actual, requireCapability: requireCapabilityMock }
})

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readMultipartFormData: readMultipartFormDataMock }
})

const fetchMock = vi.fn()

const handlerModule = await import('../../../../../../server/api/worlds/[id]/presentation/upload-background.post')
const handler = handlerModule.default

function principal(worldId: string): Principal {
  return {
    accountId: 'gm-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.settings.edit'])]]),
    accountLookupKeys: []
  }
}

function fakeEvent(worldId: string, principalValue: Principal | null): H3Event {
  return { context: { principal: principalValue, params: { id: worldId } } } as unknown as H3Event
}

beforeEach(() => {
  requireCapabilityMock.mockReset()
  readMultipartFormDataMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  readMultipartFormDataMock.mockResolvedValue([
    { type: 'image/png', filename: 'bg.png', data: Buffer.from([1, 2, 3]) }
  ])
})

describe('POST /api/worlds/:id/presentation/upload-background', () => {
  it('stamps world_id in the SAME multipart request as the file', async () => {
    fetchMock.mockImplementationOnce(async (_url: string, init: { body?: unknown }) => {
      expect((init.body as FormData).get('world_id')).toBe('6')
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { id: 'bg-1' } }) }
    })

    const result = await handler(fakeEvent('6', principal('6')))

    expect(result).toMatchObject({ success: true, fileId: 'bg-1', imageUrl: '/api/assets/bg-1' })
  })

  it('fails with 401 when no principal is present, before any Directus call', async () => {
    await expect(handler(fakeEvent('6', null))).rejects.toMatchObject({ statusCode: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails with 403 when the Principal lacks world.settings.edit', async () => {
    requireCapabilityMock.mockImplementation(() => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    })

    await expect(handler(fakeEvent('6', principal('6')))).rejects.toMatchObject({ statusCode: 403 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
