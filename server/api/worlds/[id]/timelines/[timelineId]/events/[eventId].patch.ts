import { directusServiceRequest } from '../../../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function slugify(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function findEvent(worldId: number, timelineKey: string, eventId: string) {
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
      fields: 'id'
    }
  })

  const timeline = Array.isArray(timelineRes?.data) ? timelineRes.data[0] : null
  if (!timeline) return null

  const eventRes = await directusServiceRequest('/items/world_timeline_events', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: worldId },
        timeline_id: { _eq: timeline.id },
        id: { _eq: eventId }
      },
      limit: 1,
      fields: 'id'
    }
  })

  return Array.isArray(eventRes?.data) ? eventRes.data[0] : null
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const timelineKey = cleanText(getRouterParam(event, 'timelineId'))
  const eventId = cleanText(getRouterParam(event, 'eventId'))
  const body = await readBody(event).catch(() => ({}))

  if (!worldId || !timelineKey || !eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world, timeline, or event id' })
  }

  const existing = await findEvent(worldId, timelineKey, eventId)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Timeline event not found' })
  }

  const title = cleanText(body?.title)

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Event title is required' })
  }

  const payload = {
    title,
    slug: slugify(body?.slug || title),
    event_kind: cleanText(body?.eventKind || body?.event_kind || 'event') || 'event',
    date_label: cleanText(body?.dateLabel || body?.date_label || ''),
    end_date_label: cleanText(body?.endDateLabel || body?.end_date_label || ''),
    sort_order: Number(body?.sortOrder ?? body?.sort_order ?? 0) || 0,
    summary_markdown: String(body?.summaryMarkdown || body?.summary_markdown || '').trim(),
    visibility: cleanText(body?.visibility || 'public') || 'public'
  }

  const res = await directusServiceRequest(`/items/world_timeline_events/${existing.id}`, {
    method: 'PATCH',
    body: payload
  })

  return {
    event: res?.data
  }
})
