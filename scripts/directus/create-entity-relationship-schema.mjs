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

const COLLECTION = 'entity_relationships'

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
    const message = typeof json === 'string'
      ? json
      : JSON.stringify(json)

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
        icon: options.icon || 'hub',
        note: options.note || null,
        display_template: options.displayTemplate || null,
        hidden: false,
        singleton: false,
        accountability: 'all',
        collapse: 'open'
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

function baseMeta(collection, field, interfaceName, note, options = {}) {
  return {
    collection,
    field,
    interface: interfaceName,
    special: null,
    options: options.options || null,
    display: null,
    display_options: null,
    readonly: options.readonly || false,
    hidden: options.hidden || false,
    sort: null,
    width: options.width || 'half',
    translations: null,
    note: note || null,
    conditions: null,
    required: options.required || false,
    group: null,
    validation: null,
    validation_message: null
  }
}

function integerField(collection, field, options = {}) {
  return {
    field,
    type: 'integer',
    meta: baseMeta(collection, field, 'input', options.note, {
      required: options.required,
      width: options.width || 'half'
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
      width: options.width || 'half',
      options: options.options || null
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
      width: options.width || 'full',
      options: {
        language: 'json'
      }
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
      width: options.width || 'half'
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
    icon: 'hub',
    note: 'Directed relationships between world entities such as allies, enemies, ownership, factions, locations, and story links.',
    displayTemplate: '{{source_entity_id}} {{label}} {{target_entity_id}}'
  })

  await ensureField(COLLECTION, integerField(COLLECTION, 'world_id', {
    required: true,
    note: 'World id for this relationship.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'source_entity_id', {
    required: true,
    note: 'The entity this relationship starts from.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'target_entity_id', {
    required: true,
    note: 'The entity this relationship points to.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'relationship_type', {
    defaultValue: 'related',
    note: 'Broad category such as social, location, faction, possession, family, enemy, quest, lore.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'label', {
    defaultValue: 'related to',
    width: 'full',
    note: 'Forward label shown from source to target.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'inverse_label', {
    width: 'full',
    note: 'Optional reverse label shown from target back to source.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'status', {
    defaultValue: 'active',
    note: 'active, former, rumored, hidden, resolved, broken, etc.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'strength', {
    defaultValue: 0,
    note: 'Optional relationship weight. Negative for hostile, positive for allied/friendly.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'visibility', {
    defaultValue: 'world',
    note: 'world, gm, private, public.'
  }))

  await ensureField(COLLECTION, textField(COLLECTION, 'summary', {
    note: 'Short relationship summary.'
  }))

  await ensureField(COLLECTION, textField(COLLECTION, 'notes', {
    note: 'Longer GM/build notes.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'sort', {
    defaultValue: 100
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'metadata', {
    note: 'Future relationship metadata.'
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at'))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'updated_at'))

  console.log('Done creating/verifying entity relationship schema.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
