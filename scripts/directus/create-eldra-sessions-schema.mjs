// Eldra-owned session storage -- OIDC sign-in, Beta phase 2. See
// server/utils/eldra-sessions.ts for the one module that reads/writes
// this collection, and that module's own header for why an Eldra-issued
// session is needed at all now that OIDC-authenticated principals have
// no Directus credential to validate a session against.
//
// WHY A NEW COLLECTION, SAME PATTERN AS eldra_accounts/eldra_identity_links.
// Directus-authenticated sessions still carry the raw Directus
// access/refresh token in `eldra_session`/`eldra_refresh`, validated by
// calling Directus `/users/me` -- unchanged, and left exactly as-is for
// this Beta transition. An OIDC-authenticated session has no such
// credential to validate against, so Eldra needs its own session record
// to look up on every request: "does this cookie's token (hashed) match
// a current, unrevoked, unexpired row, and which Account does it name."
//
// NEVER STORES THE RAW TOKEN. Only `token_hash` (a SHA-256 digest) is
// persisted -- the same reasoning password storage already follows,
// applied to a bearer session token: a read of this table (a backup, a
// misconfigured permission, a future bug) hands over nothing usable as a
// session on its own. The raw token exists only in the browser's cookie
// and briefly in server memory while handling one request.
//
// NO DATABASE-LEVEL FOREIGN KEY to eldra_accounts, matching every other
// Eldra-owned collection's own precedent (Directus's Fields API cannot
// declare one) -- validated in application code
// (server/utils/eldra-sessions.ts resolves the account and treats a
// missing one as an invalid session, never as a reason to proceed).

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

const SESSIONS = 'eldra_sessions'

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
      is_unique: options.unique === true,
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
  await ensureCollection(SESSIONS, {
    icon: 'vpn_key',
    note: 'Eldra-issued sessions for OIDC-authenticated principals (Directus-authenticated sessions remain on the existing eldra_session/eldra_refresh cookie mechanism, unchanged, for the Beta transition). See server/utils/eldra-sessions.ts, the only reader/writer.',
    displayTemplate: '{{account_id}} (expires {{expires_at}})'
  })

  await ensureField(SESSIONS, uuidField(SESSIONS, 'account_id', {
    required: true,
    note: 'eldra_accounts.id -- the Account this session authenticates as.'
  }))

  await ensureField(SESSIONS, stringField(SESSIONS, 'token_hash', {
    required: true,
    unique: true,
    maxLength: 255,
    note: 'SHA-256 hex digest of the raw session token. The raw token itself is NEVER stored -- only ever held in the browser cookie and briefly in server memory while validating one request.'
  }))

  await ensureField(SESSIONS, timestampField(SESSIONS, 'created_at', { required: true }))
  await ensureField(SESSIONS, timestampField(SESSIONS, 'expires_at', { required: true }))
  await ensureField(SESSIONS, timestampField(SESSIONS, 'revoked_at', { required: false }))
  await ensureField(SESSIONS, timestampField(SESSIONS, 'last_used_at', { required: false }))

  console.log('Eldra Sessions schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
