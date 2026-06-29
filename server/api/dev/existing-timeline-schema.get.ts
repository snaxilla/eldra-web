import { directusServiceRequest } from '../../utils/directus'

async function dx(path: string, options: any = {}) {
  try {
    const data = await directusServiceRequest(path, options)
    return { ok: true, data }
  } catch (error: any) {
    return {
      ok: false,
      statusCode: error?.statusCode || error?.response?.status || null,
      statusMessage: error?.statusMessage || error?.message || 'Directus request failed',
      data: error?.data || null
    }
  }
}

export default defineEventHandler(async () => {
  return {
    me: await dx('/users/me', {
      method: 'GET',
      query: {
        fields: 'id,email,role.id,role.name,role.admin_access,role.app_access'
      }
    }),

    erasFields: await dx('/fields/eras', {
      method: 'GET',
      query: { fields: '*' }
    }),

    eventsFields: await dx('/fields/events', {
      method: 'GET',
      query: { fields: '*' }
    }),

    eventLinksFields: await dx('/fields/event_links', {
      method: 'GET',
      query: { fields: '*' }
    }),

    sampleEras: await dx('/items/eras', {
      method: 'GET',
      query: {
        limit: 5,
        fields: '*'
      }
    }),

    sampleEvents: await dx('/items/events', {
      method: 'GET',
      query: {
        limit: 5,
        fields: '*'
      }
    }),

    sampleEventLinks: await dx('/items/event_links', {
      method: 'GET',
      query: {
        limit: 5,
        fields: '*'
      }
    })
  }
})
