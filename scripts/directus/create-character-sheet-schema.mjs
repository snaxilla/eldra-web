import fs from 'node:fs'
import { execSync } from 'node:child_process'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const idx = trimmed.indexOf('=')
    if (idx === -1) continue

    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    value = value.replace(/^["']|["']$/g, '')

    if (!process.env[key]) process.env[key] = value
  }
}

function loadRuntimeNuxtEnv() {
  try {
    const output = execSync("ps -eo pid=,args= | awk '/node \\.output\\/server\\/index\\.mjs/ && !/awk/ {print $1; exit}'", {
      encoding: 'utf8'
    }).trim()

    if (!output) return {}

    const raw = fs.readFileSync(`/proc/${output}/environ`, 'utf8')
    const env = {}

    for (const entry of raw.split('\0')) {
      if (!entry) continue
      const idx = entry.indexOf('=')
      if (idx === -1) continue
      env[entry.slice(0, idx)] = entry.slice(idx + 1)
    }

    return env
  } catch {
    return {}
  }
}

for (const file of ['.env', '.env.local', '.env.production']) {
  loadEnvFile(file)
}

const runtimeEnv = loadRuntimeNuxtEnv()

const directusUrl = String(
  process.env.DIRECTUS_URL ||
  runtimeEnv.DIRECTUS_URL ||
  process.env.NUXT_PUBLIC_DIRECTUS_URL ||
  runtimeEnv.NUXT_PUBLIC_DIRECTUS_URL ||
  ''
).replace(/\/$/, '')

const directusToken = String(
  process.env.DIRECTUS_TOKEN ||
  runtimeEnv.DIRECTUS_TOKEN ||
  ''
)

if (!directusUrl || !directusToken) {
  console.error('Missing Directus URL or service token. Set DIRECTUS_URL/NUXT_PUBLIC_DIRECTUS_URL and DIRECTUS_TOKEN, or run while the Nuxt server process is active.')
  process.exit(1)
}

async function directusRequest(method, path, body = undefined) {
  const headers = {
    Authorization: `Bearer ${directusToken}`
  }

  const options = { method, headers }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  const res = await fetch(`${directusUrl}${path}`, options)
  const text = await res.text()

  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    const message = json?.errors?.[0]?.message || json?.message || text || `Directus request failed (${res.status})`
    throw new Error(`${method} ${path}: ${message}`)
  }

  return json
}

async function collectionExists(collection) {
  const res = await directusRequest('GET', '/collections?limit=-1')
  return (res.data || []).some((item) => item.collection === collection)
}

async function fieldExists(collection, field) {
  const res = await directusRequest('GET', `/fields/${collection}`)
  return (res.data || []).some((item) => item.field === field)
}

async function ensureCollection(collection, meta = {}) {
  if (await collectionExists(collection)) {
    console.log(`OK collection exists: ${collection}`)
    return
  }

  await directusRequest('POST', '/collections', {
    collection,
    meta: {
      hidden: false,
      singleton: false,
      ...meta
    },
    schema: {
      name: collection
    }
  })

  console.log(`CREATED collection: ${collection}`)
}

async function ensureField(collection, fieldConfig) {
  if (await fieldExists(collection, fieldConfig.field)) {
    console.log(`OK field exists: ${collection}.${fieldConfig.field}`)
    return
  }

  await directusRequest('POST', `/fields/${collection}`, fieldConfig)
  console.log(`CREATED field: ${collection}.${fieldConfig.field}`)
}

function stringField(field, options = {}) {
  return {
    field,
    type: 'string',
    meta: {
      interface: options.interface || 'input',
      width: options.width || 'half',
      required: options.required || false,
      note: options.note || null
    },
    schema: {
      is_nullable: options.required ? false : true,
      default_value: options.defaultValue ?? null
    }
  }
}

function integerField(field, options = {}) {
  return {
    field,
    type: 'integer',
    meta: {
      interface: 'input',
      width: options.width || 'half',
      required: options.required || false,
      note: options.note || null
    },
    schema: {
      is_nullable: options.required ? false : true,
      default_value: options.defaultValue ?? null
    }
  }
}

