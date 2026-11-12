// Shared provisioning helpers for spec-driven schema scripts. Same
// ensureCollection/ensureField check-before-create idempotency every
// create-*-schema.mjs here already uses, taken from a declarative spec
// instead of repeated per script. No side effects on import.

export function resolveDirectusConfig(env = process.env) {
  return {
    url: (env.DIRECTUS_URL || env.NUXT_PUBLIC_DIRECTUS_URL || 'https://directus.theledouxs.com').replace(/\/$/, ''),
    token: env.DIRECTUS_SCHEMA_TOKEN || env.DIRECTUS_TOKEN || env.NUXT_DIRECTUS_TOKEN || env.NITRO_DIRECTUS_TOKEN || ''
  }
}

export function createDirectusClient(config, fetchImpl = fetch) {
  return async function dx(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
    if (options.anonymous !== true) headers.Authorization = `Bearer ${config.token}`

    const res = await fetchImpl(`${config.url}${path}`, { method: options.method, body: options.body, headers })
    const text = await res.text()

    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }

    if (!res.ok) {
      const message = typeof json === 'string' ? json : JSON.stringify(json)
      const error = new Error(`${options.method || 'GET'} ${path} -> ${res.status} ${res.statusText}: ${message}`)
      error.status = res.status
      throw error
    }

    return json
  }
}

const DATA_TYPES = {
  string: 'character varying',
  text: 'text',
  json: 'json',
  integer: 'integer',
  boolean: 'boolean',
  timestamp: 'timestamp with time zone',
  uuid: 'uuid'
}

const INTERFACES = {
  string: 'input',
  text: 'input-multiline',
  json: 'input-code',
  integer: 'input',
  boolean: 'boolean',
  timestamp: 'datetime',
  uuid: 'input'
}

// Translates one spec field into a Directus Fields API payload.
export function buildFieldPayload(collection, field, sort) {
  const dataType = DATA_TYPES[field.type]
  if (!dataType) throw new Error(`Unknown field type '${field.type}' for ${collection}.${field.field}`)

  const schema = {
    name: field.field,
    table: collection,
    data_type: dataType,
    is_nullable: field.required !== true,
    is_unique: field.unique === true,
    is_indexed: field.indexed === true,
    default_value: field.defaultValue ?? null
  }
  if (field.type === 'string') schema.max_length = field.maxLength || 255

  return {
    field: field.field,
    type: field.type,
    meta: {
      collection,
      field: field.field,
      interface: INTERFACES[field.type],
      display: 'raw',
      hidden: false,
      readonly: false,
      sort,
      width: field.type === 'json' || field.type === 'text' ? 'full' : 'half',
      note: field.note || null,
      required: field.required === true
    },
    schema
  }
}

export function buildCollectionPayload(spec) {
  return {
    collection: spec.collection,
    meta: {
      collection: spec.collection,
      icon: spec.icon || 'inventory_2',
      note: spec.note || null,
      display_template: spec.displayTemplate || null,
      hidden: false,
      singleton: false,
      accountability: 'all'
    },
    schema: { name: spec.collection },
    // The primary key type cannot be changed after creation, so it is
    // declared here rather than through /fields.
    fields: [
      {
        field: 'id',
        type: 'uuid',
        meta: { hidden: true, interface: 'input', readonly: true, special: ['uuid'] },
        schema: { is_primary_key: true, has_auto_increment: false, data_type: 'uuid', length: 36 }
      }
    ]
  }
}

async function listCollections(dx) {
  const res = await dx('/collections')
  return new Set((Array.isArray(res?.data) ? res.data : []).map((row) => String(row?.collection || '')).filter(Boolean))
}

export async function listFields(dx, collection) {
  const res = await dx(`/fields/${collection}`)
  return new Map((Array.isArray(res?.data) ? res.data : []).map((row) => [String(row?.field || ''), row]))
}

// Creates a spec's collection and any of its fields that do not exist
// yet. `createCollection: false` is for adding fields to a collection
// another script owns.
export async function provisionCollection(dx, spec, log = console.log, options = {}) {
  if (options.createCollection !== false) {
    const collections = await listCollections(dx)
    if (collections.has(spec.collection)) {
      log(`Collection exists: ${spec.collection}`)
    } else {
      await dx('/collections', { method: 'POST', body: JSON.stringify(buildCollectionPayload(spec)) })
      log(`Created collection: ${spec.collection}`)
    }
  }

  const existing = await listFields(dx, spec.collection)
  let sort = existing.size + 1

  for (const field of spec.fields) {
    if (existing.has(field.field)) {
      log(`Field exists: ${spec.collection}.${field.field}`)
      continue
    }
    await dx(`/fields/${spec.collection}`, {
      method: 'POST',
      body: JSON.stringify(buildFieldPayload(spec.collection, field, sort++))
    })
    log(`Created field: ${spec.collection}.${field.field}`)
  }
}

// Reports every way the live schema falls short of the spec. An existing
// field is never altered by provisioning, so a constraint the spec
// requires but the database lacks is found here rather than assumed.
export async function findSchemaProblems(dx, spec) {
  const problems = []
  let fields
  try {
    fields = await listFields(dx, spec.collection)
  } catch (error) {
    return [`${spec.collection}: collection is missing or unreadable (${error.message})`]
  }

  for (const field of spec.fields) {
    const live = fields.get(field.field)
    if (!live) {
      problems.push(`${spec.collection}.${field.field}: field is missing`)
      continue
    }
    if (field.unique === true && live.schema?.is_unique !== true) {
      problems.push(`${spec.collection}.${field.field}: must be UNIQUE in the database, and is not`)
    }
    if (field.indexed === true && live.schema?.is_indexed !== true && live.schema?.is_unique !== true) {
      problems.push(`${spec.collection}.${field.field}: should be indexed, and is not`)
    }
    if (field.required === true && live.schema?.is_nullable !== false) {
      problems.push(`${spec.collection}.${field.field}: must be NOT NULL in the database, and is nullable`)
    }
  }

  return problems
}
