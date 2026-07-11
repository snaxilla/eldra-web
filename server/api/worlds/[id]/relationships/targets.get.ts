import { directusServiceRequest } from '../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{@[^}\s]+\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalized(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: any) {
  return String(value || 'Entity')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function splitList(value: any) {
  return String(Array.isArray(value) ? value.join(',') : value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function intOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : null
}

function imageUrlForEntity(entity: any) {
  const image = entity?.image

  if (!image) return ''

  if (typeof image === 'string') {
    if (image.startsWith('/api/assets/')) return image
    if (image.startsWith('http://') || image.startsWith('https://')) return image
    return `/api/assets/${image}`
  }

  if (typeof image === 'number') return `/api/assets/${image}`

  if (typeof image === 'object') {
    if (image.image_url) return String(image.image_url)
    if (image.file_id) return `/api/assets/${image.file_id}`
    if (image.id) return `/api/assets/${image.id}`
  }

  return ''
}

function entityRank(entity: any, query: string) {
  const needle = normalized(query)
  const title = normalized(entity?.title)
  const slug = normalized(String(entity?.slug || '').replace(/-/g, ' '))
  const summary = normalized(entity?.summary)

  if (!needle) return 100
  if (title === needle) return 0
  if (slug === needle) return 1
  if (title.startsWith(needle)) return 2
  if (slug.startsWith(needle)) return 3
  if (title.includes(needle)) return 4
  if (slug.includes(needle)) return 5
  if (summary.includes(needle)) return 6

  return 50
}

function typePriority(entity: any) {
  const type = String(entity?.entity_type || entity?.entityType || '').toLowerCase()

  if (['character', 'pc', 'player_character', 'npc', 'npc_sheet'].includes(type)) return 0
  if (['location', 'faction', 'organization', 'group'].includes(type)) return 1
  if (['enemy', 'creature', 'monster'].includes(type)) return 2
  if (['item', 'spell', 'species', 'race', 'class', 'background', 'feat'].includes(type)) return 3

  return 4
}

function normalizeTarget(entity: any, worldId: string) {
  const id = String(entity?.id || '').trim()
  const type = String(entity?.entity_type || 'entity').trim().toLowerCase()

  return {
    id,
    targetId: id,
    entityId: id,
    entity_id: id,
    title: String(entity?.title || 'Untitled'),
    name: String(entity?.title || 'Untitled'),
    slug: String(entity?.slug || ''),
    entityType: titleCase(type),
    entity_type: type,
    summary: cleanText(entity?.summary || ''),
    imageUrl: imageUrlForEntity(entity),
    image_url: imageUrlForEntity(entity),
    url: `/worlds/${worldId}/entities/${id}`,
    mentionType: 'entity',
    resolved: true
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const q = String(query.q || query.search || '').trim()
  const limit = Math.max(1, Math.min(40, Number(query.limit || 16)))
  const excludeEntityId = intOrNull(query.excludeEntityId || query.exclude_entity_id)
  const types = splitList(query.types || query.type || query.entityTypes || query.entity_types)

  if (q.length < 2) {
    return {
      worldId,
      q,
      count: 0,
      returned: 0,
      targets: []
    }
  }

  const andFilter: any[] = [
    { world_id: { _eq: worldId } },
    {
      _or: [
        { title: { _icontains: q } },
        { slug: { _icontains: q } },
        { summary: { _icontains: q } }
      ]
    }
  ]

  if (excludeEntityId) {
    andFilter.push({ id: { _neq: excludeEntityId } })
  }

  if (types.length) {
    andFilter.push({ entity_type: { _in: types } })
  }

  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: { _and: andFilter },
      sort: 'title',
      limit: Math.max(limit * 4, 80),
      fields: 'id,title,slug,entity_type,summary,image,world_id,status,visibility'
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []

  const targets = rows
    .map((entity: any) => ({
      entity,
      rank: entityRank(entity, q),
      typeRank: typePriority(entity)
    }))
    .sort((a: any, b: any) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      if (a.typeRank !== b.typeRank) return a.typeRank - b.typeRank
      return String(a.entity?.title || '').localeCompare(String(b.entity?.title || ''))
    })
    .slice(0, limit)
    .map((row: any) => normalizeTarget(row.entity, worldId))

  return {
    worldId,
    q,
    count: rows.length,
    returned: targets.length,
    targets
  }
})
