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
      statusMessage: json?.errors?.[0]?.message || json?.message || text || `Directus error (${res.status})`
    })
  }

  return json
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const pageKey = String(getRouterParam(event, 'pageKey') || '')

  if (!worldId || !pageKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or page key'
    })
  }

  const params = new URLSearchParams()
  params.set('filter[world_key][_eq]', worldId)
  params.set('filter[page_key][_eq]', pageKey)
  params.append('fields[]', 'id')
  params.append('fields[]', 'world_key')
  params.append('fields[]', 'page_key')
  params.append('fields[]', 'presentation_mode')
  params.append('fields[]', 'background_file_id')
  params.set('limit', '1')

  const json = await dxFetch(`/items/world_page_presentations?${params.toString()}`)
  const item = Array.isArray(json?.data) && json.data.length ? json.data[0] : null

  return {
    worldKey: worldId,
    pageKey,
    presentationMode: item?.presentation_mode ? String(item.presentation_mode) : 'neutral',
    backgroundFileId: item?.background_file_id ? String(item.background_file_id) : null,
    backgroundImageUrl: item?.background_file_id ? `/api/assets/${item.background_file_id}` : null,
  }
})
