import { requireCapability } from '../../../utils/authorization'

function directusBaseUrl() {
  return (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
}

function directusToken() {
  return process.env.DIRECTUS_TOKEN || ''
}

async function dxFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${directusBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${directusToken()}`,
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

function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function buildSystemKey(worldId: number, title: string) {
  const slug = slugify(title) || `location-${Date.now()}`
  return `world-${worldId}-${slug}`
}

function normalizedNullableString(value: any) {
  const text = String(value || '').trim()
  return text || null
}

function normalizedPopulation(value: any) {
  const raw = String(value ?? '').replace(/,/g, '').trim()
  if (!raw) return null

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Population must be a number.'
    })
  }

  return Math.max(0, Math.floor(parsed))
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const body = await readBody(event)

  const title = String(body?.title || '').trim()
  const summary = String(body?.summary || '').trim()
  const locationType = String(body?.locationType || body?.location_type || 'location').trim() || 'location'
  const population = normalizedPopulation(body?.population)
  const linkedMapId = normalizedNullableString(body?.linkedMapId ?? body?.linked_map_id)
  const parentLocationId = normalizedNullableString(body?.parentLocationId ?? body?.parent_location_id)

  if (!worldId || !title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: world id and title'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.entity.create', { kind: 'world', worldId: String(worldId) })

  const slugBase = slugify(body?.slug || title) || `location-${Date.now()}`
  const systemKey = buildSystemKey(worldId, title)

  const createdEntity = await dxFetch('/items/entities', {
    method: 'POST',
    body: JSON.stringify({
      world_id: worldId,
      title,
      slug: slugBase,
      system_key: systemKey,
      entity_type: 'location',
      status: 'draft',
      summary: summary || null
    })
  })

  const entity = createdEntity?.data
  if (!entity?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Location entity was not created correctly'
    })
  }

  await dxFetch('/items/block_instances', {
    method: 'POST',
    body: JSON.stringify({
      entity_id: entity.id,
      block_key: 'location_core',
      label: 'Location Core',
      sort: 10,
      data: {
        locationType,
        population,
        linkedMapId,
        parentLocationId
      }
    })
  }).catch(() => null)

  if (summary) {
    await dxFetch('/items/block_instances', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: entity.id,
        block_key: 'overview',
        label: 'Overview',
        sort: 20,
        data: {
          text: summary,
          summary
        }
      })
    }).catch(() => null)
  }

  return {
    id: Number(entity.id),
    title: String(entity.title || title),
    slug: entity.slug ? String(entity.slug) : slugBase,
    system_key: entity.system_key ? String(entity.system_key) : systemKey,
    entity_type: 'location'
  }
})
