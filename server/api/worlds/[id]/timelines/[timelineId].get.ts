import { directusServiceRequest } from '../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeTimeline(row: any) {
  return {
    id: String(row?.id || ''),
    worldId: row?.world_id ?? null,
    title: cleanText(row?.title || 'Untitled Timeline'),
    slug: cleanText(row?.slug || ''),
    description: String(row?.description || '').trim(),
    visibility: cleanText(row?.visibility || 'public'),
    sortOrder: Number(row?.sort_order || 0),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  }
}

function normalizeEvent(row: any, timeline: any) {
  const slug = cleanText(row?.slug || '')
  return {
    id: String(row?.id || ''),
    worldId: row?.world_id ?? null,
    timelineId: String(row?.timeline_id || ''),
    title: cleanText(row?.title || 'Untitled Event'),
    slug,
    eventKind: cleanText(row?.event_kind || 'event'),
    dateLabel: cleanText(row?.date_label || ''),
    endDateLabel: cleanText(row?.end_date_label || ''),
    sortOrder: Number(row?.sort_order || 0),
    summaryMarkdown: String(row?.summary_markdown || '').trim(),
    visibility: cleanText(row?.visibility || 'public'),
    url: `/worlds/${timeline.worldId}/timelines/${timeline.slug || timeline.id}#${slug || row?.id}`,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  }
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const timelineKey = cleanText(getRouterParam(event, 'timelineId'))

  if (!worldId || !timelineKey) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or timeline id' })
  }

  const timelineRes = await directusServiceRequest('/items/world_timelines', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: worldId },
        _or: [
          { id: { _eq: timelineKey } },
          { slug: { _eq: timelineKey } }
        ]
      },
      limit: 1,
      fields: '*'
    }
  })

  const timelineRow = Array.isArray(timelineRes?.data) ? timelineRes.data[0] : null

  if (!timelineRow) {
    throw createError({ statusCode: 404, statusMessage: 'Timeline not found' })
  }

  const timeline = normalizeTimeline(timelineRow)

  const eventsRes = await directusServiceRequest('/items/world_timeline_events', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: worldId },
        timeline_id: { _eq: timeline.id }
      },
      sort: 'sort_order,date_label,title',
      limit: -1,
      fields: '*'
    }
  })

  const events = Array.isArray(eventsRes?.data)
    ? eventsRes.data.map((row: any) => normalizeEvent(row, timeline))
    : []

  return {
    worldId,
    timeline,
    events
  }
})
