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

const COLLECTION = 'world_memberships'

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

  // Same reasoning as create-world-rules-config-schema.mjs and
  // create-rules-packages-schema.mjs: Directus's default (no explicit
  // `fields` array) provisions an auto-incrementing integer primary key,
  // and the primary key type cannot be changed after collection creation
  // via /fields -- it must be declared here.
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

function uuidField(collection, field, options = {}) {
  return {
    field,
    type: 'uuid',
    meta: baseMeta(collection, field, 'input', options.note, {
      required: options.required,
      width: options.width
    }),
    schema: {
      name: field,
      table: collection,
      data_type: 'uuid',
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
    icon: 'group',
    primaryKey: 'uuid',
    note: 'Which Account holds which role in which World -- the real replacement for worlds.owner_id. See .github/docs/architecture/ownership-and-permissions.md (Revision 2) §8.5/§10.1/§12 Phase 2. One row per (world_id, account_id); NOT enforced as a database-level composite unique constraint (Directus Fields API only supports single-column uniqueness -- same limitation create-rules-packages-schema.mjs\'s (package_id, version) key hit), so this is an APPLICATION-level invariant, checked by server/utils/world-memberships.ts before insert. Likewise "exactly one owner per world" is an application invariant, not a database one.',
    displayTemplate: 'world {{world_id}} — {{account_id}} ({{role}})'
  })

  // worlds.id is a Directus integer primary key (auto-increment) --
  // verified directly against the live instance (same verification this
  // project's own precedent, create-world-rules-config-schema.mjs, already
  // performed and documents).
  await ensureField(COLLECTION, integerField(COLLECTION, 'world_id', {
    required: true,
    note: 'worlds.id -- the World this membership grants a role in.'
  }))

  // There is no Accounts collection yet (architecture doc §12 Phase 1,
  // deliberately deferred past this commit's NON-GOALS). account_id is a
  // Directus user id (uuid) for now -- the SAME identifier
  // Principal.accountId already carries (server/utils/authorization.ts)
  // and the same type worlds.owner_id already used. When real Accounts
  // land, this column's values are what a Phase 1 migration maps 1:1 onto
  // new Account rows; the column itself does not need to change shape.
  await ensureField(COLLECTION, uuidField(COLLECTION, 'account_id', {
    required: true,
    note: 'Directus user id today (stand-in for a future Account id) -- the Principal this membership belongs to.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'role', {
    required: true,
    note: "One of: owner | gm | worldbuilder | player | observer. See server/utils/authorization.ts's WORLD_ROLE_CAPABILITIES for what each role grants. Not an enum at the Directus level -- validated in application code, matching this project's existing convention for similar string-typed classification columns (e.g. entities.visibility)."
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at', { required: true }))
  await ensureField(COLLECTION, timestampField(COLLECTION, 'updated_at', { required: true }))

  console.log('World Memberships schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