function booleanField(field, options = {}) {
  return {
    field,
    type: 'boolean',
    meta: {
      interface: 'boolean',
      width: options.width || 'half',
      required: false,
      note: options.note || null
    },
    schema: {
      is_nullable: true,
      default_value: options.defaultValue ?? false
    }
  }
}

function textField(field, options = {}) {
  return {
    field,
    type: 'text',
    meta: {
      interface: 'input-multiline',
      width: options.width || 'full',
      required: false,
      note: options.note || null
    },
    schema: {
      is_nullable: true
    }
  }
}

function jsonField(field, options = {}) {
  return {
    field,
    type: 'json',
    meta: {
      interface: 'input-code',
      width: options.width || 'full',
      required: false,
      note: options.note || null,
      options: {
        language: 'json'
      }
    },
    schema: {
      is_nullable: true
    }
  }
}

function timestampField(field, options = {}) {
  return {
    field,
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      width: options.width || 'half',
      readonly: false,
      hidden: options.hidden || false,
      note: options.note || null
    },
    schema: {
      is_nullable: true
    }
  }
}

async function createCharacterSheetsSchema() {
  await ensureCollection('character_sheets', {
    icon: 'assignment_ind',
    note: 'Mechanical character sheets linked to character articles'
  })

  await ensureField('character_sheets', integerField('world_id', {
    required: true,
    note: 'Owning world id'
  }))
  await ensureField('character_sheets', integerField('entity_id', {
    required: true,
    note: 'Linked character article entity id'
  }))
  await ensureField('character_sheets', stringField('sheet_type', {
    defaultValue: 'dnd5e',
    note: 'Rules/system key, e.g. dnd5e'
  }))
  await ensureField('character_sheets', stringField('name', {
    required: true,
    width: 'full'
  }))
  await ensureField('character_sheets', integerField('level', {
    defaultValue: 1
  }))
  await ensureField('character_sheets', stringField('class_name'))
  await ensureField('character_sheets', stringField('subclass_name'))
  await ensureField('character_sheets', stringField('species_name'))
  await ensureField('character_sheets', stringField('background_name'))
  await ensureField('character_sheets', booleanField('is_active', {
    defaultValue: true,
    note: 'Active sheet for the linked character article'
  }))
  await ensureField('character_sheets', stringField('visibility', {
    defaultValue: 'world'
  }))
  await ensureField('character_sheets', jsonField('ability_scores'))
  await ensureField('character_sheets', jsonField('combat_stats'))
  await ensureField('character_sheets', jsonField('proficiencies'))
  await ensureField('character_sheets', jsonField('resources'))
  await ensureField('character_sheets', jsonField('spellcasting'))
  await ensureField('character_sheets', jsonField('features'))
  await ensureField('character_sheets', jsonField('notes'))
  await ensureField('character_sheets', timestampField('created_at'))
  await ensureField('character_sheets', timestampField('updated_at'))

  await ensureCollection('character_sheet_inventory', {
    icon: 'backpack',
    note: 'Inventory rows attached to character sheets'
  })

  await ensureField('character_sheet_inventory', integerField('sheet_id', {
    required: true,
    note: 'Linked character_sheets.id'
  }))
  await ensureField('character_sheet_inventory', integerField('item_entity_id', {
    note: 'Optional linked item entity id'
  }))
  await ensureField('character_sheet_inventory', stringField('name', {
    required: true,
    width: 'full'
  }))
  await ensureField('character_sheet_inventory', integerField('quantity', {
    defaultValue: 1
  }))
  await ensureField('character_sheet_inventory', booleanField('equipped', {
    defaultValue: false
  }))
  await ensureField('character_sheet_inventory', booleanField('attuned', {
    defaultValue: false
  }))
  await ensureField('character_sheet_inventory', stringField('container'))
  await ensureField('character_sheet_inventory', textField('notes'))
  await ensureField('character_sheet_inventory', integerField('sort', {
    defaultValue: 100
  }))
  await ensureField('character_sheet_inventory', jsonField('data'))
  await ensureField('character_sheet_inventory', timestampField('created_at'))
  await ensureField('character_sheet_inventory', timestampField('updated_at'))

  console.log('Done creating/verifying character sheet schema.')
}

createCharacterSheetsSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
