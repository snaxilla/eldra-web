// Unit tests for POST /api/map-pins/upload-image
// (server/api/map-pins/upload-image.post.ts).
//
// Media ownership policy follow-up. This route previously had NO
// authentication, NO World context, HARDCODED production Directus
// credentials, and the legacy (RangeError-prone) multipart parser --
// confirmed by direct read of its pre-existing source (see the route's
// own header). These tests prove the rewrite: `mapId` resolves and
// verifies the owning World server-side (never a client-supplied
// worldId), `world.map.edit` gates the request, `world_id` rides the
// SAME multipart create request as the file, and the established
// upload-limit/streaming-parser/env-based-Directus-access conventions
// now apply here exactly as they do on every sibling upload route.
import { Readable } from 'node:stream'
import type { IncomingHttpHeaders } from 'node:http'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Principal } from '../../../../server/utils/authorization'

const { directusServiceRequestMock, requireCapabilityMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  requireCapabilityMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../../server/utils/authorization', async () => {
  const actual = await vi.importActual<typeof import('../../../../server/utils/authorization')>(
    '../../../../server/utils/authorization'
  )
  return { ...actual, requireCapability: requireCapabilityMock }
})

const handlerModule = await import('../../../../server/api/map-pins/upload-image.post')
const handler = handlerModule.default
const { MAX_PIN_IMAGE_UPLOAD_BYTES } = handlerModule

const CRLF = '\r\n'
const BOUNDARY = 'EldraPinUploadTestBoundary'

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

function principal(): Principal {
  return {
    accountId: 'gm-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([['6', new Set(['world.map.edit'])]]),
    accountLookupKeys: []
  }
}

function fakeEvent(principalValue: Principal | null, body: Buffer, extraHeaders: IncomingHttpHeaders = {}): H3Event {
  const req = Readable.from([body]) as Readable & { headers: IncomingHttpHeaders }
  req.headers = {
    'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    'content-length': String(body.length),
    ...extraHeaders
  }

  return {
    context: { principal: principalValue },
    node: { req }
  } as unknown as H3Event
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  requireCapabilityMock.mockReset()
})

describe('POST /api/map-pins/upload-image', () => {
  it('fails with 401 when no principal is present', async () => {
    const body = buildMultipartBody([
      { name: 'mapId', value: 'map-1' },
      { name: 'file', filename: 'pin.png', contentType: 'image/png', data: Buffer.from([1]) }
    ])
    await expect(handler(fakeEvent(null, body))).rejects.toMatchObject({ statusCode: 401 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('fails with 400 when mapId is missing -- never falls back to an unverified World', async () => {
    const body = buildMultipartBody([
      { name: 'file', filename: 'pin.png', contentType: 'image/png', data: Buffer.from([1]) }
    ])
    await expect(handler(fakeEvent(principal(), body))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'mapId is required' })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('resolves worldId from the map (never trusting a client-supplied worldId), then gates world.map.edit', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: { method?: string; body?: unknown } = {}) => {
      if (path === '/items/maps/map-1' && options?.method === 'GET') {
        return { data: { id: 'map-1', world: 6 } }
      }
      if (path === '/files' && options?.method === 'POST') {
        const form = options.body as FormData
        expect(form.get('world_id')).toBe('6')
        // Pass B review follow-up, Item 2: `.get()` is order-independent
        // and would pass even with the real bug this is guarding against
        // (Directus silently drops every field appended AFTER `file`).
        // `entries()` reflects append order, so this actually proves
        // `file` is LAST.
        const order = [...form.entries()].map(([key]) => key)
        expect(order.indexOf('file')).toBe(order.length - 1)
        expect(order.indexOf('world_id')).toBeLessThan(order.indexOf('file'))
        return { data: { id: 'file-1' } }
      }
      throw new Error(`unexpected call: ${path}`)
    })

    const body = buildMultipartBody([
      { name: 'mapId', value: 'map-1' },
      { name: 'file', filename: 'pin.png', contentType: 'image/png', data: Buffer.from([1, 2, 3]) }
    ])

    const result = await handler(fakeEvent(principal(), body))

    expect(requireCapabilityMock).toHaveBeenCalledWith(expect.anything(), 'world.map.edit', { kind: 'world', worldId: '6' })
    expect(result).toEqual({ file_id: 'file-1', image_url: '/api/assets/file-1' })
  })

  it('fails with 403 when the Principal lacks world.map.edit for the resolved World', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: { id: 'map-1', world: 6 } })
    requireCapabilityMock.mockImplementation(() => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    })

    const body = buildMultipartBody([
      { name: 'mapId', value: 'map-1' },
      { name: 'file', filename: 'pin.png', contentType: 'image/png', data: Buffer.from([1]) }
    ])

    await expect(handler(fakeEvent(principal(), body))).rejects.toMatchObject({ statusCode: 403 })
    // The map lookup is allowed (it's how worldId is resolved at all), but
    // the file is never uploaded once the capability check fails.
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
  })

  it('fails with 404 when the referenced map does not exist', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: null })

    const body = buildMultipartBody([
      { name: 'mapId', value: 'ghost-map' },
      { name: 'file', filename: 'pin.png', contentType: 'image/png', data: Buffer.from([1]) }
    ])

    await expect(handler(fakeEvent(principal(), body))).rejects.toMatchObject({ statusCode: 404 })
    expect(requireCapabilityMock).not.toHaveBeenCalled()
  })

  it('fails with 400 when no image file is present', async () => {
    const body = buildMultipartBody([{ name: 'mapId', value: 'map-1' }])
    await expect(handler(fakeEvent(principal(), body))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'No image file found in upload' })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized request by Content-Length before parsing the body', async () => {
    const body = buildMultipartBody([{ name: 'mapId', value: 'map-1' }])
    const event = fakeEvent(principal(), body, { 'content-length': String(MAX_PIN_IMAGE_UPLOAD_BYTES + 1) })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 413 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('fails cleanly with 400 for a malformed multipart body instead of an opaque 500', async () => {
    const malformedBody = Buffer.from('not multipart at all')
    const event = fakeEvent(principal(), malformedBody, { 'content-type': 'multipart/form-data' })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})
