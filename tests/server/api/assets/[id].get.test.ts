// Unit tests for GET /api/assets/:id (server/api/assets/[id].get.ts) --
// the shared asset-serving proxy ~80 call sites across this app build an
// image URL against.
//
// Media Gallery Thumbnail Performance pass. The CRITICAL property these
// tests exist to prove: every pre-existing caller (no `preset` query
// param) gets byte-for-byte the same behavior as before this pass --
// this route is the single most shared piece of infrastructure this
// pass touches. `preset=card` tests prove the three distinct paths: (1)
// Directus's own transform succeeds (preferred path), (2) Directus
// refuses it (`ILLEGAL_ASSET_TRANSFORMATION`, confirmed empirically
// against a disposable instance to be its real response for a source
// over its own transform size ceiling) and this route falls back to the
// app-level generator, (3) any OTHER failure still propagates -- never
// silently swallowed into a fallback.
//
// `fetch` is mocked at the global boundary (established precedent --
// tests/server/api/uploads/image.post.test.ts, apply-image.post.test.ts).
// `getOrGenerateThumbnail` (media-thumbnails.ts) is mocked here too --
// its own generation/caching/concurrency behavior is already covered by
// tests/server/utils/media-thumbnails.test.ts; these tests are about
// this route's own branching logic, not re-proving that module.
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThumbnailGenerationOverloadedError } from '../../../../server/utils/media-thumbnails'

const { getOrGenerateThumbnailMock } = vi.hoisted(() => ({
  getOrGenerateThumbnailMock: vi.fn()
}))

vi.mock('../../../../server/utils/media-thumbnails', async () => {
  const actual = await vi.importActual<typeof import('../../../../server/utils/media-thumbnails')>(
    '../../../../server/utils/media-thumbnails'
  )
  return { ...actual, getOrGenerateThumbnail: getOrGenerateThumbnailMock }
})

const fetchMock = vi.fn()

const handlerModule = await import('../../../../server/api/assets/[id].get')
const handler = handlerModule.default

function fakeResponse(init: { ok: boolean; status?: number; headers?: Record<string, string>; body?: unknown; textBody?: string }) {
  const headers = new Map(Object.entries(init.headers || {}))
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? headers.get(name) ?? null },
    body: init.body ?? 'stream-placeholder',
    text: async () => init.textBody ?? ''
  } as unknown as Response
}

function fakeEvent(id: string, query: Record<string, string> = {}) {
  const setHeaders: Record<string, string> = {}
  const search = new URLSearchParams(query).toString()
  const event = {
    context: { params: { id } },
    path: `/api/assets/${id}${search ? `?${search}` : ''}`,
    node: {
      res: {
        setHeader: (name: string, value: string) => {
          setHeaders[String(name).toLowerCase()] = String(value)
        }
      }
    }
  } as unknown as H3Event
  return { event, setHeaders }
}

beforeEach(() => {
  fetchMock.mockReset()
  getOrGenerateThumbnailMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  process.env.DIRECTUS_URL = 'https://directus.example.internal'
  process.env.DIRECTUS_TOKEN = 'test-service-token'
})

describe('GET /api/assets/:id -- no preset (every pre-existing caller)', () => {
  it('proxies the bare original, unchanged -- never requests a transform', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ ok: true, headers: { 'content-type': 'image/png', 'content-length': '12345' } })
    )

    const { event, setHeaders } = fakeEvent('file-1')
    const result = await handler(event)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://directus.example.internal/assets/file-1')
    expect(setHeaders['content-type']).toBe('image/png')
    expect(setHeaders['cache-control']).toBe('public, max-age=3600')
    expect(result).toBe('stream-placeholder')
  })

  it('propagates a non-ok response as before', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 404, textBody: 'File not found' }))

    const { event } = fakeEvent('missing-file')
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('an unrecognized preset value is treated exactly like no preset', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: true, headers: { 'content-type': 'image/png' } }))

    const { event } = fakeEvent('file-1', { preset: 'nonsense' })
    await handler(event)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://directus.example.internal/assets/file-1')
  })
})

