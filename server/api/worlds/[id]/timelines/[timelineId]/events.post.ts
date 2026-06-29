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
    .slice(0, 90)
}

function worldSlugPrefix(worldId: number) {
  return `w${worldId}-`
}

function normalizeDate(value: any) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

async function findTimeline(worldId: number, timelineKey: string) {
  const prefix = worldSlugPrefix(worldId)

  const res = await directusServiceRequest('/items/eras', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { slug: { _starts_with: prefix } },
          {
            _or: [
              { id: { _eq: timelineKey } },
              { slug: { _eq: timelineKey } }
            ]
          }
        ]
      },
      limit: 1,
      fields: 'id,slug'
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

  const prefix = worldSlugPrefix(worldId)
  const slug = `${prefix}${slugify(body?.slug || title) || 'event'}`

  const summaryMarkdown = String(body?.summaryMarkdown || body?.summary_markdown || '').trim()

  const payload = {
    title,
    slug,
    era: timeline.id,
    start_date: normalizeDate(body?.dateLabel || body?.date_label),
    end_date: normalizeDate(body?.endDateLabel || body?.end_date_label),
    summary: cleanText(summaryMarkdown).slice(0, 500),
    body: summaryMarkdown,
    visibility: cleanText(body?.visibility || 'public') || 'public',
    status: 'published'
  }

  const res = await directusServiceRequest('/items/events', {
    method: 'POST',
    body: payload
  })

  return {
    event: res?.data
  }
})
