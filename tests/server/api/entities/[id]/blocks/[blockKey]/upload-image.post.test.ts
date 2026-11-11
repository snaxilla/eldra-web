// Unit tests for POST /api/entities/:id/blocks/:blockKey/upload-image
// (server/api/entities/[id]/blocks/[blockKey]/upload-image.post.ts).
//
// Media ownership policy follow-up. This route already resolved and
// verified the entity's owning World before uploading; these tests prove
// `world_id` now rides the SAME multipart create request as the file,
// and that the existing block/entity-not-found and authorization
// behavior are unchanged.
//
// h3's own `readMultipartFormData` is mocked (see
// apply-image.post.test.ts's own header for why) -- this route's parser
// is pre-existing, untouched behavior.
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Principal } from '../../../../../../../server/utils/authorization'

const { directusServiceRequestMock, requireCapabilityMock, readMultipartFormDataMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  requireCapabilityMock: vi.fn(),
  readMultipartFormDataMock: vi.fn()
}))

vi.mock('../../../../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
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

const handlerModule = await import('../../../../../../../server/api/entities/[id]/blocks/[blockKey]/upload-image.post')
const handler = handlerModule.default

function principal(worldId: string): Principal {
  return {
    accountId: 'gm-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.entity.edit'])]]),
    accountLookupKeys: []
  }
}

function fakeEvent(entityId: string, blockKey: string, principalValue: Principal | null): H3Event {
  return {
    context: { principal: principalValue, params: { id: entityId, blockKey } }
  } as unknown as H3Event
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  requireCapabilityMock.mockReset()
  readMultipartFormDataMock.mockReset()
  readMultipartFormDataMock.mockResolvedValue([
    { name: 'file', type: 'image/png', filename: 'x.png', data: Buffer.from([1, 2, 3]) }
  ])
  process.env.NUXT_PUBLIC_DIRECTUS_URL = 'https://directus.test'
})

describe('POST /api/entities/:id/blocks/:blockKey/upload-image', () => {
  it('stamps world_id in the SAME multipart request as the file, resolved from the entity', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: { method?: string; body?: unknown } = {}) => {
      if (path === '/items/entities/5') return { data: { id: 5, world_id: 6 } }
      if (path === '/items/block_instances') return { data: [{ id: 'block-1', data: {} }] }
      if (path === '/files' && options?.method === 'POST') {
        expect((options.body as FormData).get('world_id')).toBe('6')
        return { data: { id: 'file-1' } }
      }
      if (path === '/items/block_instances/block-1') return { data: {} }
      if (path === '/items/entities/5' && options?.method === 'PATCH') return { data: {} }
      throw new Error(`unexpected call: ${path} ${options?.method}`)
    })

    const result = await handler(fakeEvent('5', 'item_core', principal('6')))

    expect(result).toMatchObject({ ok: true, entityId: 5, blockKey: 'item_core', file: { id: 'file-1' } })
  })

  it('fails with 404 when the entity does not exist -- no World to stamp, no upload attempted', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: null })

    await expect(handler(fakeEvent('5', 'item_core', principal('6')))).rejects.toMatchObject({ statusCode: 404 })
    expect(requireCapabilityMock).not.toHaveBeenCalled()
  })

  it('fails with 403 when the Principal lacks world.entity.edit for the entity\'s World', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: { id: 5, world_id: 6 } })
    requireCapabilityMock.mockImplementation(() => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    })

    await expect(handler(fakeEvent('5', 'item_core', principal('6')))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
  })

  it('fails with 404 when the block does not exist for this entity/blockKey', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/entities/5') return { data: { id: 5, world_id: 6 } }
      if (path === '/items/block_instances') return { data: [] }
      throw new Error(`unexpected call: ${path}`)
    })

    await expect(handler(fakeEvent('5', 'item_core', principal('6')))).rejects.toMatchObject({ statusCode: 404 })
  })
})
