// createError/defineEventHandler/getRequestHeader/getRouterParam are
// imported explicitly (see server/api/worlds/[id]/members/index.get.ts)
// so this route is directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getRequestHeader, getRouterParam } from 'h3'
import { createMap, updateMap, uploadFile } from '../../../../utils/directus-maps'
import { generateMapTiles } from '../../../../utils/map-tiles'
import { requireCapability } from '../../../../utils/authorization'
import { DEFAULT_MAX_UPLOAD_BYTES, MultipartFileTooLargeError, readStreamingMultipartForm } from '../../../../utils/streaming-multipart'

// Re-exported under this route's own name for callers/tests that import
// it from here (e.g. tests/server/api/worlds/[id]/maps/upload.post.test.ts);
// the value itself is the shared parser's established limit -- see
// streaming-multipart.ts for why and for why
// server/api/worlds/[id]/media/upload.post.ts now uses the same constant.
export const MAX_MAP_UPLOAD_BYTES = DEFAULT_MAX_UPLOAD_BYTES

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.map.edit', { kind: 'world', worldId })

  const declaredLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MAP_UPLOAD_BYTES) {
    console.warn(
      `[maps/upload] rejecting world ${worldId} upload before parsing: declared Content-Length ${declaredLength} exceeds ${MAX_MAP_UPLOAD_BYTES}`
    )
    throw createError({
      statusCode: 413,
      statusMessage: `Map image is too large. The upload limit is ${Math.floor(MAX_MAP_UPLOAD_BYTES / (1024 * 1024))} MB.`
    })
  }

  let form: Awaited<ReturnType<typeof readStreamingMultipartForm>>
  try {
    form = await readStreamingMultipartForm(event.node.req, event.node.req.headers, {
      maxFileBytes: MAX_MAP_UPLOAD_BYTES
    })
  } catch (error: any) {
    if (error instanceof MultipartFileTooLargeError) {
      console.warn(`[maps/upload] world ${worldId} upload exceeded the size limit: ${error.message}`)
      throw createError({
        statusCode: 413,
        statusMessage: `Map image is too large. The upload limit is ${Math.floor(MAX_MAP_UPLOAD_BYTES / (1024 * 1024))} MB.`
      })
    }

    console.error(`[maps/upload] world ${worldId} failed while parsing the upload body:`, error?.message || error)
    throw createError({
      statusCode: 400,
      statusMessage: 'The uploaded file could not be read. Please try again or use a smaller image.'
    })
  }

  const { fields, file } = form

  const title = fields.title || ''
  const type = fields.type || 'area'
  const generateTilesRaw = fields.generateTiles || ''
  const tileMaxZoomRaw = Number(fields.tileMaxZoom || 7)

  const generateTiles = ['1', 'true', 'yes', 'on'].includes(generateTilesRaw.toLowerCase())
  const tileMaxZoom = Number.isFinite(tileMaxZoomRaw) ? Math.max(0, Math.min(10, tileMaxZoomRaw)) : 7

  if (!file?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  }

  console.log(`[maps/upload] world ${worldId} parsed upload: ${file.filename} (${file.data.length} bytes)`)

  const uploaded = await uploadFile(file.data, file.filename, file.mimeType || 'image/png', worldId)

  const created = await createMap(worldId, title, type as any, uploaded.id, generateTiles
    ? {
        tile_enabled: false,
        tile_status: 'processing',
        tile_min_zoom: 0,
        tile_max_zoom: tileMaxZoom,
        tile_format: 'webp'
      }
    : {
        tile_enabled: false,
        tile_status: 'none'
      }
  )

  if (!generateTiles) {
    return created
  }

  try {
    const tileMeta = await generateMapTiles({
      mapId: String(created.id),
      buffer: file.data,
      filename: file.filename || 'map.png',
      minZoom: 0,
      maxZoom: tileMaxZoom
    })

    return await updateMap(String(created.id), {
      tile_enabled: true,
      tile_status: 'ready',
      tile_path: tileMeta.tilePath,
      tile_source_path: tileMeta.tileSourcePath,
      tile_min_zoom: tileMeta.tileMinZoom,
      tile_max_zoom: tileMeta.tileMaxZoom,
      tile_format: tileMeta.tileFormat,
      tile_original_width: tileMeta.tileOriginalWidth,
      tile_original_height: tileMeta.tileOriginalHeight,
      tile_error: null
    })
  } catch (error: any) {
    console.error(`[maps/upload] world ${worldId} map ${created.id} tile generation failed:`, error?.message || error)

    await updateMap(String(created.id), {
      tile_enabled: false,
      tile_status: 'failed',
      tile_error: error?.message || 'Tile generation failed'
    })

    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Tile generation failed'
    })
  }
})
