import { requireCapability } from '../../../../utils/authorization'
import { needsBackgroundFileLookup, resolveWriteBackgroundSource, validateBackgroundFile } from '../../../../utils/world-page-presentation'

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

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.settings.edit', { kind: 'world', worldId })

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

  // PAGE BACKGROUND PICKER UX CORRECTION -- a background can now come
  // from picking an EXISTING Media Gallery file, not only a brand-new
  // upload (which was always created scoped to this World already, by
  // construction). An existing-file id is caller-supplied, so it must be
  // verified to actually belong to THIS World before being persisted --
  // otherwise a client could reference another World's file, which
  // would then render (GET /api/assets/:id has no World-scoping of its
  // own) as if it belonged here. No new capability: still gated on the
  // SAME world.settings.edit check above.
  //
  // World Background Defaults follow-up -- image-type validation. The
  // Gallery listing (media.get.ts) and upload (media/upload.post.ts)
  // both only ever let an `image/*` file reach this far through NORMAL
  // use of the picker, but neither one validates a direct save request:
  // a client can submit any existing file id belonging to this World,
  // including a non-image one (e.g. uploaded before World-scoping
  // existed, or posted directly rather than through the picker).
  // `validateBackgroundFile` checks both ownership and type together,
  // in that order, and is skipped entirely (no lookup at all) whenever
  // no new asset is being submitted -- mode-only saves, "Use World
  // Default", "No Background", and the legacy "Clear" action never
  // reach this block, since `needsBackgroundFileLookup` is false for
  // all of them.
  if (needsBackgroundFileLookup(backgroundFileId)) {
    const fileCheck = await dxFetch(
      `/files/${encodeURIComponent(backgroundFileId as string)}?fields[]=id&fields[]=world_id&fields[]=type`
    )

    const validation = validateBackgroundFile(fileCheck?.data, worldId)
    if (!validation.ok) {
      throw createError({
        statusCode: validation.statusCode,
        statusMessage: validation.statusMessage
      })
    }
  }

  const checkParams = new URLSearchParams()
  checkParams.set('filter[world_key][_eq]', worldId)
  checkParams.set('filter[page_key][_eq]', pageKey)
  checkParams.append('fields[]', 'id')
  checkParams.set('limit', '1')

  const existing = await dxFetch(`/items/world_page_presentations?${checkParams.toString()}`)
  const existingItem = Array.isArray(existing?.data) && existing.data.length ? existing.data[0] : null

  // World Background Defaults pass: `background_source` is only ever
  // ADDED to the write body for the two new explicit actions ("Use World
  // Default" / "No Background" -- see resolveWriteBackgroundSource's own
  // header for why). Every pre-existing save (mode toggle, picking an
  // image, the legacy single "Clear" still used by pages that don't
  // support inheritance) sends the exact same body it always has, so
  // none of them depend on whether
  // scripts/directus/alter-world-page-presentations-background-source.mjs
  // has been run against a given Directus instance yet.
  const writeBackgroundSource = resolveWriteBackgroundSource(body?.backgroundSource, backgroundFileId)

  const writeBody: Record<string, unknown> = {
    presentation_mode: presentationMode,
    background_file_id: backgroundFileId
  }
  if (writeBackgroundSource) writeBody.background_source = writeBackgroundSource

  let saved: any = null

  if (existingItem?.id) {
    const json = await dxFetch(`/items/world_page_presentations/${existingItem.id}`, {
      method: 'PATCH',
      body: JSON.stringify(writeBody)
    })
    saved = json?.data || null
  } else {
    const json = await dxFetch(`/items/world_page_presentations`, {
      method: 'POST',
      body: JSON.stringify({
        world_key: worldId,
        page_key: pageKey,
        ...writeBody
      })
    })
    saved = json?.data || null
  }

  const resolvedBackgroundSource = writeBackgroundSource || (backgroundFileId ? 'override' : 'none')

  return {
    success: true,
    worldKey: worldId,
    pageKey,
    presentationMode: saved?.presentation_mode ? String(saved.presentation_mode) : presentationMode,
    backgroundFileId: saved?.background_file_id ? String(saved.background_file_id) : backgroundFileId,
    backgroundImageUrl: saved?.background_file_id ? `/api/assets/${saved.background_file_id}` : null,
    backgroundSource: resolvedBackgroundSource
  }
})
