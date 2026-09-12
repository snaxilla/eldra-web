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

const COLLECTION = 'roll_events'

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
      icon: options.icon || 'casino',
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

  // Same reasoning as create-world-memberships-schema.mjs and
  // create-world-rules-config-schema.mjs: Directus's default (no explicit
  // `fields` array) provisions an auto-incrementing integer primary key,
  // and the primary key type cannot be changed after collection creation
  // via /fields -- it must be declared here. roll_events.id is a uuid
  // (eldra-roll-system.md §6's own RollEventRecord.id), matching
  // world_memberships' own choice of primary key type for the same reason:
  // no natural integer sequence this collection would rather use instead.
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
    icon: 'casino',
    primaryKey: 'uuid',
    note: 'Server-authoritative Roll Events. See .github/docs/architecture/eldra-roll-system.md §6/§14 Phase 1 and .github/docs/architecture/adr-023-server-authoritative-gameplay-events.md. Append-only: every row is a permanent, immutable fact -- created once, never PATCHed, never DELETEd by application code.',
    displayTemplate: '{{label}} — {{total}}'
  })

  // worlds.id is a Directus integer primary key (auto-increment) --
  // verified directly against the live instance by
  // create-world-rules-config-schema.mjs, and every FK to it since
  // (create-world-memberships-schema.mjs, create-entity-relationship-schema.mjs,
  // create-inventory-transfer-schema.mjs, create-world-content-pack-bindings-schema.mjs)
  // has matched that same type without a mismatch. Reused here rather than
  // re-verified, per eldra-roll-system.md §6's own instruction to confirm
  // against already-established precedent before guessing.
  await ensureField(COLLECTION, integerField(COLLECTION, 'world_id', {
    required: true,
    note: 'worlds.id -- the World this roll happened in.'
  }))

  // An Encounter is its own `entities` row (entity_type: 'encounter' --
  // see app/lib/encounters/encounter.ts's own header), and entities.id is
  // the same integer type every entity_id-shaped FK in this schema already
  // uses (character_sheets.entity_id, entity_relationships.source_entity_id/
  // target_entity_id, character_sheet_inventory_transfers'
  // source_entity_id/target_entity_id/item_entity_id).
  await ensureField(COLLECTION, integerField(COLLECTION, 'encounter_id', {
    note: 'entities.id of the active Encounter this roll happened during, when there was one.'
  }))

  // A "character" is likewise an entities row (CLAUDE.md §3) -- same
  // integer type as encounter_id above, for the identical reason.
  await ensureField(COLLECTION, integerField(COLLECTION, 'actor_character_id', {
    note: 'entities.id of the character this roll was made for, when the source had one (null for a bare custom roll with no associated character).'
  }))

  // Directus users (directus_users.id) are uuid -- the same type
  // world_memberships.account_id already uses for "a Directus user id
  // today, stand-in for a future Account id" (create-world-memberships-schema.mjs's
  // own comment). Never taken from the request body -- always
  // event.context.principal.accountId, resolved server-side
  // (server/utils/authorization.ts).
  await ensureField(COLLECTION, uuidField(COLLECTION, 'roller_user_id', {
    required: true,
    note: 'The authenticated Directus user who requested this roll. Server-resolved, never client-asserted.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'label', {
    required: true,
    note: 'Display label, e.g. "Stealth Check", "Longsword Attack" -- never parsed back into meaning by anything that reads this row.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'source_type', {
    required: true,
    note: "One of: ability | saving_throw | skill | action_attack | spell_attack | spell_save | damage | custom (eldra-roll-system.md §4). Not an enum at the Directus level -- validated in application code, matching this project's existing convention for similar string-typed classification columns (e.g. world_memberships.role, entities.visibility)."
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'source_key', {
    note: "The Rules Engine id this roll's bonus was read from, e.g. 'value:skill.stealth.bonus' -- null for source types with none (custom)."
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'source_id', {
    note: 'e.g. a CharacterAction id, for action_attack/spell_attack/damage -- null for source types with none (custom).'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'expression', {
    required: true,
    // OpenDice's own MAX_FORMULA_LENGTH is 1000 characters
    // (eldra-roll-system.md §1) -- this column must not truncate a
    // formula OpenDice itself would have accepted.
    maxLength: 1000,
    note: 'The formula actually rolled, e.g. "1d20", "2d6+3". OpenDice enforces a 1000-character ceiling on formulas; this column matches it.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'dice', {
    required: true,
    note: 'RollDieGroup[] (app/lib/rolls/types.ts) -- every die rolled, including dropped ones, per group.'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'modifier', {
    required: true,
    defaultValue: 0,
    note: 'Sum of flat numeric modifiers (dice are not counted here).'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'modifiers', {
    required: true,
    note: 'number[] -- each flat modifier separately, in order, so "+1 -6" can be shown rather than collapsed to "-5".'
  }))

  await ensureField(COLLECTION, integerField(COLLECTION, 'total', {
    required: true,
    note: 'sum(kept dice) + modifier -- the number the game actually uses.'
  }))

  await ensureField(COLLECTION, stringField(COLLECTION, 'visibility', {
    required: true,
    defaultValue: 'private',
    // Fail closed (eldra-roll-system.md §13): an omitted or malformed
    // visibility on write defaults to the more restrictive state, never
    // the more open one.
    note: "'private' (roller + anyone holding world.roll.see_gm) or 'table' (everyone who can read this World). Defaults to 'private' -- fail closed. Future modes (gm_only/party/whisper/blind_dm/encounter_only) are named, not yet implemented (§5)."
  }))

  await ensureField(COLLECTION, timestampField(COLLECTION, 'created_at', {
    required: true,
    note: 'Server-stamped at roll time -- never client-supplied. Append-only: this row is never updated after creation, so there is no matching updated_at.'
  }))

  await ensureField(COLLECTION, jsonField(COLLECTION, 'metadata', {
    required: true,
    note: "Free-form, extensible without a schema change -- e.g. spell_save's { dc, spellName, savingAbility }. {} when a source type has nothing to add."
  }))

  console.log('Roll Events schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
