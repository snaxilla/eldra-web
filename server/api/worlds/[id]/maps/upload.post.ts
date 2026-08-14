import { createMap, updateMap, uploadFile } from '../../../../utils/directus-maps'
import { generateMapTiles } from '../../../../utils/map-tiles'
import { requireCapability } from '../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.map.edit', { kind: 'world', worldId })

  const parts = await readMultipartFormData(event)

  const title = parts?.find(p => p.name === 'title')?.data?.toString() || ''
  const type = parts?.find(p => p.name === 'type')?.data?.toString() || 'area'
  const file = parts?.find(p => p.name === 'file')
  const generateTilesRaw = parts?.find(p => p.name === 'generateTiles')?.data?.toString() || ''
  const tileMaxZoomRaw = Number(parts?.find(p => p.name === 'tileMaxZoom')?.data?.toString() || 7)

  const generateTiles = ['1', 'true', 'yes', 'on'].includes(generateTilesRaw.toLowerCase())
  const tileMaxZoom = Number.isFinite(tileMaxZoomRaw) ? Math.max(0, Math.min(10, tileMaxZoomRaw)) : 7

  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  }

  const uploaded = await uploadFile(file.data, file.filename!, file.type || 'image/png')

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
