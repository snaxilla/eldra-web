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
  const body = await readBody(event)

  if (!worldId || !entityId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or entity id' })
  }

  const entityRes = await dxFetch(`/items/entities/${entityId}?fields=id,world_id`)
  const entity = entityRes?.data

  if (!entity || Number(entity.world_id) !== worldId) {
    throw createError({ statusCode: 404, statusMessage: 'Entity not found in this world' })
  }

  const patch: any = {}

  if (body?.title !== undefined) patch.title = String(body.title || '').trim()
  if (body?.slug !== undefined) patch.slug = String(body.slug || '').trim()
  if (body?.summary !== undefined) patch.summary = String(body.summary || '').trim()

  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, statusMessage: 'No supported fields provided' })
  }

  const saved = await dxFetch(`/items/entities/${entityId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  })

  return { success: true, entity: saved?.data || null }
})
