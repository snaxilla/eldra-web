// Unit tests for POST /api/worlds/:id/media/upload
// (server/api/worlds/[id]/media/upload.post.ts).
//
// Media Gallery follow-up pass. Sam's reported failure: the same
// `RangeError: Invalid array length` previously fixed for the Maps
// upload route (commit 8fe6f78) also hit this route, because it still
// called h3's own readMultipartFormData directly. These tests prove the
// route now uses the shared streaming parser (server/utils/streaming-multipart.ts)
// rather than h3's, that a valid upload still reaches the existing
// Directus storage/metadata flow unchanged, that oversized/malformed
// requests fail cleanly, and that authentication/authorization/response
// contracts are intact.
import { Readable } from 'node:stream'
import type { IncomingHttpHeaders } from 'node:http'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Principal } from '../../../../../../server/utils/authorization'

const { directusServiceRequestMock, requireCapabilityMock, readStreamingMultipartFormMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  requireCapabilityMock: vi.fn(),
  readStreamingMultipartFormMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../../../../server/utils/authorization', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../server/utils/authorization')>(
    '../../../../../../server/utils/authorization'
  )
  return { ...actual, requireCapability: requireCapabilityMock }
})

// Real parsing is exercised against real multipart bytes in
// tests/server/utils/streaming-multipart.test.ts. Delegating to the real
// implementation here, by default, means these tests prove the ROUTE
// actually calls the shared parser (not merely that it COULD), while
// individual tests can still override it to simulate the parser's own
// failure modes without a real oversized fixture.
vi.mock('../../../../../../server/utils/streaming-multipart', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../server/utils/streaming-multipart')>(
    '../../../../../../server/utils/streaming-multipart'
  )
  readStreamingMultipartFormMock.mockImplementation(actual.readStreamingMultipartForm)
  return { ...actual, readStreamingMultipartForm: readStreamingMultipartFormMock }
})

const handlerModule = await import('../../../../../../server/api/worlds/[id]/media/upload.post')
const handler = handlerModule.default
const { MAX_MEDIA_UPLOAD_BYTES } = handlerModule
const { MultipartFileTooLargeError } = await import('../../../../../../server/utils/streaming-multipart')

const CRLF = '\r\n'
const BOUNDARY = 'EldraMediaRouteTestBoundary'

type Part = { name: string; value?: string; filename?: string; contentType?: string; data?: Buffer }

