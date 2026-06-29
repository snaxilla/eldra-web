import { directusServiceRequest } from '../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function shortText(value: any, limit = 180) {
  const text = cleanText(value)
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function titleCase(value: any) {
  return cleanText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function worldSlugPrefix(worldId: number) {
  return `w${worldId}-`
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const prefix = worldSlugPrefix(worldId)

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: worldId } },
      sort: 'title',
      limit: -1,
      fields: 'id,title,slug,entity_type,summary'
    }
  })

  const erasRes = await directusServiceRequest('/items/eras', {
    method: 'GET',
    query: {
      filter: {
        slug: { _starts_with: prefix }
      },
      sort: 'sort,name',
      limit: -1,
      fields: 'id,name,slug,description,start_year,end_year,sort,visibility'
    }
  }).catch(() => ({ data: [] }))

  const eras = Array.isArray(erasRes?.data) ? erasRes.data : []
  const eraById = new Map<string, any>()

  for (const era of eras) {
    eraById.set(String(era.id), era)
  }

  const eventsRes = eras.length
    ? await directusServiceRequest('/items/events', {
      method: 'GET',
      query: {
        filter: {
          era: { _in: eras.map((era: any) => era.id) }
        },
        sort: 'start_date,title',
        limit: -1,
        fields: 'id,title,slug,era,start_date,end_date,summary,body,visibility,status'
      }
    }).catch(() => ({ data: [] }))
    : { data: [] }

  const entities = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []
  const events = Array.isArray(eventsRes?.data) ? eventsRes.data : []

  const entitySuggestions = entities
    .map((entity: any) => ({
      id: `entity:${entity.id}`,
      targetId: String(entity.id || ''),
      title: cleanText(entity.title || ''),
      slug: cleanText(entity.slug || ''),
      entity_type: cleanText(entity.entity_type || 'entity'),
      entityType: titleCase(entity.entity_type || 'entity'),
      summary: shortText(entity.summary || ''),
      mentionType: 'entity'
    }))
    .filter((entity: any) => entity.targetId && entity.title)

  const timelineSuggestions = eras
    .map((era: any) => ({
      id: `timeline:${era.id}`,
      targetId: String(era.id || ''),
      title: cleanText(era.name || ''),
      slug: cleanText(era.slug || ''),
      entity_type: 'timeline',
      entityType: 'Timeline',
      summary: shortText(era.description || ''),
      mentionType: 'timeline'
    }))
    .filter((timeline: any) => timeline.targetId && timeline.title)

  const eventSuggestions = events
    .map((item: any) => {
      const era = eraById.get(String(item.era)) || null
      const timelineTitle = cleanText(era?.name || 'Timeline')
      const date = cleanText(
        item.start_date && item.end_date
          ? `${item.start_date} - ${item.end_date}`
          : item.start_date || item.end_date || ''
      )

      return {
        id: `timeline_event:${item.id}`,
        targetId: String(item.id || ''),
        timelineId: String(item.era || ''),
        title: cleanText(item.title || ''),
        slug: cleanText(item.slug || ''),
        entity_type: 'timeline_event',
        entityType: 'Timeline Event',
        summary: shortText([timelineTitle, date, item.summary || item.body].filter(Boolean).join(' / ')),
        mentionType: 'timeline_event'
      }
    })
    .filter((item: any) => item.targetId && item.title)

  return {
    mentions: [
      ...entitySuggestions,
      ...timelineSuggestions,
      ...eventSuggestions
    ].sort((a: any, b: any) => a.title.localeCompare(b.title))
  }
})
