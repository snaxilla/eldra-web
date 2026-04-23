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
  const body = await readBody(event)

  if (!worldId || !pageKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or page key'
    })
  }

  const presentationMode = ['immersive', 'muted', 'neutral'].includes(String(body?.presentationMode || ''))
    ? String(body.presentationMode)
    : 'neutral'

  const backgroundFileId =
    body?.backgroundFileId === undefined ||
    body?.backgroundFileId === null ||
    body?.backgroundFileId === '' ||
    body?.backgroundFileId === 'null'
      ? null
      : String(body.backgroundFileId)

  const checkParams = new URLSearchParams()
  checkParams.set('filter[world_key][_eq]', worldId)
  checkParams.set('filter[page_key][_eq]', pageKey)
  checkParams.append('fields[]', 'id')
  checkParams.set('limit', '1')

  const existing = await dxFetch(`/items/world_page_presentations?${checkParams.toString()}`)
  const existingItem = Array.isArray(existing?.data) && existing.data.length ? existing.data[0] : null

  let saved: any = null

  if (existingItem?.id) {
    const json = await dxFetch(`/items/world_page_presentations/${existingItem.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        presentation_mode: presentationMode,
        background_file_id: backgroundFileId
      })
    })
    saved = json?.data || null
  } else {
    const json = await dxFetch(`/items/world_page_presentations`, {
      method: 'POST',
      body: JSON.stringify({
        world_key: worldId,
        page_key: pageKey,
        presentation_mode: presentationMode,
        background_file_id: backgroundFileId
      })
    })
    saved = json?.data || null
  }

  return {
    success: true,
    worldKey: worldId,
    pageKey,
    presentationMode: saved?.presentation_mode ? String(saved.presentation_mode) : presentationMode,
    backgroundFileId: saved?.background_file_id ? String(saved.background_file_id) : backgroundFileId,
    backgroundImageUrl: saved?.background_file_id ? `/api/assets/${saved.background_file_id}` : null,
  }
})
