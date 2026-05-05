import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import sharp from 'sharp'

const TILE_ROOT = '/opt/eldra/maps'
const TILE_SIZE = 256

function safeId(value: string) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

export function mapTilePaths(mapId: string) {
  const id = safeId(mapId)
  return {
    sourcePath: `${TILE_ROOT}/source/${id}`,
    tileDir: `${TILE_ROOT}/tiles/${id}`,
    tileUrl: `/api/map-tiles/${id}/{z}/{x}/{y}.webp`
  }
}

export async function generateMapTiles(options: {
  mapId: string
  buffer: Buffer
  filename: string
  minZoom?: number
  maxZoom?: number
}) {
  const mapId = safeId(options.mapId)
  const minZoom = Number.isFinite(options.minZoom) ? Number(options.minZoom) : 0
  const maxZoom = Number.isFinite(options.maxZoom) ? Number(options.maxZoom) : 7
  const ext = options.filename?.split('.').pop()?.toLowerCase() || 'img'

  const paths = mapTilePaths(mapId)
  const sourceFile = `${paths.sourcePath}.${ext}`

  await mkdir(dirname(sourceFile), { recursive: true })
  await mkdir(paths.tileDir, { recursive: true })
  await rm(paths.tileDir, { recursive: true, force: true })
  await mkdir(paths.tileDir, { recursive: true })

  await writeFile(sourceFile, options.buffer)

  const metadata = await sharp(options.buffer).metadata()
  const originalWidth = metadata.width || 0
  const originalHeight = metadata.height || 0

  if (!originalWidth || !originalHeight) {
    throw new Error('Could not read uploaded map dimensions')
  }

  for (let z = minZoom; z <= maxZoom; z++) {
    const scale = Math.pow(2, z - maxZoom)
    const levelWidth = Math.max(1, Math.ceil(originalWidth * scale))
    const levelHeight = Math.max(1, Math.ceil(originalHeight * scale))
    const cols = Math.ceil(levelWidth / TILE_SIZE)
    const rows = Math.ceil(levelHeight / TILE_SIZE)

    const resized = await sharp(options.buffer)
      .resize(levelWidth, levelHeight, { fit: 'fill' })
      .png()
      .toBuffer()

    for (let x = 0; x < cols; x++) {
      await mkdir(`${paths.tileDir}/${z}/${x}`, { recursive: true })

      for (let y = 0; y < rows; y++) {
        const left = x * TILE_SIZE
        const top = y * TILE_SIZE
        const width = Math.min(TILE_SIZE, levelWidth - left)
        const height = Math.min(TILE_SIZE, levelHeight - top)

        if (width <= 0 || height <= 0) continue

        await sharp(resized)
          .extract({ left, top, width, height })
          .extend({
            top: 0,
            left: 0,
            right: TILE_SIZE - width,
            bottom: TILE_SIZE - height,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .webp({ quality: 82 })
          .toFile(`${paths.tileDir}/${z}/${x}/${y}.webp`)
      }
    }
  }

  return {
    tileEnabled: true,
    tileStatus: 'ready',
    tilePath: paths.tileUrl,
    tileSourcePath: sourceFile,
    tileMinZoom: minZoom,
    tileMaxZoom: maxZoom,
    tileFormat: 'webp',
    tileOriginalWidth: originalWidth,
    tileOriginalHeight: originalHeight
  }
}
