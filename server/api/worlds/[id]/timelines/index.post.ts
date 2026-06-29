import { directusServiceRequest } from '../../../../utils/directus'

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
  const body = await readBody(event).catch(() => ({}))

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const title = cleanText(body?.title)

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Timeline title is required' })
  }

  const payload = {
    world_id: worldId,
    title,
    slug: slugify(body?.slug || title),
    description: String(body?.description || '').trim(),
    visibility: cleanText(body?.visibility || 'public') || 'public',
    sort_order: Number(body?.sortOrder ?? body?.sort_order ?? 0) || 0
  }

  const res = await directusServiceRequest('/items/world_timelines', {
    method: 'POST',
    body: payload
  })

  return {
    timeline: normalizeTimeline(res?.data)
  }
})
