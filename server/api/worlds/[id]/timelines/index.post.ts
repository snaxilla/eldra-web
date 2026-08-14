import { directusServiceRequest } from '../../../../utils/directus'
import { requireCapability } from '../../../../utils/authorization'

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

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const body = await readBody(event).catch(() => ({}))

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.timeline.edit', { kind: 'world', worldId: String(worldId) })

  const title = cleanText(body?.title)

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Timeline title is required' })
  }

  const prefix = worldSlugPrefix(worldId)
  const rawSlug = slugify(body?.slug || title)
  const slug = `${prefix}${rawSlug || 'timeline'}`

  const payload = {
    name: title,
    slug,
    description: String(body?.description || '').trim(),
    visibility: cleanText(body?.visibility || 'public') || 'public',
    sort: Number(body?.sortOrder ?? body?.sort_order ?? 0) || 0,
    start_year: Number.isFinite(Number(body?.startYear)) ? Number(body.startYear) : null,
    end_year: Number.isFinite(Number(body?.endYear)) ? Number(body.endYear) : null
  }

  const res = await directusServiceRequest('/items/eras', {
    method: 'POST',
    body: payload
  })

  return {
    timeline: normalizeTimeline(res?.data, worldId)
  }
})
