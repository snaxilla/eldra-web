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

const COLLECTION = 'world_rules_config'

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
      icon: options.icon || 'settings_suggest',
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

  // Directus's default (no explicit `fields` array) provisions an
  // auto-incrementing integer primary key. world_rules_config.id is
  // required to be a uuid (architecture: rules-package-infrastructure.md
  // §4.2), so the primary key must be declared explicitly at
  // collection-creation time -- it cannot be changed after the fact via
  // /fields (see create-rules-packages-schema.mjs, same pattern).
  if (options.primaryKey === 'uuid') {
    body.fields = [
      {
        field: 'id',
        type: 'uuid',
        meta: {
          hidden: true,
          interface: 'input',
          readonly: true,
          special: ['uuid']
        },
        schema: {
          is_primary_key: true,
          has_auto_increment: false,
          data_type: 'uuid',
          length: 36
        }
      }
    ]
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
  await ensureCollection(COLLECTION, {
    icon: 'settings_suggest',
    primaryKey: 'uuid',
    note: 'Which Rules Package a World has activated, plus that World\'s settings/roll-type overrides. One row per World; absence is legal and means "unconfigured". See .github/docs/architecture/rules-package-infrastructure.md §4.2. Schema + persistence only in this commit -- nothing activates a package yet.',
    displayTemplate: 'world {{world_id}} — {{active_package_id}}@{{active_package_version}}'
  })

  // Identity. worlds.id is a Directus integer primary key (auto-increment,
  // not nullable) -- verified directly against the live production
  // instance for this commit, not inferred from application code (past
  // mismatch precedent: create-scene-layer-objects-schema.mjs's map_id).
  // Directus's Fields API DOES support single-column schema.is_unique
  // (unlike the composite (package_id, version) key rules_packages needed
  // -- see that script's own note on why composite uniqueness could not be
  // DB-enforced there); one row per World is a single-column constraint, so
  // it is enforced here at the database level.
  await ensureField(COLLECTION, integerField(COLLECTION, 'world_id', {
    required: true,
    unique: true,
    note: 'worlds.id. Exactly one row per World; enforced as a database-level unique constraint.'
  }))

  // Active package binding (rules-package-infrastructure.md Q6). A row's
  // existence means "this World is configured" -- both id/version are
  // therefore required, not nullable.
  await ensureField(COLLECTION, stringField(COLLECTION, 'active_package_id', {
    required: true,
    note: 'rules_packages.package_id this World has activated.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'active_package_version', {
    required: true,
    note: 'rules_packages.version this World has activated.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'active_package_integrity', {
    note: 'Integrity witness copied from rules_packages.integrity_hash at activation time. A mismatch on load is a loud error, never silent (rules-package-infrastructure.md §4.2). Nullable -- not set until an activation write happens (not implemented in this commit).'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'world_config_version', {
    required: true,
    defaultValue: 1,
    note: 'Monotonically incremented on every write (rules-package-infrastructure.md §K.6). Reserved as a future cross-session cache key.'
  }))

  // World-owned data (world-configuration.md §3.1's four facts, minus
  // package selection which is the two active_package_* columns above).
  await ensureField(COLLECTION, jsonField(COLLECTION, 'settings', {
    required: true,
    note: '{ [kind]: { [key]: scalar } } -- answers to the package\'s declared requiredTraits/optionalRules. "rules" is the engine-reserved kind.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'roll_types', {
    required: true,
    note: '{ [rollTypeId]: { enabled?, order?, rollSpec?, visibility? } } -- this World\'s overrides of the package\'s declared roll types.'
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at', { required: true }))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'updated_at', { required: true }))

  console.log('World Rules Config schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
