const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.NUXT_PUBLIC_DIRECTUS_URL ||
  'https://directus.theledouxs.com'

const DIRECTUS_TOKEN =
  process.env.DIRECTUS_SCHEMA_TOKEN ||
  process.env.DIRECTUS_TOKEN ||
  process.env.NUXT_DIRECTUS_TOKEN ||
  process.env.NITRO_DIRECTUS_TOKEN ||
  ''

const COLLECTION = 'character_sheet_inventory_transfers'

if (!DIRECTUS_TOKEN) {
  console.error('Missing Directus token for schema migration.')
  process.exit(1)
}

async function dx(path, options = {}) {
  const res = await fetch(`${DIRECTUS_URL.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  const text = await res.text()
  let json = null

  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }

  if (!res.ok) {
    const message = typeof json === 'string' ? json : JSON.stringify(json)
    throw new Error(`${res.status} ${res.statusText}: ${message}`)
  }

  return json
}

async function collectionNames() {
  const res = await dx('/collections')
  return new Set(
    (Array.isArray(res?.data) ? res.data : [])
      .map((row) => String(row?.collection || '').trim())
      .filter(Boolean)
  )
}

async function ensureCollection(collection, options = {}) {
  const names = await collectionNames()

  if (names.has(collection)) {
    console.log(`Collection exists: ${collection}`)
    return
  }

  await dx('/collections', {
    method: 'POST',
    body: JSON.stringify({
      collection,
      meta: {
        collection,
        icon: options.icon || 'swap_horiz',
        note: options.note || null,
        display_template: options.displayTemplate || null,
        hidden: false,
        singleton: false,
        accountability: 'all'
      },
      schema: {
        name: collection
      }
    })
  })

  console.log(`Created collection: ${collection}`)
}

async function fieldNames(collection) {
  const res = await dx(`/fields/${collection}`)

  return new Set(
    (Array.isArray(res?.data) ? res.data : [])
      .map((row) => String(row?.field || '').trim())
      .filter(Boolean)
  )
}

async function ensureField(collection, fieldDef) {
  const names = await fieldNames(collection)

  if (names.has(fieldDef.field)) {
    console.log(`Field exists: ${collection}.${fieldDef.field}`)
    return
  }

  await dx(`/fields/${collection}`, {
    method: 'POST',
    body: JSON.stringify(fieldDef)
  })

  console.log(`Created field: ${collection}.${fieldDef.field}`)
}

let sort = 1

function baseMeta(collection, field, interfaceName, note, extra = {}) {
  return {
    collection,
    field,
    interface: interfaceName,
    display: 'raw',
    hidden: false,
    readonly: false,
    sort: sort++,
    width: extra.width || 'half',
    note: note || null,
    required: extra.required === true
  }
}

function integerField(collection, field, options = {}) {
  return {
    field,
    type: 'integer',
    meta: baseMeta(collection, field, 'input', options.note, {
      required: options.required,
      width: options.width
    }),
    schema: {
      name: field,
      table: collection,
      data_type: 'integer',
      is_nullable: options.required ? false : true,
      default_value: options.defaultValue ?? null
    }
  }
}

function stringField(collection, field, options = {}) {
  return {
    field,
    type: 'string',
    meta: baseMeta(collection, field, options.interface || 'input', options.note, {
      required: options.required,
      width: options.width
    }),
    schema: {
      name: field,
      table: collection,
      data_type: 'character varying',
      max_length: options.maxLength || 255,
      is_nullable: options.required ? false : true,
      default_value: options.defaultValue ?? null
    }
  }
}

function textField(collection, field, options = {}) {
  return {
    field,
    type: 'text',
    meta: baseMeta(collection, field, 'input-multiline', options.note, {
      required: options.required,
      width: options.width || 'full'
    }),
    schema: {
      name: field,
      table: collection,
      data_type: 'text',
      is_nullable: options.required ? false : true,
      default_value: null
    }
  }
}

function jsonField(collection, field, options = {}) {
  return {
    field,
    type: 'json',
    meta: baseMeta(collection, field, 'input-code', options.note, {
      required: options.required,
      width: options.width || 'full'
    }),
    schema: {
      name: field,
      table: collection,
      data_type: 'json',
      is_nullable: options.required ? false : true,
      default_value: null
    }
  }
}

function timestampField(collection, field, options = {}) {
  return {
    field,
    type: 'timestamp',
    meta: baseMeta(collection, field, 'datetime', options.note, {
      required: options.required,
      width: options.width
    }),
    schema: {
      name: field,
      table: collection,
      data_type: 'timestamp with time zone',
      is_nullable: options.required ? false : true,
      default_value: options.defaultValue ?? null
    }
  }
}

async function createSchema() {
  await ensureCollection(COLLECTION, {
    icon: 'swap_horiz',
    note: 'Tracks character inventory item offers, trades, accepts, declines, cancellations, and future DM grants.',
    displayTemplate: '{{item_name}} — {{status}}'
  })

  await ensureField(COLLECTION, integerField(COLLECTION, 'world_id', {
    required: true,
    note: 'World id for this transfer.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'source_sheet_id', {
    note: 'Offering character_sheets.id. Null for future DM grants.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'source_entity_id', {
    note: 'Offering character entity id. Null for future DM grants.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'target_sheet_id', {
    required: true,
    note: 'Receiving character_sheets.id.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'target_entity_id', {
    required: true,
    note: 'Receiving character entity id.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'source_inventory_id', {
    note: 'Original character_sheet_inventory.id.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'item_entity_id', {
    note: 'Linked imported/homebrew item entity id, when available.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'item_name', {
    required: true,
    width: 'full',
    note: 'Snapshot item name at offer time.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'quantity', {
    required: true,
    defaultValue: 1,
    note: 'Quantity being transferred.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'status', {
    required: true,
    defaultValue: 'offered',
    note: 'offered, completed, declined, cancelled, or granted.'
  }))

  await ensureField(COLLECTION, textField(COLLECTION, 'message', {
    note: 'Optional player-facing transfer message.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'item_snapshot', {
    note: 'Snapshot of the source inventory row/item state at offer time.'
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at'))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'updated_at'))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'accepted_at'))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'declined_at'))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'cancelled_at'))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'completed_at'))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'source_cleared_at', {
    note: 'When the source character cleared this transfer from their history.'
  }))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'target_cleared_at', {
    note: 'When the target character cleared this transfer from their history.'
  }))

  console.log('Inventory transfer schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
