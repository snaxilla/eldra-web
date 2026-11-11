// Unit tests for POST /api/worlds/:id/maps/upload
// (server/api/worlds/[id]/maps/upload.post.ts).
//
// Maps follow-up pass -- Area 3. Sam's reported failure: a 157MB map
// upload crashes with `RangeError: Invalid array length` thrown inside
// h3's own readMultipartFormData, after ~221 seconds, before the route
// ever reaches map processing. The route now parses the body with
// server/utils/streaming-multipart.ts instead (covered on its own in
// tests/server/utils/streaming-multipart.test.ts); these tests cover the
// route's use of that parser -- authorization, the Content-Length fast
// fail, a malformed body failing cleanly instead of as a raw 500, and the
// existing upload/tile-generation behavior being preserved end to end.
import { Readable } from 'node:stream'
import type { IncomingHttpHeaders } from 'node:http'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Principal } from '../../../../../../server/utils/authorization'

const { uploadFileMock, createMapMock, updateMapMock, generateMapTilesMock, requireCapabilityMock, readStreamingMultipartFormMock } = vi.hoisted(() => ({
  uploadFileMock: vi.fn(),
  createMapMock: vi.fn(),
  updateMapMock: vi.fn(),
  generateMapTilesMock: vi.fn(),
  requireCapabilityMock: vi.fn(),
  readStreamingMultipartFormMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/directus-maps', () => ({
  uploadFile: uploadFileMock,
  createMap: createMapMock,
  updateMap: updateMapMock
}))

vi.mock('../../../../../../server/utils/map-tiles', () => ({
  generateMapTiles: generateMapTilesMock
}))

vi.mock('../../../../../../server/utils/authorization', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../server/utils/authorization')>(
    '../../../../../../server/utils/authorization'
  )
  return { ...actual, requireCapability: requireCapabilityMock }
})

// Real parsing is exercised thoroughly against real multipart bytes in
// tests/server/utils/streaming-multipart.test.ts. Here the mock delegates
// to the real implementation by default (so most of these tests still
// exercise genuine field/file extraction end to end), while individual
// tests can override it to simulate the parser's own failure modes
// (MultipartFileTooLargeError, a generic parse error) without needing a
// real oversized fixture or module-cache gymnastics.
vi.mock('../../../../../../server/utils/streaming-multipart', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../server/utils/streaming-multipart')>(
    '../../../../../../server/utils/streaming-multipart'
  )
  readStreamingMultipartFormMock.mockImplementation(actual.readStreamingMultipartForm)
  return { ...actual, readStreamingMultipartForm: readStreamingMultipartFormMock }
})

const handlerModule = await import('../../../../../../server/api/worlds/[id]/maps/upload.post')
const handler = handlerModule.default
const { MAX_MAP_UPLOAD_BYTES } = handlerModule
const { MultipartFileTooLargeError } = await import('../../../../../../server/utils/streaming-multipart')

const CRLF = '\r\n'
const BOUNDARY = 'EldraRouteTestBoundary'

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
    worldCapabilities: new Map([[worldId, new Set(['world.map.edit'])]]),
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
  uploadFileMock.mockReset()
  createMapMock.mockReset()
  updateMapMock.mockReset()
  generateMapTilesMock.mockReset()
  requireCapabilityMock.mockReset()
})

