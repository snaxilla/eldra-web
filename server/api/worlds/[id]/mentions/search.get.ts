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

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: worldId } },
      sort: 'title',
      limit: -1,
      fields: 'id,title,slug,entity_type,summary'
    }
  })

  const timelinesRes = await directusServiceRequest('/items/world_timelines', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: worldId } },
      sort: 'sort_order,title',
      limit: -1,
      fields: 'id,title,slug,description,visibility,sort_order'
    }
  }).catch(() => ({ data: [] }))

  const timelines = Array.isArray(timelinesRes?.data) ? timelinesRes.data : []
  const timelineTitleById = new Map<string, string>()
  const timelineSlugById = new Map<string, string>()

  for (const timeline of timelines) {
    timelineTitleById.set(String(timeline.id), cleanText(timeline.title || 'Timeline'))
    timelineSlugById.set(String(timeline.id), cleanText(timeline.slug || timeline.id))
  }

  const eventsRes = await directusServiceRequest('/items/world_timeline_events', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: worldId } },
      sort: 'sort_order,date_label,title',
      limit: -1,
      fields: 'id,timeline_id,title,slug,event_kind,date_label,end_date_label,summary_markdown,visibility,sort_order'
    }
  }).catch(() => ({ data: [] }))

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

  const timelineSuggestions = timelines
    .map((timeline: any) => ({
      id: `timeline:${timeline.id}`,
      targetId: String(timeline.id || ''),
      title: cleanText(timeline.title || ''),
      slug: cleanText(timeline.slug || ''),
      entity_type: 'timeline',
      entityType: 'Timeline',
      summary: shortText(timeline.description || ''),
      mentionType: 'timeline'
    }))
    .filter((timeline: any) => timeline.targetId && timeline.title)

  const eventSuggestions = events
    .map((item: any) => {
      const timelineTitle = timelineTitleById.get(String(item.timeline_id)) || 'Timeline'
      const kind = titleCase(item.event_kind || 'event')
      const date = cleanText(
        item.date_label && item.end_date_label
          ? `${item.date_label} - ${item.end_date_label}`
          : item.date_label || item.end_date_label || ''
      )

      return {
        id: `timeline_event:${item.id}`,
        targetId: String(item.id || ''),
        timelineId: String(item.timeline_id || ''),
        title: cleanText(item.title || ''),
        slug: cleanText(item.slug || ''),
        entity_type: 'timeline_event',
        entityType: kind || 'Timeline Event',
        summary: shortText([timelineTitle, date, item.summary_markdown].filter(Boolean).join(' / ')),
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
