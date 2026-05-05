import { readFile } from 'node:fs/promises'

function safePart(value: any) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

export default defineEventHandler(async (event) => {
  const mapId = safePart(getRouterParam(event, 'mapId'))
  const z = safePart(getRouterParam(event, 'z'))
  const x = safePart(getRouterParam(event, 'x'))
  const yRaw = String(getRouterParam(event, 'y') || '')
  const y = safePart(yRaw.replace(/\.webp$/i, ''))

  if (!mapId || !z || !x || !y) {
    throw createError({ statusCode: 400, statusMessage: 'Missing tile path' })
  }

  const path = `/opt/eldra/maps/tiles/${mapId}/${z}/${x}/${y}.webp`

  try {
    const file = await readFile(path)
    setHeader(event, 'Content-Type', 'image/webp')
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return file
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Tile not found' })
  }
})
