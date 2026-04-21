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
  } catch {
    json = null
  }

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || text || `Directus error (${res.status})`
    })
  }

  return json
}

function normalizeMap(item: any) {
  const imageFileId = item?.image || item?.image_file || null

  return {
    id: String(item?.id || ''),
    title: String(item?.title || 'Untitled Map'),
    slug: item?.slug ? String(item.slug) : '',
    type: item?.type ? String(item.type) : 'area',
    worldId: item?.world_id ? Number(item.world_id) : null,
    parentMapId: item?.parent_map_id ? String(item.parent_map_id) : null,
    isDefaultWorldMap: item?.is_default_world_map === true || item?.is_default_world_map === 1,
    directusFileId: imageFileId ? String(imageFileId) : null,
    imageUrl: imageFileId ? `/api/assets/${imageFileId}` : null,
  }
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
  params.set('filter[world_id][_eq]', worldId)
  params.append('fields[]', 'id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'slug')
  params.append('fields[]', 'type')
  params.append('fields[]', 'world_id')
  params.append('fields[]', 'parent_map_id')
  params.append('fields[]', 'is_default_world_map')
  params.append('fields[]', 'image')
  params.append('fields[]', 'image_file')
  params.set('sort', 'title')

  const json = await dxFetch(`/items/maps?${params.toString()}`)
  return (json?.data || []).map(normalizeMap)
})
