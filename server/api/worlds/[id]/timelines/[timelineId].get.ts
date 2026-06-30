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

function parseEventMeta(body: any) {
  const raw = String(body || '')
  const match = raw.match(/<!--eldra:event-meta\s+({[\s\S]*?})\s*-->/)

  if (!match?.[1]) {
    return {
      eventKind: 'event',
      dateLabel: '',
      endDateLabel: '',
      sortOrder: 0
    }
  }

  try {
    const parsed = JSON.parse(match[1])
    return {
      eventKind: cleanText(parsed?.eventKind || 'event') || 'event',
      dateLabel: cleanText(parsed?.dateLabel || ''),
      endDateLabel: cleanText(parsed?.endDateLabel || ''),
      sortOrder: Number(parsed?.sortOrder || 0) || 0,
      parentEventId: cleanText(parsed?.parentEventId || ''),
      imageFileId: cleanText(parsed?.imageFileId || ''),
      imageUrl: cleanText(parsed?.imageUrl || '')
    }
  } catch {
    return {
      eventKind: 'event',
      dateLabel: '',
      endDateLabel: '',
      sortOrder: 0
    }
  }
}

function stripEventMeta(body: any) {
  return String(body || '').replace(/<!--eldra:event-meta\s+{[\s\S]*?}\s*-->\s*/g, '').trim()
}

function normalizeEvent(row: any, timeline: any) {
  const slug = cleanText(row?.slug || '')
  const meta = parseEventMeta(row?.body)
  const body = stripEventMeta(row?.body)
  const fallbackStart = cleanText(row?.start_date || '')
  const fallbackEnd = cleanText(row?.end_date || '')

  return {
    id: String(row?.id || ''),
    worldId: timeline.worldId,
    timelineId: String(timeline.id || ''),
    title: cleanText(row?.title || 'Untitled Event'),
    slug,
    eventKind: meta.eventKind || 'event',
    dateLabel: meta.dateLabel || fallbackStart,
    endDateLabel: meta.endDateLabel || fallbackEnd,
    sortOrder: meta.sortOrder || 0,
    parentEventId: meta.parentEventId || '',
    imageFileId: meta.imageFileId || '',
    imageUrl: meta.imageUrl || (meta.imageFileId ? `/api/assets/${meta.imageFileId}` : ''),
    summaryMarkdown: body || String(row?.summary || '').trim(),
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
    ? eventsRes.data
      .map((row: any) => normalizeEvent(row, timeline))
      .sort((a: any, b: any) => {
        const sortDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
        if (sortDiff) return sortDiff

        const dateDiff = String(a.dateLabel || '').localeCompare(String(b.dateLabel || ''))
        if (dateDiff) return dateDiff

        return String(a.title || '').localeCompare(String(b.title || ''))
      })
    : []

  return {
    worldId,
    timeline,
    events
  }
})
