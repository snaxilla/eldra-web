function baseUrl() {
  return (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
}

async function dxFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })

  const text = await res.text()
  let json: any = null

  try {
    json = text ? JSON.parse(text) : null
  } catch {}

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage:
        json?.errors?.[0]?.message ||
        json?.message ||
        text ||
        `Directus error (${res.status})`
    })
  }

  return json
}

function fileId(value: any) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value.id) return String(value.id)
  return null
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const params = new URLSearchParams()

  params.set('filter[world][_eq]', worldId)
  params.append('fields[]', 'id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'slug')
  params.append('fields[]', 'type')
  params.append('fields[]', 'parent_map_id')
  params.append('fields[]', 'is_default_world_map')
  params.append('fields[]', 'image_file')
  params.append('fields[]', 'image_file.id')
  params.append('fields[]', 'tile_enabled')
  params.append('fields[]', 'tile_status')
  params.append('fields[]', 'tile_path')
  params.append('fields[]', 'tile_min_zoom')
  params.append('fields[]', 'tile_max_zoom')
  params.append('fields[]', 'tile_format')
  params.append('fields[]', 'tile_original_width')
  params.append('fields[]', 'tile_original_height')
  params.append('fields[]', 'tile_error')
  params.set('sort', 'title')

  const res = await dxFetch(`/items/maps?${params.toString()}`)
  const rows = Array.isArray(res?.data) ? res.data : []

  return rows.map((row: any) => {
    const imageFileId = fileId(row?.image_file)

    return {
      id: String(row?.id || ''),
      title: String(row?.title || 'Untitled Map'),
      slug: String(row?.slug || ''),
      type: String(row?.type || 'area'),
      parentMapId: row?.parent_map_id ? String(row.parent_map_id) : null,
      isDefaultWorldMap: Boolean(row?.is_default_world_map),
      directusFileId: imageFileId,
      imageUrl: imageFileId ? `/api/assets/${imageFileId}` : null,
      tileEnabled: Boolean(row?.tile_enabled),
      tileStatus: row?.tile_status || 'none',
      tilePath: row?.tile_path || null,
      tileMinZoom: row?.tile_min_zoom ?? null,
      tileMaxZoom: row?.tile_max_zoom ?? null,
      tileFormat: row?.tile_format || null,
      tileOriginalWidth: row?.tile_original_width ?? null,
      tileOriginalHeight: row?.tile_original_height ?? null,
      tileError: row?.tile_error || null
    }
  })
})
