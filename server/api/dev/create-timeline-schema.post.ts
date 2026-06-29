import { directusServiceRequest } from '../../utils/directus'

async function dx(path: string, options: any = {}) {
  return await directusServiceRequest(path, options)
}

async function exists(path: string) {
  try {
    await dx(path)
    return true
  } catch {
    return false
  }
}

async function ensureCollection(collection: string, icon: string, note: string, sortField = 'sort_order') {
  if (await exists(`/collections/${collection}`)) {
    return { collection, status: 'exists' }
  }

  await dx('/collections', {
    method: 'POST',
    body: {
      collection,
      meta: {
        collection,
        icon,
        note,
        hidden: false,
        singleton: false,
        sort_field: sortField
      },
      schema: {
        name: collection
      }
    }
  })

  return { collection, status: 'created' }
}

function interfaceFor(type: string) {
  if (type === 'text') return 'input-multiline'
  if (type === 'integer') return 'input'
  if (type === 'uuid') return 'input'
  return 'input'
}

async function ensureField(collection: string, field: string, type: string, schema: any = {}, meta: any = {}) {
  if (await exists(`/fields/${collection}/${field}`)) {
    return { collection, field, status: 'exists' }
  }

  await dx(`/fields/${collection}`, {
    method: 'POST',
    body: {
      field,
      type,
      schema: {
        name: field,
        ...schema
      },
      meta: {
        field,
        interface: interfaceFor(type),
        width: 'full',
        ...meta
      }
    }
  })

  return { collection, field, status: 'created' }
}

export default defineEventHandler(async () => {
  const results: any[] = []

  results.push(await ensureCollection(
    'world_timelines',
    'timeline',
    'Eldra world timelines for eras, history, campaign arcs, and lore chronology.'
  ))

  results.push(await ensureField('world_timelines', 'id', 'uuid', {
    is_primary_key: true,
    has_auto_increment: false
  }, {
    hidden: true,
    readonly: true
  }))

  results.push(await ensureField('world_timelines', 'world_id', 'integer', {}, {
    note: 'Owning Eldra world id.'
  }))

  results.push(await ensureField('world_timelines', 'title', 'string'))
  results.push(await ensureField('world_timelines', 'slug', 'string'))
  results.push(await ensureField('world_timelines', 'description', 'text', {}, {
    interface: 'input-rich-text-md'
  }))
  results.push(await ensureField('world_timelines', 'visibility', 'string', {}, {
    note: 'public, players, gm, owner, hidden'
  }))
  results.push(await ensureField('world_timelines', 'sort_order', 'integer'))
  results.push(await ensureField('world_timelines', 'created_at', 'timestamp', {}, {
    readonly: true,
    special: ['date-created']
  }))
  results.push(await ensureField('world_timelines', 'updated_at', 'timestamp', {}, {
    readonly: true,
    special: ['date-updated']
  }))

  results.push(await ensureCollection(
    'world_timeline_events',
    'event',
    'Events, eras, periods, sessions, and notes belonging to Eldra timelines.'
  ))

  results.push(await ensureField('world_timeline_events', 'id', 'uuid', {
    is_primary_key: true,
    has_auto_increment: false
  }, {
    hidden: true,
    readonly: true
  }))

  results.push(await ensureField('world_timeline_events', 'world_id', 'integer', {}, {
    note: 'Owning Eldra world id.'
  }))
  results.push(await ensureField('world_timeline_events', 'timeline_id', 'uuid', {}, {
    note: 'Parent world_timelines id.'
  }))
  results.push(await ensureField('world_timeline_events', 'title', 'string'))
  results.push(await ensureField('world_timeline_events', 'slug', 'string'))
  results.push(await ensureField('world_timeline_events', 'event_kind', 'string', {}, {
    note: 'event, era, period, session, note'
  }))
  results.push(await ensureField('world_timeline_events', 'date_label', 'string'))
  results.push(await ensureField('world_timeline_events', 'end_date_label', 'string'))
  results.push(await ensureField('world_timeline_events', 'sort_order', 'integer'))
  results.push(await ensureField('world_timeline_events', 'summary_markdown', 'text', {}, {
    interface: 'input-rich-text-md'
  }))
  results.push(await ensureField('world_timeline_events', 'visibility', 'string', {}, {
    note: 'public, players, gm, owner, hidden'
  }))
  results.push(await ensureField('world_timeline_events', 'created_at', 'timestamp', {}, {
    readonly: true,
    special: ['date-created']
  }))
  results.push(await ensureField('world_timeline_events', 'updated_at', 'timestamp', {}, {
    readonly: true,
    special: ['date-updated']
  }))

  return {
    success: true,
    results
  }
})
