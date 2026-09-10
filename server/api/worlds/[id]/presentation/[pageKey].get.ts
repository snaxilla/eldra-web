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

async function fetchPresentationRow(worldId: string, pageKey: string) {
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
  return Array.isArray(json?.data) && json.data.length ? json.data[0] : null
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

  let item = await fetchPresentationRow(worldId, pageKey)

  // Game Admin Page Setup correction: `character-sheet` is a newly split
  // page key -- see world-workspace.vue's own `pageKey` computed. Before
  // that split, a World's Character Sheet backdrop was stored under the
  // shared `characters` key. This is a READ-ONLY fallback so an existing
  // World's sheet backdrop doesn't disappear the moment this ships -- it
  // never writes anything back. The first time a Game Admin saves a
  // Character Sheet presentation of its own (even re-saving the same
  // values), the POST route creates a real, independent `character-sheet`
  // row and this fallback stops applying for that World.
  if (!item && pageKey === 'character-sheet') {
    item = await fetchPresentationRow(worldId, 'characters')
  }

  return {
    worldKey: worldId,
    pageKey,
    presentationMode: item?.presentation_mode ? String(item.presentation_mode) : 'neutral',
    backgroundFileId: item?.background_file_id ? String(item.background_file_id) : null,
    backgroundImageUrl: item?.background_file_id ? `/api/assets/${item.background_file_id}` : null,
  }
})