describe('GET /api/assets/:id?preset=card -- Directus transform succeeds (preferred path)', () => {
  it('requests the card preset from Directus and never touches the fallback generator', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ ok: true, headers: { 'content-type': 'image/webp', 'content-length': '9000' } })
    )

    const { event, setHeaders } = fakeEvent('file-small', { preset: 'card' })
    const result = await handler(event)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestedUrl = String(fetchMock.mock.calls[0][0])
    expect(requestedUrl).toContain('/assets/file-small?')
    expect(requestedUrl).toContain('width=640')
    expect(requestedUrl).toContain('height=640')
    expect(requestedUrl).toContain('fit=inside')
    expect(requestedUrl).toContain('format=webp')
    expect(setHeaders['content-type']).toBe('image/webp')
    expect(getOrGenerateThumbnailMock).not.toHaveBeenCalled()
    expect(result).toBe('stream-placeholder')
  })

  it('ignores extra caller-supplied query parameters -- never forwards an unrestricted transform', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: true, headers: { 'content-type': 'image/webp' } }))

    // A caller appending width/height/fit/quality alongside `preset` must
    // never widen what actually reaches Directus -- only the fixed
    // `card` preset's own values are ever sent, regardless of what else
    // is on the query string.
    const { event } = fakeEvent('file-small', {
      preset: 'card',
      width: '99999',
      height: '1',
      fit: 'fill',
      quality: '1',
      format: 'png'
    })
    await handler(event)

    const requestedUrl = String(fetchMock.mock.calls[0][0])
    expect(requestedUrl).toContain('width=640')
    expect(requestedUrl).toContain('height=640')
    expect(requestedUrl).toContain('fit=inside')
    expect(requestedUrl).toContain('format=webp')
    expect(requestedUrl).not.toContain('99999')
    expect(requestedUrl).not.toContain('fill')
    expect(requestedUrl).not.toContain('format=png')
  })
})

describe('GET /api/assets/:id?preset=card -- a cache hit never bypasses the per-request existence/access check', () => {
  it('still asks Directus (the existence/status check) first, even when the fallback generator would resolve instantly from its own cache', async () => {
    // Simulates what a warm in-memory-cache hit inside
    // getOrGenerateThumbnail looks like from this route's perspective:
    // it resolves immediately, with no second fetch of its own. The
    // route itself has no notion of "cached" -- it always asks Directus
    // first, every single call, which is what re-validates the file
    // still exists/is still published on every request, cache hit or not.
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 400, textBody: JSON.stringify({
      errors: [{ message: 'Illegal asset transformation.', extensions: { invalidTransformations: ['width', 'height'], code: 'ILLEGAL_ASSET_TRANSFORMATION' } }]
    }) }))
    getOrGenerateThumbnailMock.mockResolvedValueOnce(Buffer.from('cached-bytes'))

    const { event } = fakeEvent('file-huge', { preset: 'card' })
    await handler(event)

    // Exactly one call reached Directus for the transform attempt --
    // this is the existence/access check -- before the (here, instant)
    // cache hit was ever consulted.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestedUrl = String(fetchMock.mock.calls[0][0])
    expect(requestedUrl).toContain('/assets/file-huge?')
  })

  it('a 404 for a since-deleted file is never masked by a stale cached buffer', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 404, textBody: 'File not found' }))

    const { event } = fakeEvent('file-deleted', { preset: 'card' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(getOrGenerateThumbnailMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/assets/:id?preset=card -- Directus refuses the oversized source (confirmed real response shape)', () => {
  function illegalTransformBody() {
    return JSON.stringify({
      errors: [{ message: 'Illegal asset transformation.', extensions: { invalidTransformations: ['width', 'height'], code: 'ILLEGAL_ASSET_TRANSFORMATION' } }]
    })
  }

  it('falls back to the app-level generator and serves its WebP output', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 400, textBody: illegalTransformBody() }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, headers: { 'content-type': 'image/png' }, body: 'original-stream' }))

    const generatedBuffer = Buffer.from('fake-webp-bytes')
    getOrGenerateThumbnailMock.mockResolvedValueOnce(generatedBuffer)

    const { event, setHeaders } = fakeEvent('file-huge', { preset: 'card' })
    const result = await handler(event)

    expect(getOrGenerateThumbnailMock).toHaveBeenCalledTimes(1)
    expect(getOrGenerateThumbnailMock.mock.calls[0][0]).toBe('file-huge')
    expect(setHeaders['content-type']).toBe('image/webp')
    expect(setHeaders['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(result).toBe(generatedBuffer)
  })

  it('the fallback opens the ORIGINAL (no transform params) as its source -- never re-requests a transform', async () => {
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      }
    })
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 400, textBody: illegalTransformBody() }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, headers: {}, body: webStream }))

    getOrGenerateThumbnailMock.mockImplementationOnce(async (_id: string, openSource: () => Promise<unknown>) => {
      await openSource()
      return Buffer.from('ok')
    })

    const { event } = fakeEvent('file-huge', { preset: 'card' })
    await handler(event)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://directus.example.internal/assets/file-huge')
  })

  it('a fallback generation failure is a clean error -- never a silent original fallback', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 400, textBody: illegalTransformBody() }))
    getOrGenerateThumbnailMock.mockRejectedValueOnce(new Error('sharp pipeline failed'))

    const { event } = fakeEvent('file-huge', { preset: 'card' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('an overloaded generator reports a clean 503, not a silent hang or an original fallback', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 400, textBody: illegalTransformBody() }))
    getOrGenerateThumbnailMock.mockRejectedValueOnce(new ThumbnailGenerationOverloadedError())

    const { event } = fakeEvent('file-huge', { preset: 'card' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
  })
})

