// Adds the binding-mode columns to world_content_pack_bindings -- Content
// Workspaces & Studio Phase 1 (content-workspaces-and-studio.md §6.7).
//
// Additive only. Every existing binding is a pinned binding, and
// `binding_mode` is NOT NULL DEFAULT 'pinned', so Postgres fills it on
// existing rows as the column is added. That was verified against
// Directus 11.12.0 / Postgres 16, but this script does not rely on it:
// it counts rows left without a mode afterwards and sets them to
// 'pinned' one at a time, then fails if any remain.
//
// No code reads these columns yet. Every binding keeps resolving through
// its pinned package_version exactly as before.

import { BINDING_MODE_FIELDS } from './lib/content-workspace-schema-spec.mjs'
import { createDirectusClient, provisionCollection, resolveDirectusConfig } from './lib/schema-helpers.mjs'

const config = resolveDirectusConfig()

if (!config.token) {
  console.error('Missing Directus token for schema migration.')
  process.exit(1)
}

const dx = createDirectusClient(config)
const COLLECTION = BINDING_MODE_FIELDS.collection

async function listRowsWithoutMode() {
  const filter = encodeURIComponent(JSON.stringify({ binding_mode: { _null: true } }))
  const res = await dx(`/items/${COLLECTION}?filter=${filter}&fields=id&limit=-1`)
  return Array.isArray(res?.data) ? res.data : []
}

async function alterSchema() {
  await provisionCollection(dx, BINDING_MODE_FIELDS, console.log, { createCollection: false })

  const missing = await listRowsWithoutMode()
  for (const row of missing) {
    await dx(`/items/${COLLECTION}/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ binding_mode: 'pinned' })
    })
  }
  if (missing.length) console.log(`Backfilled binding_mode on ${missing.length} existing binding(s).`)

  const remaining = await listRowsWithoutMode()
  if (remaining.length) {
    throw new Error(`${remaining.length} binding(s) still have no binding_mode after backfill.`)
  }

  console.log('World Content Pack Bindings binding-mode columns are ready; every binding is pinned.')
}

alterSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
