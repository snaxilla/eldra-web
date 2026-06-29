import { directusServiceRequest } from '../../../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)
  const eventId = cleanText(getRouterParam(event, 'eventId'))

  if (!worldId || !eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or event id' })
  }

  const res = await directusServiceRequest('/items/events', {
    method: 'GET',
    query: {
      filter: {
        id: { _eq: eventId }
      },
      limit: 1,
      fields: 'id'
    }
  })

  const existing = Array.isArray(res?.data) ? res.data[0] : null

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Timeline event not found' })
  }

  await directusServiceRequest(`/items/events/${existing.id}`, {
    method: 'DELETE'
  })

  return { success: true }
})
