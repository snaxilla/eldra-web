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

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const params = new URLSearchParams()

  // Use the exposed relation field, not raw world_id
  params.set('filter[world][_eq]', worldId)

  params.append('fields[]', 'id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'slug')
  params.append('fields[]', 'type')
  params.append('fields[]', 'parent_map_id')
  params.append('fields[]', 'is_default_world_map')
  params.append('fields[]', 'image')
  params.append('fields[]', 'image_file')
  params.set('sort', 'title')

  const json = await dxFetch(`/items/maps?${params.toString()}`)
  const rows = Array.isArray(json?.data) ? json.data : []

  return rows.map((row: any) => {
    const imageFileId = row?.image || row?.image_file || null

    return {
      id: String(row?.id || ''),
      title: String(row?.title || 'Untitled Map'),
      slug: row?.slug ? String(row.slug) : '',
      type: row?.type ? String(row.type) : 'area',
      parentMapId: row?.parent_map_id ? String(row.parent_map_id) : null,
      isDefaultWorldMap: row?.is_default_world_map === true || row?.is_default_world_map === 1,
      directusFileId: imageFileId ? String(imageFileId) : null,
      imageUrl: imageFileId ? `/api/assets/${imageFileId}` : null
    }
  })
})
