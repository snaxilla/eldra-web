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

const COLLECTION = 'scene_layer_objects'

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
        icon: options.icon || 'layers',
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

function floatField(collection, field, options = {}) {
  return {
    field,
    type: 'float',
    meta: baseMeta(collection, field, 'input', options.note, {
      required: options.required,
      width: options.width
    }),
    schema: {
      name: field,
      table: collection,
      data_type: 'double precision',
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

function booleanField(collection, field, options = {}) {
  return {
    field,
    type: 'boolean',
    meta: baseMeta(collection, field, 'boolean', options.note, {
      required: options.required,
      width: options.width
    }),
    schema: {
      name: field,
      table: collection,
      data_type: 'boolean',
      is_nullable: options.required ? false : true,
      default_value: options.defaultValue ?? false
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
    icon: 'layers',
    note: 'Canonical Scene Layer Object persistence. See .github/docs/architecture/scene-graph.md. New object types (regions, fog, weather, ...) must not require new columns here -- they extend via the geometry/properties/style JSON sections only.',
    displayTemplate: '{{object_type}} — {{object_id}}'
  })

  // Persistence association (mapId/layerId are storage-boundary concerns,
  // never part of the runtime LayerObject -- see server/utils/scene-layer-objects.ts).
  await ensureField(COLLECTION, integerField(COLLECTION, 'map_id', {
    required: true,
    note: 'maps.id this object belongs to.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'layer_id', {
    required: true,
    note: 'Scene layer this object belongs to, e.g. pins, image-overlays, roads.'
  }))

  // Universal Layer Object identity (see scene-graph.md Layer Object
  // Required Fields). One column per field -- this is the fixed envelope
  // shared by every object type, not type-specific data.
  await ensureField(COLLECTION, stringField(COLLECTION, 'object_id', {
    required: true,
    note: 'Stable object id, unique within a map. Matches LayerObject.objectId.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'object_type', {
    required: true,
    note: 'e.g. pin, image-overlay, road. New object types do not require schema changes.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'object_schema_version', {
    required: true,
    defaultValue: '1',
    width: 'half'
  }))

  await ensureField(COLLECTION, booleanField(COLLECTION, 'visible', {
    required: true,
    defaultValue: true
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at', { required: true }))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'updated_at', { required: true }))

  // Universal Layer Object metadata (see scene-graph.md Layer Object
  // Optional Fields). Still first-class columns -- optional at the
  // field level, but the field itself is part of the fixed envelope,
  // not object-specific extension data.
  await ensureField(COLLECTION, stringField(COLLECTION, 'name', {
    note: 'Optional display name.'
  }))

  await ensureField(COLLECTION, booleanField(COLLECTION, 'locked', {
    defaultValue: false
  }))

  await ensureField(COLLECTION, floatField(COLLECTION, 'opacity'))

  await ensureField(COLLECTION, integerField(COLLECTION, 'z_offset', {
    note: 'Maps to LayerObject.zOffset.'
  }))

  // Object-specific / extensible data -- these fields are typed `any`
  // (or, for tags, freeform-content `string[]`) on LayerObject with no
  // shape common across object types, so they belong in the same
  // category as properties/style rather than as individual columns.
  // { state, schedule, links, tags, permissionsOverrides, custom }
  await ensureField(COLLECTION, jsonField(COLLECTION, 'metadata', {
    note: 'Object-specific/extensible data: { state, schedule, links, tags, permissionsOverrides, custom }. Not queried individually -- grouped because none has a shape common across object types.'
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'archived_at'))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'deleted_at'))

  // The three type-varying, per-Object-Type sections (see scene-graph.md
  // Object Model). This is the ONLY part of the schema new object types
  // should ever need -- new data, not new columns.
  await ensureField(COLLECTION, jsonField(COLLECTION, 'geometry', {
    required: true,
    note: 'Where the object exists. Never contains rendering information.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'properties', {
    required: true,
    note: 'What the object is. Semantic, versioned, never describes rendering.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'style', {
    required: true,
    note: 'Visual intent only. Renderer-agnostic.'
  }))

  console.log('Scene Layer Object schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
