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
  params.append('fields[]', 'summary')
  params.append('fields[]', 'entity_type')
  params.append('fields[]', 'character_type')
  params.append('fields[]', 'has_sheet')
  params.append('fields[]', 'role')
  params.append('fields[]', 'system_key')

  params.append('fields[]', 'image')
  params.append('fields[]', 'image.id')
  params.append('fields[]', 'image.filename_disk')
  params.append('fields[]', 'image.title')

  params.append('fields[]', 'image_file')
  params.append('fields[]', 'image_file.id')

  params.append('fields[]', 'portrait')
  params.append('fields[]', 'portrait.id')

  const json = await dxFetch(`/items/entities?${params.toString()}`)
  const rows = Array.isArray(json?.data) ? json.data : []

  return rows.map((row: any) => {
    const imageId =
      row?.image?.id ||
      row?.image ||
      row?.image_file?.id ||
      row?.image_file ||
      row?.portrait?.id ||
      row?.portrait ||
      null

    return {
      ...row,
      image: row?.image ?? null,
      image_file: row?.image_file ?? null,
      portrait: row?.portrait ?? null,
      imageUrl: imageId ? `/api/assets/${imageId}` : null
    }
  })
})
