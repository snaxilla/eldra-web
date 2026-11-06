// Unit tests for server/utils/streaming-multipart.ts -- the replacement for
// h3's own readMultipartFormData, written for the Maps follow-up pass.
//
// h3's hand-rolled parser (node_modules/h3/dist/index.mjs `parse()`) walks
// the whole request body byte by byte, pushing each byte onto a plain JS
// array. For a ~150MB map image that is reported to throw
// `RangeError: Invalid array length` and to hang for minutes before
// failing. These tests exercise the real busboy-backed replacement against
// real multipart bytes -- the field/file extraction contract it must keep,
// the size boundary it must enforce before any byte count gets near that
// failure mode, and that a malformed request fails cleanly rather than
// crashing.

import { Readable } from 'node:stream'
import type { IncomingHttpHeaders } from 'node:http'
import { describe, expect, it } from 'vitest'

import { MultipartFileTooLargeError, readStreamingMultipartForm } from '../../../server/utils/streaming-multipart'

const CRLF = '\r\n'
const BOUNDARY = 'EldraTestBoundary123'

type Part = { name: string; value?: string; filename?: string; contentType?: string; data?: Buffer }

function buildMultipartBody(parts: Part[]): Buffer {
  const chunks: Buffer[] = []

  for (const part of parts) {
    chunks.push(Buffer.from(`--${BOUNDARY}${CRLF}`))
    let disposition = `Content-Disposition: form-data; name="${part.name}"`
    if (part.filename) disposition += `; filename="${part.filename}"`
    chunks.push(Buffer.from(disposition + CRLF))
    if (part.contentType) {
      chunks.push(Buffer.from(`Content-Type: ${part.contentType}${CRLF}`))
    }
    chunks.push(Buffer.from(CRLF))
    chunks.push(part.data ?? Buffer.from(part.value ?? ''))
    chunks.push(Buffer.from(CRLF))
  }

  chunks.push(Buffer.from(`--${BOUNDARY}--${CRLF}`))
  return Buffer.concat(chunks)
}

function fakeRequest(body: Buffer, headers: IncomingHttpHeaders): Readable {
  return Readable.from([body]) as Readable & { headers: IncomingHttpHeaders }
}

function multipartHeaders(): IncomingHttpHeaders {
  return { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` }
}

describe('readStreamingMultipartForm', () => {
  it('extracts fields and a file from a real multipart body', async () => {
    const body = buildMultipartBody([
      { name: 'title', value: 'Sword Coast' },
      { name: 'type', value: 'world' },
      { name: 'generateTiles', value: 'true' },
      { name: 'file', filename: 'map.png', contentType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) }
    ])

    const result = await readStreamingMultipartForm(fakeRequest(body, multipartHeaders()), multipartHeaders(), {
      maxFileBytes: 1024 * 1024
    })

    expect(result.fields).toEqual({ title: 'Sword Coast', type: 'world', generateTiles: 'true' })
    expect(result.file).not.toBeNull()
    expect(result.file!.filename).toBe('map.png')
    expect(result.file!.mimeType).toBe('image/png')
    expect(result.file!.data.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).toBe(true)
  })

  it('returns a null file when no file part is present', async () => {
    const body = buildMultipartBody([{ name: 'title', value: 'No File Here' }])

    const result = await readStreamingMultipartForm(fakeRequest(body, multipartHeaders()), multipartHeaders(), {
      maxFileBytes: 1024
    })

    expect(result.file).toBeNull()
    expect(result.fields.title).toBe('No File Here')
  })

  it('reassembles a file spanning many chunks without dropping or reordering bytes', async () => {
    // The real bug this module replaces was never about SMALL files --
    // it is specifically about files assembled from many bytes. Exercise a
    // file large enough to arrive across multiple internal buffer pushes.
    const payload = Buffer.alloc(200_000)
    for (let i = 0; i < payload.length; i++) payload[i] = i % 256

    const body = buildMultipartBody([
      { name: 'file', filename: 'big.bin', contentType: 'application/octet-stream', data: payload }
    ])

    const result = await readStreamingMultipartForm(fakeRequest(body, multipartHeaders()), multipartHeaders(), {
      maxFileBytes: 10 * 1024 * 1024
    })

    expect(result.file!.data.length).toBe(payload.length)
    expect(result.file!.data.equals(payload)).toBe(true)
  })

  it('rejects with MultipartFileTooLargeError once the file exceeds the configured boundary -- the size boundary this module exists to enforce', async () => {
    const data = Buffer.alloc(5000, 7)
    const body = buildMultipartBody([
      { name: 'file', filename: 'oversized.bin', contentType: 'application/octet-stream', data }
    ])

    await expect(
      readStreamingMultipartForm(fakeRequest(body, multipartHeaders()), multipartHeaders(), { maxFileBytes: 10 })
    ).rejects.toBeInstanceOf(MultipartFileTooLargeError)
  })

  it('accepts a file comfortably under the configured byte boundary', async () => {
    const data = Buffer.alloc(9, 9)
    const body = buildMultipartBody([
      { name: 'file', filename: 'under.bin', contentType: 'application/octet-stream', data }
    ])

    const result = await readStreamingMultipartForm(fakeRequest(body, multipartHeaders()), multipartHeaders(), {
      maxFileBytes: 10
    })

    expect(result.file!.data.length).toBe(9)
  })

  it('rejects cleanly for a malformed request -- multipart content-type with no boundary', async () => {
    const headers: IncomingHttpHeaders = { 'content-type': 'multipart/form-data' }
    const body = Buffer.from('garbage, not a real multipart body')

    await expect(
      readStreamingMultipartForm(fakeRequest(body, headers), headers, { maxFileBytes: 1024 })
    ).rejects.toBeInstanceOf(Error)
  })
})
