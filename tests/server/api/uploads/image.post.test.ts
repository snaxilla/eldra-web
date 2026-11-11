// Unit tests for the RETIRED POST /api/uploads/image
// (server/api/uploads/image.post.ts).
//
// Obsolete-upload-endpoint closure (media ownership policy follow-up).
// Confirmed before retirement: zero callers anywhere in the repository,
// yet the route was genuinely live (no route exclusion in
// nuxt.config.ts) and the original handler contacted Directus with a
// hardcoded production URL and bearer token. These tests prove the
// retired handler can no longer upload anything or contact Directus at
// all -- not merely that the old source text is gone. (Deliberately no
// test reproduces the retired credential literal itself -- "never
// contacts Directus at all" is the property that actually matters, and
// is sufficient on its own: nothing can be leaked over a request that is
// never made.)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

const handlerModule = await import('../../../../server/api/uploads/image.post')
const handler = handlerModule.default

describe('POST /api/uploads/image (retired)', () => {
  it('always responds 410 Gone, regardless of request contents', async () => {
    await expect(handler({} as unknown as import('h3').H3Event)).rejects.toMatchObject({ statusCode: 410 })
  })

  it('names the replacement endpoint in the error message', async () => {
    await expect(handler({} as unknown as import('h3').H3Event)).rejects.toMatchObject({
      statusMessage: expect.stringContaining('/api/worlds/:id/media/upload')
    })
  })

  it('never contacts Directus, or anything else -- fetch is never called, so no credential of any kind can ever be sent', async () => {
    await expect(handler({} as unknown as import('h3').H3Event)).rejects.toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
