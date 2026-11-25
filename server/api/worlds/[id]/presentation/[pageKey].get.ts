import { pagePresentationNeedsWorldDefault, resolvePagePresentation, WORLD_DEFAULT_PAGE_KEY } from '../../../../utils/world-page-presentation'

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
  // Wildcard, not an itemized `fields[]` list: `background_source` is an
  // ADDITIVE column (see scripts/directus/alter-world-page-presentations-
  // background-source.mjs) that may not exist yet on a given Directus
  // instance's schema. Directus rejects a `fields[]` request naming an
  // unknown field outright, which would otherwise turn "the migration
  // hasn't run here yet" into every page load 500ing instead of this
  // route's own documented graceful fallback (missing field reads as
  // undefined, resolved the same as a pre-migration row -- see
  // resolveBackgroundSource). Matches world-presentation-settings.ts's
  // own `fields: '*'` convention for the identical reason.
  params.set('fields', '*')
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

  // World Background Defaults pass: the World's own default (page_key
  // 'world-default', the SAME collection/route -- see
  // resolvePagePresentation's own header) is fetched alongside the
  // page's own row so an explicit-override/no-row/explicit-none page can
  // inherit it. Skipped for the World-default row itself and for
  // specialized keys that never read it (pagePresentationNeedsWorldDefault).
  const worldDefaultItem = pagePresentationNeedsWorldDefault(pageKey)
    ? await fetchPresentationRow(worldId, WORLD_DEFAULT_PAGE_KEY)
    : null

  const resolved = resolvePagePresentation(pageKey, item, worldDefaultItem)

  return {
    worldKey: worldId,
    pageKey,
    presentationMode: resolved.presentationMode,
    backgroundFileId: resolved.backgroundFileId,
    backgroundImageUrl: resolved.backgroundFileId ? `/api/assets/${resolved.backgroundFileId}` : null,
    backgroundSource: resolved.backgroundSource,
    worldDefaultBackgroundFileId: resolved.worldDefaultBackgroundFileId,
    worldDefaultBackgroundImageUrl: resolved.worldDefaultBackgroundFileId
      ? `/api/assets/${resolved.worldDefaultBackgroundFileId}`
      : null,
    worldDefaultPresentationMode: resolved.worldDefaultPresentationMode
  }
})
