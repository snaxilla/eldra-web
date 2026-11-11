// Content Workspaces & Studio Phase 0, Area 1 -- Media Gallery World
// scoping. See .github/docs/architecture/content-workspaces-and-studio.md
// Phase 0 item 1/2.
//
// ROOT CAUSE this fixes: GET /api/worlds/:id/media (server/utils/directus.ts
// -> directus_files) has never recorded which World a file belongs to.
// Uploads only ever wrote a free-text `description` string ("Eldra media
// upload for world N") -- not a queryable, authoritative field, and never
// intended as proof of ownership. Without a real column, the listing route
// could only ever return every image in the instance, regardless of which
// World's route it was requested through.
//
// This script adds exactly one new field, `world_id` (integer, nullable),
// to Directus's own `directus_files` system collection -- the same
// `ensureField`-only pattern every other schema script here already uses
// for ADDING a field, just targeting a system collection instead of a new
// one (ensureCollection is skipped: directus_files already exists and is
// not ours to create). `world_id` matches the exact column name and
// integer type every other per-World collection in this codebase already
// uses (world_rules_config.world_id, world_presentation_settings.world_id,
// world_content_pack_bindings.world_id) -- worlds.id is a Directus
// auto-increment integer primary key, never a uuid.
//
// Idempotent and additive: safe to run on every deploy via bootstrap.mjs,
// exactly like every other create-*-schema.mjs script.
//
// WHAT THIS DOES NOT DO: it does not backfill `world_id` for any file
// uploaded before this script runs. Those rows have `world_id: null` and
// are therefore excluded from every per-World listing once
// media.get.ts's filter is live (see that route's own header) --
// deliberately, since the only other signal available for those rows is
// the free-text description, which is not authoritative and this task's
// own instructions forbid treating as sufficient proof of ownership.
// Re-associating pre-existing files is an explicit, admin-reviewed
// follow-up, not something this migration does silently.

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

const COLLECTION = 'directus_files'
const FIELD = 'world_id'

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

async function createSchema() {
  await ensureField(COLLECTION, {
    field: FIELD,
    type: 'integer',
    meta: {
      collection: COLLECTION,
      field: FIELD,
      interface: 'input',
      display: 'raw',
      hidden: false,
      readonly: false,
      sort: 100,
      width: 'half',
      note: 'The World (worlds.id) a media upload belongs to. Written at upload time by POST /api/worlds/:id/media/upload; read by GET /api/worlds/:id/media to scope the Media Gallery listing to one World. Null for every file uploaded before this field existed -- absence is legal and means "not associated with any World listing".',
      required: false
    },
    schema: {
      name: FIELD,
      table: COLLECTION,
      data_type: 'integer',
      is_nullable: true,
      default_value: null
    }
  })

  console.log('Media Gallery World-scope schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
