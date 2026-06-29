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

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const res = await directusServiceRequest('/items/world_timelines', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: worldId } },
      sort: 'sort_order,title',
      limit: -1,
      fields: '*'
    }
  })

  const timelines = Array.isArray(res?.data) ? res.data.map(normalizeTimeline) : []

  return {
    worldId,
    timelines
  }
})
