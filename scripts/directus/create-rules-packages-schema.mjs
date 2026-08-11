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

const COLLECTION = 'rules_packages'

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
      icon: options.icon || 'library_books',
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
  // auto-incrementing integer primary key. rules_packages.id is required
  // to be a uuid (architecture: rules-package-infrastructure.md §4.1), so
  // the primary key must be declared explicitly at collection-creation
  // time -- it cannot be changed after the fact via /fields.
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
    icon: 'library_books',
    primaryKey: 'uuid',
    note: 'Immutable published Rules Package releases (global, not world-scoped). See .github/docs/architecture/rules-package-infrastructure.md §4.1. Schema only in this commit -- nothing publishes rows here yet.',
    displayTemplate: '{{package_id}} @ {{version}}'
  })

  // Identity. (package_id, version) is the composite identity a World
  // references -- never this row's surrogate uuid (rules-package-
  // infrastructure.md Q2). Directus's Fields API only supports
  // single-column `schema.is_unique`; it has no REST-level primitive for
  // a composite unique constraint, so uniqueness of (package_id, version)
  // is NOT enforced at the database level by this script. See the
  // task summary / commit notes for the proposed next-smallest fix.
  await ensureField(COLLECTION, stringField(COLLECTION, 'package_id', {
    required: true,
    note: 'Reverse-DNS package identifier, e.g. eldra.generic-d20. Never changes across versions. Composite-unique with version (not DB-enforced -- see note above).'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'version', {
    required: true,
    note: 'Semver release string. One row per (package_id, version); published rows are never updated.'
  }))

  // Status / compatibility envelope.
  await ensureField(COLLECTION, stringField(COLLECTION, 'status', {
    required: true,
    defaultValue: 'draft',
    note: 'draft | published. Only published rows may be activated (rules-package-infrastructure.md Q3). This commit does not write any rows.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'engine_api_version', {
    required: true,
    note: 'Engine compatibility version this package targets. Checked at activation, independent of state_schema_version.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'state_schema_version', {
    required: true,
    note: 'Actor state schema version this package expects. Independent of engine_api_version -- a content fix must not force actor-state migration.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'title', {
    required: true,
    note: 'Display title for listing UI without loading manifest/definitions.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'integrity_hash', {
    note: 'SHA-256 over canonicalized definitions. Null while draft; the identity witness once published. Not computed by this script.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'license_id', {
    note: 'Compliance surfacing. Nullable -- not every package declares a license.'
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at', { required: true }))

  // Content. Large JSON blobs -- list/admin endpoints must request
  // envelope columns explicitly and never fields=*.
  await ensureField(COLLECTION, jsonField(COLLECTION, 'manifest', {
    required: true,
    note: 'Whole RulesPackageManifest. May be large -- see query-discipline note in the architecture doc.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'definitions', {
    required: true,
    note: 'All package Definitions, including compiled ASTs. May be multi-megabyte for a real package.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'validation_issues', {
    note: 'PackageValidationIssue[] from the last validatePackage() run. Nullable -- persisted so a failed import\'s diagnostics are never silently discarded.'
  }))

  console.log('Rules Packages schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
