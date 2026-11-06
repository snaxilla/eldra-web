// Streaming multipart/form-data parsing for large file uploads.
//
// Maps follow-up pass -- root cause of the large-map upload failure.
// h3's own readMultipartFormData (node_modules/h3/dist/index.mjs) first
// buffers the ENTIRE request body into one Buffer, then its hand-rolled
// parser walks that buffer byte by byte, pushing each byte individually
// onto a plain JS array (`buffer.push(currByte)`) for the whole file part.
// For a ~150MB map image that is both extremely slow (matches the
// ~221-second hang before failure) and can throw `RangeError: Invalid
// array length` while V8 grows that array. There is no size limit
// anywhere in the request path, so the parser is invoked unconditionally
// regardless of body size.
//
// This module reads the request as a real byte stream via busboy instead
// (chunked Buffer concatenation, never one JS array element per byte),
// bounded to `maxFileBytes` so a request can fail cleanly, before any
// Directus upload or tile generation starts, rather than buffering an
// unbounded amount of memory or crashing with an opaque RangeError.
import Busboy from 'busboy'
import type { IncomingHttpHeaders } from 'node:http'
import type { Readable } from 'node:stream'

export type StreamedMultipartFile = {
  fieldName: string
  filename: string
  mimeType: string
  data: Buffer
}

export type StreamedMultipartForm = {
  fields: Record<string, string>
  file: StreamedMultipartFile | null
}

export class MultipartFileTooLargeError extends Error {
  readonly fieldName: string
  readonly limitBytes: number

  constructor(fieldName: string, limitBytes: number) {
    super(`"${fieldName}" exceeded the ${limitBytes}-byte upload limit`)
    this.name = 'MultipartFileTooLargeError'
    this.fieldName = fieldName
    this.limitBytes = limitBytes
  }
}

export function readStreamingMultipartForm(
  req: Readable,
  headers: IncomingHttpHeaders,
  options: { maxFileBytes: number }
): Promise<StreamedMultipartForm> {
  return new Promise((resolve, reject) => {
    let parser: Busboy.Busboy
    try {
      parser = Busboy({ headers, limits: { fileSize: options.maxFileBytes, files: 1 } })
    } catch (error) {
      reject(error as Error)
      return
    }

    const fields: Record<string, string> = {}
    let file: StreamedMultipartFile | null = null
    let sizeError: MultipartFileTooLargeError | null = null
    let settled = false

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }

    parser.on('field', (name, value) => {
      fields[name] = value
    })

    parser.on('file', (name, stream, info) => {
      const chunks: Buffer[] = []

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      stream.on('limit', () => {
        sizeError = new MultipartFileTooLargeError(name, options.maxFileBytes)
      })

      stream.on('end', () => {
        if (sizeError) return
        file = {
          fieldName: name,
          filename: info.filename || '',
          mimeType: info.mimeType || 'application/octet-stream',
          data: Buffer.concat(chunks)
        }
      })

      stream.on('error', fail)
    })

    parser.on('error', fail)

    parser.on('finish', () => {
      if (settled) return
      settled = true
      if (sizeError) {
        reject(sizeError)
        return
      }
      resolve({ fields, file })
    })

    req.on('error', fail)
    req.pipe(parser)
  })
}
