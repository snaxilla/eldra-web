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
  const me = await dx('/users/me', {
    method: 'GET',
    query: {
      fields: 'id,email,role.id,role.name,role.admin_access,role.app_access'
    }
  })

  const collections = await dx('/collections', {
    method: 'GET',
    query: {
      filter: {
        collection: {
          _in: ['world_timelines', 'world_timeline_events']
        }
      },
      fields: '*'
    }
  })

  const timelineFields = await dx('/fields/world_timelines', {
    method: 'GET',
    query: { fields: '*' }
  })

  const eventFields = await dx('/fields/world_timeline_events', {
    method: 'GET',
    query: { fields: '*' }
  })

  const permissions = await dx('/permissions', {
    method: 'GET',
    query: {
      filter: {
        collection: {
          _in: ['world_timelines', 'world_timeline_events', 'entities', 'block_instances']
        }
      },
      limit: -1,
      fields: 'id,role,collection,action,permissions,validation,presets,fields'
    }
  })

  const readTimelines = await dx('/items/world_timelines', {
    method: 'GET',
    query: {
      limit: 1,
      fields: '*'
    }
  })

  const testCreateTimeline = await dx('/items/world_timelines', {
    method: 'POST',
    body: {
      world_id: 1,
      title: '__Eldra Diagnostics Timeline__',
      slug: '__eldra-diagnostics-timeline__',
      description: 'Temporary diagnostics row. Safe to delete.',
      visibility: 'hidden',
      sort_order: 999999
    }
  })

  let cleanup: any = { skipped: true }

  const createdId = testCreateTimeline?.ok ? testCreateTimeline?.data?.data?.id : ''
  if (createdId) {
    cleanup = await dx(`/items/world_timelines/${createdId}`, {
      method: 'DELETE'
    })
  }

  return {
    me,
    collections,
    timelineFields,
    eventFields,
    permissions,
    readTimelines,
    testCreateTimeline,
    cleanup
  }
})
