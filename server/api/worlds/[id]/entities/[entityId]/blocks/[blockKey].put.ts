import { requireCapability } from '../../../../../../utils/authorization'

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
  try { json = text ? JSON.parse(text) : null } catch {}

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || text || `Directus error (${res.status})`
    })
  }

  return json
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const entityId = Number(getRouterParam(event, 'entityId') || 0)
  const blockKey = String(getRouterParam(event, 'blockKey') || '')
  const body = await readBody(event)

  if (!worldId || !entityId || !blockKey) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world, entity, or block key' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId: String(worldId) })

  const entityRes = await dxFetch(`/items/entities/${entityId}?fields=id,world_id`)
  const entity = entityRes?.data

  if (!entity || Number(entity.world_id) !== worldId) {
    throw createError({ statusCode: 404, statusMessage: 'Entity not found in this world' })
  }

  const data = body?.data && typeof body.data === 'object' ? body.data : {}

  const params = new URLSearchParams()
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('filter[block_key][_eq]', blockKey)
  params.append('fields[]', 'id')
  params.set('limit', '1')

  const existingRes = await dxFetch(`/items/block_instances?${params.toString()}`)
  const existing = Array.isArray(existingRes?.data) ? existingRes.data[0] : null

  let saved: any

  if (existing?.id) {
    saved = (await dxFetch(`/items/block_instances/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data })
    }))?.data
  } else {
    saved = (await dxFetch('/items/block_instances', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: entityId,
        block_key: blockKey,
        label: blockKey.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
        sort: 999,
        data
      })
    }))?.data
  }

  return { success: true, block: saved }
})
