import { directusServiceRequest } from '../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

async function findTimeline(worldId: number, timelineKey: string) {
  const res = await directusServiceRequest('/items/world_timelines', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: worldId },
        _or: [
          { id: { _eq: timelineKey } },
          { slug: { _eq: timelineKey } }
        ]
      },
      limit: 1,
      fields: 'id,world_id'
    }
  })

  return Array.isArray(res?.data) ? res.data[0] : null
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const timelineKey = cleanText(getRouterParam(event, 'timelineId'))

  if (!worldId || !timelineKey) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or timeline id' })
  }

  const timeline = await findTimeline(worldId, timelineKey)

  if (!timeline) {
    throw createError({ statusCode: 404, statusMessage: 'Timeline not found' })
  }

  const eventsRes = await directusServiceRequest('/items/world_timeline_events', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: worldId },
        timeline_id: { _eq: timeline.id }
      },
      limit: -1,
      fields: 'id'
    }
  })

  const events = Array.isArray(eventsRes?.data) ? eventsRes.data : []

  for (const item of events) {
    if (item?.id) {
      await directusServiceRequest(`/items/world_timeline_events/${item.id}`, {
        method: 'DELETE'
      })
    }
  }

  await directusServiceRequest(`/items/world_timelines/${timeline.id}`, {
    method: 'DELETE'
  })

  return { success: true }
})
