import { directusServiceRequest } from '../../../../utils/directus'
import { requireCapability } from '../../../../utils/authorization'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
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

  if (!worldId || !timelineKey) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or timeline id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.timeline.edit', { kind: 'world', worldId: String(worldId) })

  const timeline = await findTimeline(worldId, timelineKey)

  if (!timeline) {
    throw createError({ statusCode: 404, statusMessage: 'Timeline not found' })
  }

  const eventsRes = await directusServiceRequest('/items/events', {
    method: 'GET',
    query: {
      filter: {
        era: { _eq: timeline.id }
      },
      limit: -1,
      fields: 'id'
    }
  })

  const events = Array.isArray(eventsRes?.data) ? eventsRes.data : []

  for (const item of events) {
    if (item?.id) {
      await directusServiceRequest(`/items/events/${item.id}`, {
        method: 'DELETE'
      })
    }
  }

  await directusServiceRequest(`/items/eras/${timeline.id}`, {
    method: 'DELETE'
  })

  return { success: true }
})
