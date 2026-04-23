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
  params.set('filter[world_id][_eq]', worldId)
  params.set('sort', 'title')

  params.append('fields[]', 'id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'slug')
  params.append('fields[]', 'world_id')
  params.append('fields[]', 'system_key')
  params.append('fields[]', 'entity_type')
  params.append('fields[]', 'status')
  params.append('fields[]', 'visibility')
  params.append('fields[]', 'summary')
  params.append('fields[]', 'created_at')
  params.append('fields[]', 'updated_at')
  params.append('fields[]', 'image')

  const json = await dxFetch(`/items/entities?${params.toString()}`)
  const rows = Array.isArray(json?.data) ? json.data : []

  return rows.map((row: any) => ({
    ...row,
    imageUrl: row?.image ? `/api/assets/${row.image}` : null
  }))
})
