// Unit tests for server/utils/entity-factory.ts's uploadImageToDirectus --
// media ownership policy follow-up. The shared helper behind character
// portrait uploads (both at character creation and later update); these
// tests prove `world_id` rides the SAME multipart create request as the
// file when a caller supplies one, and that the helper never invents or
// defaults an owner when a caller does not -- "do not globally default
// shared helpers to [any World]" applies here exactly as it does to
// uploadFile (server/utils/directus-maps.ts).
//
// The two real call sites (server/api/worlds/[id]/characters/create.post.ts,
// server/api/worlds/[id]/characters/[characterId]/update.post.ts) are
// one-line changes (`uploadImageToDirectus(imagePart, worldId)`) in files
// that rely on Nitro's own auto-imports rather than explicit h3 imports,
// so they are not directly Vitest-testable without a wider import-style
// change to those files -- out of scope for this follow-up. Verifying
// THIS helper's own stamping behavior directly, plus reading the two
// one-line call sites, is the closest practical boundary; both call sites
// were confirmed by direct source read, not assumed.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ data: { id: 'portrait-file-1' } })
  })
})

const { uploadImageToDirectus } = await import('../../../server/utils/entity-factory')

describe('uploadImageToDirectus', () => {
  it('includes world_id in the SAME multipart request as the file when a worldId is supplied', async () => {
    await uploadImageToDirectus({ data: Buffer.from([1, 2, 3]), type: 'image/png', filename: 'portrait.png' }, '6')

    const [, init] = fetchMock.mock.calls[0]
    const body = init.body as FormData
    expect(body.get('world_id')).toBe('6')
    expect((body.get('file') as File).name).toBe('portrait.png')
    // Pass B review follow-up, Item 2: `.get()` is order-independent and
    // would pass even with the real bug this guards against (Directus
    // silently drops every field appended AFTER `file`). `entries()`
    // reflects append order, so this actually proves `file` is LAST.
    const order = [...body.entries()].map(([key]) => key)
    expect(order.indexOf('file')).toBe(order.length - 1)
    expect(order.indexOf('world_id')).toBeLessThan(order.indexOf('file'))
  })

  it('omits world_id entirely when no worldId is supplied -- never defaults an owner', async () => {
    await uploadImageToDirectus({ data: Buffer.from([1, 2, 3]), type: 'image/png', filename: 'portrait.png' })

    const [, init] = fetchMock.mock.calls[0]
    const body = init.body as FormData
    expect(body.get('world_id')).toBeNull()
  })

  it('accepts a numeric worldId the same way', async () => {
    await uploadImageToDirectus({ data: Buffer.from([1]), type: 'image/png', filename: 'x.png' }, 6)

    const [, init] = fetchMock.mock.calls[0]
    expect((init.body as FormData).get('world_id')).toBe('6')
  })

  it('returns null without calling fetch when there is no file data -- unchanged behavior', async () => {
    const result = await uploadImageToDirectus({ type: 'image/png' }, '6')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still returns the uploaded file id unchanged', async () => {
    const result = await uploadImageToDirectus({ data: Buffer.from([1]), type: 'image/png', filename: 'x.png' }, '6')
    expect(result).toBe('portrait-file-1')
  })
})
