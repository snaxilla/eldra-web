// Unit tests for DELETE /api/worlds/:id/media/:fileId
// (server/api/worlds/[id]/media/[fileId]/index.delete.ts).
//
// Media Gallery Thumbnail Performance pass -- the ONE new behavior this
// route gained: clearing any cached thumbnail buffer
// (server/utils/media-thumbnails.ts) for a deleted file, so a large
// image's generated preview does not linger in process memory once its
// source is gone. Pre-existing usage-check/authorization/delete behavior
// is exercised only as needed to reach that new call -- it is otherwise
// unchanged and not re-proven exhaustively here.
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Principal } from '../../../../../../../server/utils/authorization'

const { directusServiceRequestMock, clearCachedThumbnailMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  clearCachedThumbnailMock: vi.fn()
}))

vi.mock('../../../../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../../../../../server/utils/media-thumbnails', () => ({
  clearCachedThumbnail: clearCachedThumbnailMock
}))

const handlerModule = await import('../../../../../../../server/api/worlds/[id]/media/[fileId]/index.delete')
const handler = handlerModule.default

function adminPrincipal(worldId: string): Principal {
  return {
    accountId: 'admin-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.entity.edit'])]]),
    accountLookupKeys: []
  }
}

function fakeEvent(worldId: string, fileId: string, principal: Principal | null): H3Event {
  return {
    context: { principal, params: { id: worldId, fileId } },
    path: `/api/worlds/${worldId}/media/${fileId}`
  } as unknown as H3Event
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  clearCachedThumbnailMock.mockReset()
  // No usage anywhere (every collectWorldFileUsage lookup returns empty)
  // -- the delete proceeds, exactly like a real unused file.
  directusServiceRequestMock.mockResolvedValue({ data: [] })
})

describe('DELETE /api/worlds/:id/media/:fileId -- thumbnail cache cleanup', () => {
  it('clears the cached thumbnail for this fileId after a successful delete', async () => {
    await handler(fakeEvent('6', 'file-123', adminPrincipal('6')))

    expect(clearCachedThumbnailMock).toHaveBeenCalledTimes(1)
    expect(clearCachedThumbnailMock).toHaveBeenCalledWith('file-123')
  })

  it('never clears the thumbnail cache when the delete is refused for still being in use', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/entities') {
        return { data: [{ id: 'e1', title: 'Hero', image: 'file-123' }] }
      }
      return { data: [] }
    })

    await expect(handler(fakeEvent('6', 'file-123', adminPrincipal('6')))).rejects.toMatchObject({ statusCode: 409 })
    expect(clearCachedThumbnailMock).not.toHaveBeenCalled()
  })

  it('never clears the thumbnail cache when the caller lacks world.entity.edit', async () => {
    const noCapabilityPrincipal: Principal = {
      accountId: 'player-1',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['6', new Set(['world.read'])]]),
      accountLookupKeys: []
    }

    await expect(handler(fakeEvent('6', 'file-123', noCapabilityPrincipal))).rejects.toMatchObject({ statusCode: 403 })
    expect(clearCachedThumbnailMock).not.toHaveBeenCalled()
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})
