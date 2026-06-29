import { directusServiceRequest } from '../../../../../utils/directus'

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

async function findTimeline(worldId: number, timelineKey: string) {
  const res = await directusServiceRequest('/items/world_timelines', {
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

  return Array.isArray(res?.data) ? res.data[0] : null
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const timelineKey = cleanText(getRouterParam(event, 'timelineId'))
  const body = await readBody(event).catch(() => ({}))

  if (!worldId || !timelineKey) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or timeline id' })
  }

  const timeline = await findTimeline(worldId, timelineKey)

  if (!timeline) {
    throw createError({ statusCode: 404, statusMessage: 'Timeline not found' })
  }

  const title = cleanText(body?.title)

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Event title is required' })
  }

  const payload = {
    world_id: worldId,
    timeline_id: timeline.id,
    title,
    slug: slugify(body?.slug || title),
    event_kind: cleanText(body?.eventKind || body?.event_kind || 'event') || 'event',
    date_label: cleanText(body?.dateLabel || body?.date_label || ''),
    end_date_label: cleanText(body?.endDateLabel || body?.end_date_label || ''),
    sort_order: Number(body?.sortOrder ?? body?.sort_order ?? 0) || 0,
    summary_markdown: String(body?.summaryMarkdown || body?.summary_markdown || '').trim(),
    visibility: cleanText(body?.visibility || 'public') || 'public'
  }

  const res = await directusServiceRequest('/items/world_timeline_events', {
    method: 'POST',
    body: payload
  })

  return {
    event: res?.data
  }
})
