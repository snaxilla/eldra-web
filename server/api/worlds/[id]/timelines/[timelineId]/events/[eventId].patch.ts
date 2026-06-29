import { directusServiceRequest } from '../../../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeDate(value: any) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

async function findEvent(worldId: number, eventId: string) {
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

  const payload = {
    title,
    slug: existing.slug,
    start_date: normalizeDate(body?.dateLabel || body?.date_label),
    end_date: normalizeDate(body?.endDateLabel || body?.end_date_label),
    summary: cleanText(summaryMarkdown).slice(0, 500),
    body: summaryMarkdown,
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
