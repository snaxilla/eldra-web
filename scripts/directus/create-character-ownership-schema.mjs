// Character ownership schema -- Player Management (Game Admin), built on
// top of the Eldra Account foundation (scripts/directus/create-eldra-accounts-schema.mjs).
//
// WHAT THIS PROVISIONS, and nothing else:
//
//   entities.owner_account_id   nullable uuid. The Eldra Account that owns
//                                a Player Character entity -- never a
//                                Directus user id (§6.1/§6.2). Null means
//                                "Unassigned," which is the starting and
//                                only state for every character that
//                                predates this field: nothing is inferred
//                                or bulk-assigned by this script or by
//                                anything that reads this column.
//
//   entity_ownership_changes    append-only history. One row per actual
//                                ownership change (assign, reassign,
//                                unassign) -- never per no-op. See
//                                server/utils/character-ownership.ts for
//                                the one place that writes it.
//
// WHY `owner_account_id` LIVES ON `entities`, NOT ON `character_sheets`.
// Ownership is a property of the CHARACTER, and a Player Character and an
// NPC are both rows in `entities` (CLAUDE.md: "entity_type in
// character|npc|npc_sheet|pc|player_character"). Putting the column here
// means an NPC is representable as unowned (the column simply stays null)
// without needing a second, parallel absence-of-ownership convention on a
// collection some entities don't even have a row in yet.
//
// NO DATABASE-LEVEL FOREIGN KEY to eldra_accounts, matching
// create-eldra-accounts-schema.mjs's own precedent and the existing
// `world_memberships.account_id` column: Directus's Fields API cannot
// declare one here any more than it could there. The value a character's
// `owner_account_id` is validated against is checked in application code
// -- server/utils/character-ownership.ts -- exactly where
// server/utils/world-memberships.ts already validates `account_id`.
//
// DEPLOYMENT PREREQUISITE. This script must run (via
// `node scripts/directus/bootstrap.mjs`, which registers it) BEFORE any
// code that reads or writes `entities.owner_account_id` or
// `entity_ownership_changes` is deployed -- the same ordering requirement
// Phase 1's own `create-eldra-accounts-schema.mjs` carries, and for the
// same reason: Directus answers a request against a field or collection
// that does not exist yet with a 403, not a 404 (verified during Phase 1
// against 11.12.0 with an admin token against a definitely-nonexistent
// collection), so a premature deploy fails ownership reads/writes closed,
// not open -- but it does fail, and should be sequenced, not relied on.
//
// NOT DONE HERE, DELIBERATELY: no backfill of owner_account_id for any
// existing character. Every character that exists before this script runs
// starts, and stays, Unassigned until a Platform Admin explicitly assigns
// one -- this script only adds the column and the history collection, it
// never writes a row to either.

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

const ENTITIES = 'entities'
const OWNERSHIP_CHANGES = 'entity_ownership_changes'

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
    },
    fields: [
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
  await ensureField(ENTITIES, uuidField(ENTITIES, 'owner_account_id', {
    required: false,
    note: 'eldra_accounts.id -- the Eldra Account that owns this Player Character. Never a Directus user id. Null means Unassigned, which is the default and starting state for every character; nothing assigns this automatically. Validated against a real, active Account and a current World membership by server/utils/character-ownership.ts, never trusted at the schema level.'
  }))

  await ensureCollection(OWNERSHIP_CHANGES, {
    icon: 'history',
    note: 'Append-only history of character ownership changes (Player Management). One row per ACTUAL assign/reassign/unassign attempt -- never per no-op. See server/utils/character-ownership.ts, the only writer. WRITE-SAFETY REVIEW: Directus REST exposes no cross-collection transaction, so this row and the entities.owner_account_id update it describes are two independent writes -- `status` (below) exists specifically so this collection never implies a change happened when it did not; see that field\'s own note for the exact state machine.',
    displayTemplate: '{{entity_id}}: {{previous_owner_account_id}} -> {{new_owner_account_id}} ({{status}})'
  })

  await ensureField(OWNERSHIP_CHANGES, integerField(OWNERSHIP_CHANGES, 'world_id', {
    required: true,
    note: 'worlds.id -- the World this character belongs to, carried for filtering without a join.'
  }))

  await ensureField(OWNERSHIP_CHANGES, integerField(OWNERSHIP_CHANGES, 'entity_id', {
    required: true,
    note: 'entities.id -- the character this change was made to.'
  }))

  await ensureField(OWNERSHIP_CHANGES, uuidField(OWNERSHIP_CHANGES, 'previous_owner_account_id', {
    required: false,
    note: 'eldra_accounts.id, or null if the character was Unassigned before this change.'
  }))

  await ensureField(OWNERSHIP_CHANGES, uuidField(OWNERSHIP_CHANGES, 'new_owner_account_id', {
    required: false,
    note: 'eldra_accounts.id, or null if this change was an unassignment.'
  }))

  await ensureField(OWNERSHIP_CHANGES, uuidField(OWNERSHIP_CHANGES, 'actor_account_id', {
    required: true,
    note: 'eldra_accounts.id of the Platform Admin who made this change -- Principal.accountId at the time, never inferred.'
  }))

  await ensureField(OWNERSHIP_CHANGES, timestampField(OWNERSHIP_CHANGES, 'changed_at', { required: true }))

  await ensureField(OWNERSHIP_CHANGES, stringField(OWNERSHIP_CHANGES, 'status', {
    required: true,
    defaultValue: 'pending',
    note: "One of: pending | completed | failed. WRITE-SAFETY REVIEW (no cross-collection transaction exists): this row is inserted with status='pending' BEFORE the entities.owner_account_id write is attempted, then patched to 'completed' or 'failed' once that write's own outcome is known. A row that stays 'pending' means the SECOND write (marking the outcome) never completed -- the entity update itself may have succeeded or failed; that cannot be told from this row alone, which is why the entities row's OWN owner_account_id, never this history, is read as the authoritative current owner (server/utils/character-ownership.ts's getCharacterOwnership reads the entity directly). A 'pending' or 'failed' row is a diagnostic signal for an operator, never proof that a reassignment took effect."
  }))

  console.log('Character ownership schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
