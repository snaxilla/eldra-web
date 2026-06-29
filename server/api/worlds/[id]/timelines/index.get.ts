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
    endYear: row?.end_year ?? null,
    createdAt: row?.date_created || null,
    updatedAt: row?.date_updated || null
  }
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const prefix = worldSlugPrefix(worldId)

  const res = await directusServiceRequest('/items/eras', {
    method: 'GET',
    query: {
      filter: {
        slug: { _starts_with: prefix }
      },
      sort: 'sort,name',
      limit: -1,
      fields: 'id,name,slug,description,start_year,end_year,sort,visibility'
    }
  })

  const timelines = Array.isArray(res?.data)
    ? res.data.map((row: any) => normalizeTimeline(row, worldId))
    : []

  return {
    worldId,
    timelines
  }
})
