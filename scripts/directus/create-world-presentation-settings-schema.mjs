// Creates the `world_presentation_settings` collection (Theming
// Architecture, Phase 2 -- .github/docs/architecture/theming.md).
//
// One row per World holding the GM-selected visual theme. Additive and
// idempotent: every collection/field is created only if missing, so this is
// safe to run on every deploy (via scripts/directus/bootstrap.mjs). It does
// not touch `world_page_presentations` (per-page backgrounds), which keeps
// working exactly as before.
//
// Absence of a row is legal and means "inherit the platform default
// theme". Writes go through server/utils/world-presentation-settings.ts
// using the service token, gated by `world.settings.edit`.

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

const COLLECTION = 'world_presentation_settings'

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

  const body = {
    collection,
    meta: {
      collection,
      icon: options.icon || 'palette',
      note: options.note || null,
      display_template: options.displayTemplate || null,
      hidden: false,
      singleton: false,
      accountability: 'all'
    },
    schema: {
      name: collection
    }
  }

  await dx('/collections', {
    method: 'POST',
    body: JSON.stringify(body)
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
      is_unique: options.unique === true,
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
  // Directus's default primary key (auto-increment integer) is sufficient:
  // rows are always addressed by world_id, never by id.
  await ensureCollection(COLLECTION, {
    icon: 'palette',
    note: 'GM-selected visual theme per World. One row per World; absence means "use the platform default theme". See .github/docs/architecture/theming.md.',
    displayTemplate: 'world {{world_id}} — {{theme_key}}'
  })

  // worlds.id is a Directus integer primary key (see
  // create-world-rules-config-schema.mjs, same column, same constraint).
  await ensureField(COLLECTION, integerField(COLLECTION, 'world_id', {
    required: true,
    unique: true,
    note: 'worlds.id. Exactly one row per World; enforced as a database-level unique constraint.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'theme_key', {
    maxLength: 64,
    note: 'Theme registry key (app/lib/eldra/themes.ts), e.g. "fantasy". Null or unknown means "use the platform default".'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'theme_options', {
    note: '{ panelOpacity?, panelBlur?, atmosphere? } -- GM tuning of the selected theme. Sanitized and clamped on read and write; viewers\' accessibility preferences always override these.'
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at', { required: true }))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'updated_at', { required: true }))

  console.log('World Presentation Settings schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
