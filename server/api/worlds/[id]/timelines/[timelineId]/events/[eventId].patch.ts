import { directusServiceRequest } from '../../../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeDate(value: any) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function normalizeEventKind(value: any) {
  const key = cleanText(value).toLowerCase()
  return ['event', 'era', 'period', 'session', 'note'].includes(key) ? key : 'event'
}

function eventBodyWithMeta(body: any, meta: any) {
  const cleanBody = String(body || '')
    .replace(/<!--eldra:event-meta\s+{[\s\S]*?}\s*-->\s*/g, '')
    .trim()

  const safeMeta = {
    eventKind: normalizeEventKind(meta?.eventKind),
    dateLabel: cleanText(meta?.dateLabel || ''),
    endDateLabel: cleanText(meta?.endDateLabel || ''),
    sortOrder: Number(meta?.sortOrder || 0) || 0,
    parentEventId: cleanText(meta?.parentEventId || '')
  }

  return `<!--eldra:event-meta ${JSON.stringify(safeMeta)}-->\n${cleanBody}`.trim()
}

async function findEvent(_worldId: number, eventId: string) {
  const res = await directusServiceRequest('/items/events', {
    method: 'GET',
    query: {
      filter: {
        id: { _eq: eventId }
      },
      limit: 1,
      fields: 'id,slug'
    }
  })

  return Array.isArray(res?.data) ? res.data[0] : null
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const eventId = cleanText(getRouterParam(event, 'eventId'))
  const body = await readBody(event).catch(() => ({}))

  if (!worldId || !eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or event id' })
  }

  const existing = await findEvent(worldId, eventId)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Timeline event not found' })
  }

  const title = cleanText(body?.title)

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Event title is required' })
  }

  const summaryMarkdown = String(body?.summaryMarkdown || body?.summary_markdown || '').trim()
  const dateLabel = cleanText(body?.dateLabel || body?.date_label || '')
  const endDateLabel = cleanText(body?.endDateLabel || body?.end_date_label || '')
  const eventKind = normalizeEventKind(body?.eventKind || body?.event_kind || 'event')
  const sortOrder = Number(body?.sortOrder ?? body?.sort_order ?? 0) || 0
  const parentEventId = cleanText(body?.parentEventId || body?.parent_event_id || '')

  const payload = {
    title,
    slug: existing.slug,
    start_date: normalizeDate(dateLabel),
    end_date: normalizeDate(endDateLabel),
    summary: cleanText(summaryMarkdown).slice(0, 500),
    body: eventBodyWithMeta(summaryMarkdown, {
      eventKind,
      dateLabel,
      endDateLabel,
      sortOrder,
      parentEventId
    }),
    visibility: cleanText(body?.visibility || 'public') || 'public',
    status: 'published'
  }

  const res = await directusServiceRequest(`/items/events/${existing.id}`, {
    method: 'PATCH',
    body: payload
  })

  return {
    event: res?.data
  }
})
