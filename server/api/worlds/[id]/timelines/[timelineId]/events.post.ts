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

  const byIdRes = await directusServiceRequest('/items/eras', {
    method: 'GET',
    query: {
      filter: {
        id: { _eq: timelineKey }
      },
      limit: 1,
      fields: 'id,slug'
    }
  }).catch(() => ({ data: [] }))

  const byId = Array.isArray(byIdRes?.data) ? byIdRes.data[0] : null

  if (byId && String(byId.slug || '').startsWith(prefix)) {
    return byId
  }

  const bySlugRes = await directusServiceRequest('/items/eras', {
    method: 'GET',
    query: {
      filter: {
        slug: { _eq: timelineKey }
      },
      limit: 1,
      fields: 'id,slug'
    }
  }).catch(() => ({ data: [] }))

  const bySlug = Array.isArray(bySlugRes?.data) ? bySlugRes.data[0] : null

  if (bySlug && String(bySlug.slug || '').startsWith(prefix)) {
    return bySlug
  }

  return null
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
