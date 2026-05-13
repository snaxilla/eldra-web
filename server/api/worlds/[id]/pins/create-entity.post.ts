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

function normalizeEntityType(pinType: string | null | undefined) {
  const v = String(pinType || '').toLowerCase()

  if (v === 'city') return 'location'
  if (v === 'dungeon') return 'location'
  if (v === 'landmark') return 'location'
  if (v === 'region') return 'location'
  if (v === 'location') return 'location'
  if (v === 'quest') return 'quest'

  return 'location'
}

function buildSystemKey(worldId: number, title: string) {
  const slug = slugify(title) || `entity-${Date.now()}`
  return `world-${worldId}-${slug}`
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)

  const title = String(body?.title || '').trim()
  const summary = body?.summary ? String(body.summary).trim() : ''
  const pinType = body?.pinType ? String(body.pinType) : 'location'
  const image = body?.image ? String(body.image) : null

  if (!worldId || !title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: world id and title'
    })
  }

  const entityType = normalizeEntityType(pinType)
  const slugBase = slugify(title) || `entity-${Date.now()}`
  const systemKey = buildSystemKey(worldId, title)

  const createdEntity = await dxFetch('/items/entities', {
    method: 'POST',
    body: JSON.stringify({
      world_id: worldId,
      title,
      slug: slugBase,
      system_key: systemKey,
      entity_type: entityType,
      status: 'draft',
      summary: summary || null
    })
  })

  const entity = createdEntity?.data
  if (!entity?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Entity was not created correctly'
    })
  }

  if (entityType === 'location') {
    await dxFetch('/items/block_instances', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: entity.id,
        block_key: 'location_core',
        label: 'Location Core',
        sort: 10,
        data: {
          locationType: String(pinType || 'location').toLowerCase(),
          population: null,
          linkedMapId: body?.linkedMapId ? String(body.linkedMapId) : null,
          parentLocationId: body?.parentLocationId ? String(body.parentLocationId) : null
        }
      })
    }).catch(() => null)
  }

  if (summary || image) {
    await dxFetch('/items/block_instances', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: entity.id,
        block_key: 'overview',
        label: 'Overview',
        sort: 20,
        data: {
          text: summary || null,
          summary: summary || null,
          image: image || null
        }
      })
    }).catch(() => null)
  }

  return {
    id: Number(entity.id),
    title: String(entity.title || title),
    slug: entity.slug ? String(entity.slug) : slugBase,
    system_key: entity.system_key ? String(entity.system_key) : systemKey,
    entity_type: entity.entity_type ? String(entity.entity_type) : entityType
  }
})