describe('POST /api/worlds/:id/maps/upload', () => {
  it('fails with 401 when no principal is present', async () => {
    const body = buildMultipartBody([{ name: 'title', value: 'x' }])
    await expect(handler(fakeEvent('6', null, body))).rejects.toMatchObject({ statusCode: 401 })
    expect(requireCapabilityMock).not.toHaveBeenCalled()
  })

  it('checks world.map.edit via requireCapability before parsing the body', async () => {
    requireCapabilityMock.mockImplementation(() => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    })

    const body = buildMultipartBody([{ name: 'title', value: 'x' }])
    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 403 })
    expect(uploadFileMock).not.toHaveBeenCalled()
  })

  it('uploads a map, creates the record, and skips tile generation when not requested', async () => {
    uploadFileMock.mockResolvedValue({ id: 'file-1' })
    createMapMock.mockResolvedValue({ id: 'map-1', title: 'Sword Coast' })

    const body = buildMultipartBody([
      { name: 'title', value: 'Sword Coast' },
      { name: 'type', value: 'world' },
      { name: 'file', filename: 'map.png', contentType: 'image/png', data: Buffer.from([1, 2, 3, 4]) }
    ])

    const result = await handler(fakeEvent('6', ownerPrincipal('6'), body))

    expect(uploadFileMock).toHaveBeenCalledWith(expect.any(Buffer), 'map.png', 'image/png', '6')
    expect(uploadFileMock.mock.calls[0][0].equals(Buffer.from([1, 2, 3, 4]))).toBe(true)
    expect(createMapMock).toHaveBeenCalledWith('6', 'Sword Coast', 'world', 'file-1', {
      tile_enabled: false,
      tile_status: 'none'
    })
    expect(generateMapTilesMock).not.toHaveBeenCalled()
    expect(result).toEqual({ id: 'map-1', title: 'Sword Coast' })
  })

  it('generates tiles and updates the map record when generateTiles is requested -- preserves tile-generation behavior', async () => {
    uploadFileMock.mockResolvedValue({ id: 'file-2' })
    createMapMock.mockResolvedValue({ id: 'map-2' })
    generateMapTilesMock.mockResolvedValue({
      tilePath: '/tiles/map-2',
      tileSourcePath: '/source/map-2.png',
      tileMinZoom: 0,
      tileMaxZoom: 5,
      tileFormat: 'webp',
      tileOriginalWidth: 1024,
      tileOriginalHeight: 768
    })
    updateMapMock.mockResolvedValue({ id: 'map-2', tile_enabled: true })

    const body = buildMultipartBody([
      { name: 'title', value: 'Icewind Dale' },
      { name: 'type', value: 'area' },
      { name: 'generateTiles', value: 'true' },
      { name: 'tileMaxZoom', value: '5' },
      { name: 'file', filename: 'map.png', contentType: 'image/png', data: Buffer.from([9, 9, 9]) }
    ])

    const result = await handler(fakeEvent('6', ownerPrincipal('6'), body))

    expect(createMapMock).toHaveBeenCalledWith('6', 'Icewind Dale', 'area', 'file-2', {
      tile_enabled: false,
      tile_status: 'processing',
      tile_min_zoom: 0,
      tile_max_zoom: 5,
      tile_format: 'webp'
    })
    expect(generateMapTilesMock).toHaveBeenCalledWith({
      mapId: 'map-2',
      buffer: expect.any(Buffer),
      filename: 'map.png',
      minZoom: 0,
      maxZoom: 5
    })
    expect(updateMapMock).toHaveBeenCalledWith('map-2', expect.objectContaining({ tile_enabled: true, tile_status: 'ready' }))
    expect(result).toEqual({ id: 'map-2', tile_enabled: true })
  })

  it('marks the map as tile_status failed and returns a clean 500 when tile generation throws', async () => {
    uploadFileMock.mockResolvedValue({ id: 'file-3' })
    createMapMock.mockResolvedValue({ id: 'map-3' })
    generateMapTilesMock.mockRejectedValue(new Error('sharp blew up'))
    updateMapMock.mockResolvedValue({ id: 'map-3' })

    const body = buildMultipartBody([
      { name: 'title', value: 'Broken Map' },
      { name: 'generateTiles', value: 'true' },
      { name: 'file', filename: 'map.png', contentType: 'image/png', data: Buffer.from([1]) }
    ])

    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'sharp blew up'
    })
    expect(updateMapMock).toHaveBeenCalledWith('map-3', expect.objectContaining({ tile_status: 'failed' }))
  })

  it('fails with 400 when no file part is present', async () => {
    const body = buildMultipartBody([{ name: 'title', value: 'No File' }])
    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 400 })
    expect(uploadFileMock).not.toHaveBeenCalled()
  })

  // Area 3 regression coverage: a request whose declared Content-Length
  // already exceeds the configured ceiling is rejected immediately, with a
  // clean 413, before the body is ever parsed -- the "enforce it before
  // expensive processing" requirement, and the cheapest possible
  // reproduction of "oversized requests fail cleanly" without allocating a
  // multi-hundred-megabyte test fixture.
  it('rejects an oversized request by Content-Length before parsing the body -- enforces the ceiling before expensive processing', async () => {
    const body = buildMultipartBody([{ name: 'title', value: 'x' }])
    const event = fakeEvent('6', ownerPrincipal('6'), body, {
      'content-length': String(MAX_MAP_UPLOAD_BYTES + 1)
    })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 413 })
    expect(uploadFileMock).not.toHaveBeenCalled()
    expect(createMapMock).not.toHaveBeenCalled()
  })

  // Regression for the reported failure mode itself: a file that exceeds
  // the parser's own size boundary (independent of any Content-Length
  // header) must fail as a clean, actionable error -- never an unhandled
  // RangeError escaping as a generic 500. The boundary enforcement itself
  // (a real oversized file actually getting rejected by the real parser)
  // is exercised directly, with real bytes, in
  // tests/server/utils/streaming-multipart.test.ts; this test is about
  // the ROUTE's translation of that failure into a clean response.
  it('rejects a file that exceeds the parser size boundary with a clean 413, not a raw 500', async () => {
    readStreamingMultipartFormMock.mockRejectedValueOnce(new MultipartFileTooLargeError('file', MAX_MAP_UPLOAD_BYTES))

    const body = buildMultipartBody([{ name: 'title', value: 'Too Big' }])

    await expect(handler(fakeEvent('6', ownerPrincipal('6'), body))).rejects.toMatchObject({ statusCode: 413 })
    expect(uploadFileMock).not.toHaveBeenCalled()
  })

  it('fails cleanly with 400 for a malformed multipart body instead of an opaque 500', async () => {
    const malformedBody = Buffer.from('this is not a multipart body at all')
    const event = fakeEvent('6', ownerPrincipal('6'), malformedBody, {
      'content-type': 'multipart/form-data' // no boundary= -- busboy's constructor throws synchronously
    })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(uploadFileMock).not.toHaveBeenCalled()
  })
})
