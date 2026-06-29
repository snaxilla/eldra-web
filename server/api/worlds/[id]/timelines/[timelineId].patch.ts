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
    .slice(0, 90)
}

function worldSlugPrefix(worldId: number) {
  return `w${worldId}-`
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
    throw createError({ statusCode: 400, statusMessage: 'Timeline title is required' })
  }

  const prefix = worldSlugPrefix(worldId)
  const nextSlug = body?.slug ? `${prefix}${slugify(body.slug).replace(new RegExp(`^${prefix}`), '')}` : timeline.slug

  const payload = {
    name: title,
    slug: nextSlug,
    description: String(body?.description || '').trim(),
    visibility: cleanText(body?.visibility || 'public') || 'public',
    sort: Number(body?.sortOrder ?? body?.sort_order ?? 0) || 0,
    start_year: Number.isFinite(Number(body?.startYear)) ? Number(body.startYear) : null,
    end_year: Number.isFinite(Number(body?.endYear)) ? Number(body.endYear) : null
  }

  const res = await directusServiceRequest(`/items/eras/${timeline.id}`, {
    method: 'PATCH',
    body: payload
  })

  return {
    timeline: {
      id: String(res?.data?.id || ''),
      worldId,
      title: cleanText(res?.data?.name || title),
      slug: cleanText(res?.data?.slug || nextSlug),
      description: String(res?.data?.description || '').trim(),
      visibility: cleanText(res?.data?.visibility || 'public'),
      sortOrder: Number(res?.data?.sort || 0),
      startYear: res?.data?.start_year ?? null,
      endYear: res?.data?.end_year ?? null
    }
  }
})
