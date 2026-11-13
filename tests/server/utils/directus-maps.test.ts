// Unit tests for server/utils/directus-maps.ts's uploadFile -- media
// ownership policy follow-up. `uploadFile` is the shared helper
// server/api/worlds/[id]/maps/upload.post.ts calls to create a Map's
// Directus file record; these tests prove `world_id` rides the SAME
// multipart create request as the file bytes when a caller supplies one,
// and that the helper never invents or defaults an owner when a caller
// does not.
//
// `form-data` (the Node package this file actually uses, not the Web API
// FormData) has no simple `.get(name)` accessor -- `getBuffer()` returns
// the fully-encoded multipart body, which is inspected as text below.
// Only the network call itself (`axios.post`) is mocked; the FormData
// construction is real.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const axiosPostMock = vi.fn()

vi.mock('axios', () => ({
  default: { post: axiosPostMock }
}))

const { uploadFile } = await import('../../../server/utils/directus-maps')

beforeEach(() => {
  axiosPostMock.mockReset()
  axiosPostMock.mockResolvedValue({ status: 200, data: { data: { id: 'file-1' } } })
})

describe('uploadFile', () => {
  it('includes world_id in the SAME multipart request as the file when a worldId is supplied', async () => {
    await uploadFile(Buffer.from([1, 2, 3]), 'map.png', 'image/png', '6')

    const [, form] = axiosPostMock.mock.calls[0]
    const body = form.getBuffer().toString('utf8')
    expect(body).toMatch(/name="world_id"\r\n\r\n6/)
    expect(body).toMatch(/name="file"; filename="map\.png"/)
    // Pass B review follow-up, Item 2: the real bug this guards against
    // is Directus silently dropping every field placed AFTER `file` in
    // the raw multipart body -- so this asserts the actual byte POSITION
    // of each part, not merely that both substrings appear somewhere.
    expect(body.indexOf('name="world_id"')).toBeLessThan(body.indexOf('name="file"'))
  })

  it('omits world_id entirely when no worldId is supplied -- never defaults an owner', async () => {
    await uploadFile(Buffer.from([1, 2, 3]), 'map.png', 'image/png')

    const [, form] = axiosPostMock.mock.calls[0]
    const body = form.getBuffer().toString('utf8')
    expect(body).not.toMatch(/name="world_id"/)
  })

  it('accepts a numeric worldId the same way', async () => {
    await uploadFile(Buffer.from([1]), 'x.png', 'image/png', 6)

    const [, form] = axiosPostMock.mock.calls[0]
    expect(form.getBuffer().toString('utf8')).toMatch(/name="world_id"\r\n\r\n6/)
  })

  it('still returns the created file record unchanged', async () => {
    const result = await uploadFile(Buffer.from([1]), 'x.png', 'image/png', '6')
    expect(result).toEqual({ id: 'file-1' })
  })
})
