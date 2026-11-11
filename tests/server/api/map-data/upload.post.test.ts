// Unit tests for the RETIRED POST /api/map-data/upload/:id
// (server/api/map-data/upload/[id].post.ts).
//
// Obsolete-upload-endpoint closure (media ownership policy follow-up).
// Confirmed before retirement: zero callers anywhere in the repository;
// git history ("Reset map API onto flat map-data routes") shows this was
// the map API's earlier, superseded shape. Unlike
// server/api/uploads/image.post.ts, this route did NOT hardcode
// credentials -- it used env-based access and a real `world.map.edit`
// check -- but it never stamped `world_id`, so it would have been an
// alternate, authenticated upload path silently bypassing the media
// ownership policy if it were ever reachable again. Retired rather than
// patched, since the active implementation
// (server/api/worlds/[id]/maps/upload.post.ts) already exists and
// already stamps ownership correctly.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

const handlerModule = await import('../../../../server/api/map-data/upload/[id].post')
const handler = handlerModule.default

describe('POST /api/map-data/upload/:id (retired)', () => {
  it('always responds 410 Gone, regardless of request contents', async () => {
    await expect(handler({} as unknown as import('h3').H3Event)).rejects.toMatchObject({ statusCode: 410 })
  })

  it('names the replacement endpoint in the error message', async () => {
    await expect(handler({} as unknown as import('h3').H3Event)).rejects.toMatchObject({
      statusMessage: expect.stringContaining('/api/worlds/:id/maps/upload')
    })
  })

  it('never contacts Directus -- fetch is never called, and no file can be created through this path', async () => {
    await expect(handler({} as unknown as import('h3').H3Event)).rejects.toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
