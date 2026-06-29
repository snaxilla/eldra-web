import { directusServiceRequest } from '../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function worldSlugPrefix(worldId: number) {
  return `w${worldId}-`
}

function normalizeTimeline(row: any, worldId: number) {
  return {
    id: String(row?.id || ''),
    worldId,
    title: cleanText(row?.name || 'Untitled Timeline'),
    slug: cleanText(row?.slug || ''),
    description: String(row?.description || '').trim(),
    visibility: cleanText(row?.visibility || 'public'),
    sortOrder: Number(row?.sort || 0),
    startYear: row?.start_year ?? null,
    endYear: row?.end_year ?? null
  }
}

function normalizeDate(value: any) {
  return cleanText(value)
}

function normalizeEvent(row: any, timeline: any) {
  const slug = cleanText(row?.slug || '')
  const start = normalizeDate(row?.start_date)
  const end = normalizeDate(row?.end_date)

  return {
    id: String(row?.id || ''),
    worldId: timeline.worldId,
    timelineId: String(timeline.id || ''),
    title: cleanText(row?.title || 'Untitled Event'),
    slug,
    eventKind: 'event',
    dateLabel: start,
    endDateLabel: end,
    sortOrder: 0,
    summaryMarkdown: String(row?.body || row?.summary || '').trim(),
    summary: String(row?.summary || '').trim(),
    visibility: cleanText(row?.visibility || 'public'),
    status: cleanText(row?.status || 'draft'),
    url: `/worlds/${timeline.worldId}/timelines/${timeline.slug || timeline.id}#${slug || row?.id}`,
    createdAt: row?.date_created || null,
    updatedAt: row?.date_updated || null
  }
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
      fields: 'id,name,slug,description,start_year,end_year,sort,visibility'
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
      fields: 'id,name,slug,description,start_year,end_year,sort,visibility'
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

  if (!worldId || !timelineKey) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or timeline id' })
  }

  const timelineRow = await findTimeline(worldId, timelineKey)

  if (!timelineRow) {
    throw createError({ statusCode: 404, statusMessage: 'Timeline not found' })
  }

  const timeline = normalizeTimeline(timelineRow, worldId)

  const eventsRes = await directusServiceRequest('/items/events', {
    method: 'GET',
    query: {
      filter: {
        era: { _eq: timeline.id }
      },
      sort: 'start_date,title',
      limit: -1,
      fields: 'id,title,slug,era,start_date,end_date,summary,body,visibility,status'
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