describe('GET /api/assets/:id?preset=card -- any OTHER transform failure propagates, never falls back', () => {
  it('a plain 404 (file genuinely missing) is NOT treated as the oversized-image case', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 404, textBody: 'File not found' }))

    const { event } = fakeEvent('missing-file', { preset: 'card' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(getOrGenerateThumbnailMock).not.toHaveBeenCalled()
  })

  it('a 400 that is NOT the ILLEGAL_ASSET_TRANSFORMATION code propagates as-is', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ ok: false, status: 400, textBody: JSON.stringify({ errors: [{ message: 'Some other bad request' }] }) })
    )

    const { event } = fakeEvent('file-x', { preset: 'card' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(getOrGenerateThumbnailMock).not.toHaveBeenCalled()
  })

  // Review instruction: require verified oversized-source evidence
  // through the actual response, not the bare ILLEGAL_ASSET_TRANSFORMATION
  // code alone. Directus 11.12.0's own source has exactly one throw site
  // for this code and it always names width/height (see
  // isIllegalAssetTransformation's own header) -- this test pins the
  // defense-in-depth check against a HYPOTHETICAL future response that
  // reuses the same code for an unrelated field, proving it is correctly
  // NOT treated as the oversized-source case.
  it('the SAME error code with a DIFFERENT invalidTransformations field is not treated as an oversized source', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({
      ok: false,
      status: 400,
      textBody: JSON.stringify({
        errors: [{ message: 'Illegal asset transformation.', extensions: { invalidTransformations: ['fit'], code: 'ILLEGAL_ASSET_TRANSFORMATION' } }]
      })
    }))

    const { event } = fakeEvent('file-x', { preset: 'card' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(getOrGenerateThumbnailMock).not.toHaveBeenCalled()
  })

  it('the SAME error code with no invalidTransformations field at all is not treated as an oversized source', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({
      ok: false,
      status: 400,
      textBody: JSON.stringify({
        errors: [{ message: 'Illegal asset transformation.', extensions: { code: 'ILLEGAL_ASSET_TRANSFORMATION' } }]
      })
    }))

    const { event } = fakeEvent('file-x', { preset: 'card' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(getOrGenerateThumbnailMock).not.toHaveBeenCalled()
  })

  it('a 400 with an unparseable body propagates as-is rather than crashing', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ ok: false, status: 400, textBody: 'not json at all' }))

    const { event } = fakeEvent('file-x', { preset: 'card' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(getOrGenerateThumbnailMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/assets/:id -- missing id / missing config, unchanged', () => {
  it('400s on a missing id without calling fetch', async () => {
    const { event } = fakeEvent('')
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('500s when Directus configuration is missing', async () => {
    delete process.env.DIRECTUS_URL
    delete process.env.NUXT_PUBLIC_DIRECTUS_URL
    delete process.env.DIRECTUS_TOKEN

    const { event } = fakeEvent('file-1')
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 })
  })
})
