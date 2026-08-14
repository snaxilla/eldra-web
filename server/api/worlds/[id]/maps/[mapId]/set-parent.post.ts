import { requireCapability } from '../../../../../utils/authorization'

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

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const mapId = String(getRouterParam(event, 'mapId') || '')
  const body = await readBody(event)

  if (!mapId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing map id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.map.edit', { kind: 'world', worldId })

  const parentMapId =
    body?.parentMapId === undefined ||
    body?.parentMapId === null ||
    body?.parentMapId === '' ||
    body?.parentMapId === 'null'
      ? null
      : String(body.parentMapId)

  if (parentMapId && parentMapId === mapId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A map cannot be its own parent.'
    })
  }

  await dxFetch(`/items/maps/${mapId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      parent_map_id: parentMapId
    })
  })

  const verify = await dxFetch(`/items/maps/${mapId}?fields=id,title,parent_map_id,slug`)
  const map = verify?.data || null

  return {
    success: true,
    mapId: map?.id ? String(map.id) : mapId,
    title: map?.title ? String(map.title) : null,
    slug: map?.slug ? String(map.slug) : null,
    parentMapId: map?.parent_map_id ? String(map.parent_map_id) : null,
    raw: map
  }
})
