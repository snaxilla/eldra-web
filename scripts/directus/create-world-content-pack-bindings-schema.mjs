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

const COLLECTION = 'world_content_pack_bindings'

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
      icon: options.icon || 'link',
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

  // Same reasoning as create-content-packs-schema.mjs / create-world-
  // memberships-schema.mjs: Directus's default (no explicit `fields`
  // array) provisions an auto-incrementing integer primary key, and the
  // primary key type cannot be changed after collection creation via
  // /fields -- it must be declared here.
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
    icon: 'link',
    primaryKey: 'uuid',
    note: 'Which Content Packs, at which pinned version, a World has bound. Deliberately NOT shaped like world_rules_config (one row per World, active_package_id/version columns) -- a World may bind MULTIPLE Content Packs (design goal: "support multiple Content Packs per World in the future"), so this is a join collection, one row per (world_id, package_id), mirroring world_memberships\' multi-row-per-world shape rather than world_rules_config\'s single-row shape. Composite uniqueness of (world_id, package_id) is an APPLICATION-level invariant (server/utils/world-content-packs.ts), NOT a database constraint -- same Directus Fields API limitation create-rules-packages-schema.mjs and create-world-memberships-schema.mjs already document.',
    displayTemplate: 'world {{world_id}} — {{package_id}} @ {{package_version}}'
  })

  // worlds.id is a Directus integer primary key -- same verified fact
  // create-world-rules-config-schema.mjs and create-world-memberships-
  // schema.mjs already record against the live instance.
  await ensureField(COLLECTION, integerField(COLLECTION, 'world_id', {
    required: true,
    note: 'worlds.id -- the World this binding belongs to. Composite-unique with package_id (app-level, see collection note).'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'package_id', {
    required: true,
    note: 'content_packs.package_id -- which Content Pack this World has bound. Composite-unique with world_id (app-level).'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'package_version', {
    required: true,
    note: 'The PINNED version of package_id this World currently uses -- never a database row id and never an embedded copy, mirroring world_rules_config.active_package_version\'s reasoning (rules-package-infrastructure.md §B.6). Repinning to a new version updates this column in place; it does not create a second row.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'package_integrity', {
    note: 'Witness, not a key -- the content_packs.integrity_hash recorded at bind time, mirroring world_rules_config.active_package_integrity. A mismatch on reload is a loud error, never a silent divergence.'
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at', { required: true }))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'updated_at', { required: true }))

  console.log('World Content Pack Bindings schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
