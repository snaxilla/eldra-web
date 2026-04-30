import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const IMG_ROOT = '/opt/eldra/datasets/5etools-img'

function contentTypeFor(ext: string) {
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

export default defineEventHandler(async (event) => {
  const rawPath = String(getRouterParam(event, 'path') || '').trim()

  if (!rawPath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing image path'
    })
  }

  const cleaned = normalize(rawPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^\/+/, '')

  if (!cleaned || cleaned.includes('..')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image path'
    })
  }

  const fullPath = join(IMG_ROOT, cleaned)

  let data: Buffer
  try {
    data = await readFile(fullPath)
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Image not found'
    })
  }

  setHeader(event, 'Content-Type', contentTypeFor(extname(fullPath).toLowerCase()))
  setHeader(event, 'Cache-Control', 'public, max-age=86400')

  return data
})