function buildMultipartBody(parts: Part[]): Buffer {
  const chunks: Buffer[] = []
  for (const part of parts) {
    chunks.push(Buffer.from(`--${BOUNDARY}${CRLF}`))
    let disposition = `Content-Disposition: form-data; name="${part.name}"`
    if (part.filename) disposition += `; filename="${part.filename}"`
    chunks.push(Buffer.from(disposition + CRLF))
    if (part.contentType) chunks.push(Buffer.from(`Content-Type: ${part.contentType}${CRLF}`))
    chunks.push(Buffer.from(CRLF))
    chunks.push(part.data ?? Buffer.from(part.value ?? ''))
    chunks.push(Buffer.from(CRLF))
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--${CRLF}`))
  return Buffer.concat(chunks)
}

function ownerPrincipal(worldId: string): Principal {
  return {
    accountId: 'owner-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.entity.edit'])]]),
    accountLookupKeys: []
  }
}

function fakeEvent(worldId: string, principal: Principal | null, body: Buffer, extraHeaders: IncomingHttpHeaders = {}): H3Event {
  const req = Readable.from([body]) as any
  req.headers = {
    'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    'content-length': String(body.length),
    ...extraHeaders
  }

  return {
    context: { principal, params: { id: worldId } },
    node: { req }
  } as unknown as H3Event
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  requireCapabilityMock.mockReset()
})

describe('POST /api/worlds/:id/media/upload', () => {
  it('fails with 401 when no principal is present', async () => {
    const body = buildMultipartBody([{ name: 'title', value: 'x' }])
    await expect(handler(fakeEvent('6', null, body))).rejects.toMatchObject({ statusCode: 401 })
    expect(requireCapabilityMock).not.toHaveBeenCalled()
  })

  it('checks world.entity.edit via requireCapability before parsing the body', async () => {
    requireCapabilityMock.mockImplementation(() => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    })

    const body = buildMultipartBody([{ name: 'title', value: 'x' }])
    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('uses the shared streaming parser rather than reading the body itself', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: { id: 'file-1' } })
    const body = buildMultipartBody([
      { name: 'title', value: 'Sword Coast' },
      { name: 'file', filename: 'map.png', contentType: 'image/png', data: Buffer.from([1, 2, 3]) }
    ])

    await handler(fakeEvent('6', ownerPrincipal('6'), body))

    expect(readStreamingMultipartFormMock).toHaveBeenCalledTimes(1)
    expect(readStreamingMultipartFormMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), { maxFileBytes: MAX_MEDIA_UPLOAD_BYTES })
  })

  it('uploads a valid image in ONE request carrying title/description/world_id, and returns the existing response shape -- preserves storage/metadata flow', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (path === '/files' && options?.method === 'POST') {
        expect(options.body).toBeInstanceOf(FormData)
        // Media ownership policy follow-up: title/description/world_id now
        // ride the SAME multipart create request as the file itself --
        // never a separate, failure-swallowed PATCH afterward.
        expect(options.body.get('title')).toBe('Sword Coast')
        expect(options.body.get('description')).toBe('Eldra media upload for world 6')
        expect(options.body.get('world_id')).toBe('6')
        // Pass B review follow-up, Item 2: `.get()` is order-independent
        // and would pass even with the real bug this guards against
        // (Directus silently drops every field appended AFTER `file`).
        // `entries()` reflects append order, so this actually proves
        // `file` is LAST.
        const order = [...(options.body as FormData).entries()].map(([key]) => key)
        expect(order.indexOf('file')).toBe(order.length - 1)
        expect(order.indexOf('title')).toBeLessThan(order.indexOf('file'))
        expect(order.indexOf('description')).toBeLessThan(order.indexOf('file'))
        expect(order.indexOf('world_id')).toBeLessThan(order.indexOf('file'))
        return {
          data: {
            id: 'file-42',
            filename_download: 'map.png',
            type: 'image/png',
            filesize: 3,
            uploaded_on: '2026-01-01T00:00:00Z'
          }
        }
      }
      throw new Error(`unexpected directusServiceRequest call: ${path}`)
    })

    const body = buildMultipartBody([
      { name: 'title', value: 'Sword Coast' },
      { name: 'file', filename: 'map.png', contentType: 'image/png', data: Buffer.from([1, 2, 3]) }
    ])

    const result = await handler(fakeEvent('6', ownerPrincipal('6'), body))

    expect(result).toEqual({
      id: 'file-42',
      title: 'Sword Coast',
      filename: 'map.png',
      type: 'image/png',
      filesize: 3,
      uploadedOn: '2026-01-01T00:00:00Z',
      url: '/api/assets/file-42'
    })
    // Only ONE Directus call ever happens -- no second, failure-swallowed
    // PATCH exists anymore for a failure to silently hide behind.
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the filename for the title when no title field is sent', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: { id: 'file-2' } })

    const body = buildMultipartBody([
      { name: 'file', filename: 'landscape.jpg', contentType: 'image/jpeg', data: Buffer.from([1]) }
    ])

    const result = await handler(fakeEvent('6', ownerPrincipal('6'), body))
    expect(result.title).toBe('landscape.jpg')
  })

  it('fails loudly (never a silently-unowned success) when the single create request itself fails', async () => {
    directusServiceRequestMock.mockRejectedValueOnce(Object.assign(new Error('Directus unavailable'), { statusCode: 502 }))

    const body = buildMultipartBody([
      { name: 'file', filename: 'map.png', contentType: 'image/png', data: Buffer.from([1, 2, 3]) }
    ])

    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 502 })
  })

  it('fails with 400 "No file uploaded" when the request has no parts at all', async () => {
    const body = buildMultipartBody([])
    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'No file uploaded' })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('fails with 400 "No image file found" when the file part is not an image type', async () => {
    const body = buildMultipartBody([
      { name: 'file', filename: 'notes.txt', contentType: 'text/plain', data: Buffer.from('hello') }
    ])
    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'No image file found in upload' })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('still returns 500 with a safe message if Directus never returns a file id', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: {} })
    const body = buildMultipartBody([
      { name: 'file', filename: 'map.png', contentType: 'image/png', data: Buffer.from([1]) }
    ])
    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 500 })
  })

  // Area 3-equivalent regression coverage for this route.
  it('rejects an oversized request by Content-Length before parsing the body', async () => {
    const body = buildMultipartBody([{ name: 'title', value: 'x' }])
    const event = fakeEvent('6', ownerPrincipal('6'), body, {
      'content-length': String(MAX_MEDIA_UPLOAD_BYTES + 1)
    })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 413 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects a file that exceeds the parser size boundary with a clean 413, not a raw 500', async () => {
    readStreamingMultipartFormMock.mockRejectedValueOnce(new MultipartFileTooLargeError('file', MAX_MEDIA_UPLOAD_BYTES))

    const body = buildMultipartBody([{ name: 'title', value: 'Too Big' }])

    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 413 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('fails cleanly with 400 for a malformed multipart body instead of an opaque 500', async () => {
    const malformedBody = Buffer.from('this is not a multipart body at all')
    const event = fakeEvent('6', ownerPrincipal('6'), malformedBody, {
      'content-type': 'multipart/form-data' // no boundary= -- busboy's constructor throws synchronously
    })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})
