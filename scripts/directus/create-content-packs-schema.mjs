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

const COLLECTION = 'content_packs'

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
      icon: options.icon || 'inventory_2',
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

  // Same reasoning as create-rules-packages-schema.mjs: Directus's default
  // (no explicit `fields` array) provisions an auto-incrementing integer
  // primary key, and the primary key type cannot be changed after
  // collection creation via /fields -- it must be declared here.
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
    icon: 'inventory_2',
    primaryKey: 'uuid',
    note: 'Immutable published Content Pack releases (global, not world-scoped). Content Packs are the Gameplay Content sibling of rules_packages\' Mechanics -- see .github/docs/architecture/ownership-and-permissions.md (Revision 2) §7. Persistence/loading/binding only in this commit -- no importer, no content resolution, no Character Sheet integration. Schema only in this commit -- nothing publishes rows here yet.',
    displayTemplate: '{{package_id}} @ {{version}}'
  })

  // Identity. (package_id, version) is the composite identity a World
  // references -- never this row's surrogate uuid. Mirrors
  // rules_packages.package_id/version exactly (rules-package-
  // infrastructure.md Q2). Directus's Fields API only supports
  // single-column `schema.is_unique`; it has no REST-level primitive for a
  // composite unique constraint, so uniqueness of (package_id, version) is
  // NOT enforced at the database level by this script -- same limitation
  // create-rules-packages-schema.mjs already documents.
  await ensureField(COLLECTION, stringField(COLLECTION, 'package_id', {
    required: true,
    note: 'Reverse-DNS package identifier, e.g. eldra.srd-5.1. Never changes across versions. Composite-unique with version (not DB-enforced -- see note above).'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'version', {
    required: true,
    note: 'Semver release string. One row per (package_id, version); published rows are never updated.'
  }))

  // Status / compatibility envelope. Mirrors rules_packages.status exactly.
  await ensureField(COLLECTION, stringField(COLLECTION, 'status', {
    required: true,
    defaultValue: 'draft',
    note: 'draft | published. Only published rows may be loaded or bound to a World. This commit does not write any rows.'
  }))

  // Deliberately NO engine_api_version-equivalent column. rules_packages'
  // engine_api_version gates activation against the Rules Engine's own
  // evaluator (a real executable this repo ships). Content Packs have no
  // equivalent executor in this phase -- content resolution is explicitly
  // out of scope (task NON-GOALS) -- so there is nothing yet to declare
  // compatibility with. Add this column when a content resolver exists to
  // version against, not speculatively now.
  await ensureField(COLLECTION, integerField(COLLECTION, 'content_schema_version', {
    required: true,
    note: 'Version of the (currently undefined) shape of this pack\'s `content` payload. Independent of the pack\'s own semver `version`, mirroring rules_packages.state_schema_version\'s separation of concerns -- a content fix must not force a schema migration decision, and vice versa.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'title', {
    required: true,
    note: 'Display title for listing UI without loading manifest/content.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'integrity_hash', {
    note: 'SHA-256 over canonicalized content. Null while draft; the identity witness once published. Not computed by this script.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'license_id', {
    note: 'Compliance surfacing (ownership-and-permissions.md Revision 2 §7.2.3 -- licensing is first-class and legally load-bearing for Content Packs). Nullable -- not every pack declares a license.'
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at', { required: true }))

  // Content. Large JSON blobs -- list/admin endpoints must request envelope
  // columns explicitly and never fields=*, exactly as rules_packages
  // documents for its own manifest/definitions.
  await ensureField(COLLECTION, jsonField(COLLECTION, 'manifest', {
    required: true,
    note: 'Pack identity + metadata (packageId, version, status, contentSchemaVersion, title, license, origin). See server/utils/content-packs.ts\'s ContentPackManifest type.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'content', {
    required: true,
    note: 'Gameplay content entries. Opaque in this phase -- no importer or content-resolution consumer exists yet (task NON-GOALS), so no entry shape is defined or enforced here. May be multi-megabyte for a real pack, mirroring rules_packages.definitions.'
  }))

  // Deliberately NO validation_issues column, unlike rules_packages. That
  // field would pre-commit to a future publish-time validator's output
  // shape (PackageValidationIssue[]) before any such validator exists or
  // is scoped for this phase -- unlike `content`, it has no Phase 1
  // consumer (nothing computes, stores, or reads it) and no Phase 1
  // capability depends on it. Add it in the same commit as the validator
  // it would actually serve, not speculatively now.

  console.log('Content Packs schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
