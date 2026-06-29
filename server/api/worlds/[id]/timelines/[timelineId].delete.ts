import { directusServiceRequest } from '../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function worldSlugPrefix(worldId: number) {
  return `w${worldId}-`
}

async function findTimeline(worldId: number, timelineKey: string) {
  const prefix = worldSlugPrefix(worldId)

  const res = await directusServiceRequest('/items/eras', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { slug: { _starts_with: prefix } },
          {
            _or: [
              { id: { _eq: timelineKey } },
              { slug: { _eq: timelineKey } }
            ]
          }
        ]
      },
      limit: 1,
      fields: 'id'
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
