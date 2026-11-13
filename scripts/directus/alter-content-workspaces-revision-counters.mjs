// Adds the revision-counter columns -- Content Workspaces & Studio
// Phase 4/6 (content-workspace-schema-spec.mjs's ENTITY_REVISION_FIELDS /
// WORKSPACE_REVISION_FIELDS).
//
// Additive only, and idempotent exactly like
// alter-world-content-pack-bindings-binding-modes.mjs: both columns are
// NOT NULL DEFAULT 0, so Postgres fills every existing row as the column
// is added. This script verifies that rather than assuming it, the same
// way the binding-mode alter script does, and backfills explicitly if
// Postgres did not.
//
// No code reads either column until this phase's server utils ship in
// the same deployment. Running this script alone, before that code
// exists, changes nothing observable.

import {
  ENTITY_REVISION_FIELDS,
  WORKSPACE_REVISION_FIELDS
} from './lib/content-workspace-schema-spec.mjs'
import { createDirectusClient, provisionCollection, resolveDirectusConfig } from './lib/schema-helpers.mjs'

const config = resolveDirectusConfig()

if (!config.token) {
  console.error('Missing Directus token for schema migration.')
  process.exit(1)
}

const dx = createDirectusClient(config)

async function backfillMissingRevision(spec) {
  const filter = encodeURIComponent(JSON.stringify({ revision: { _null: true } }))
  const res = await dx(`/items/${spec.collection}?filter=${filter}&fields=id&limit=-1`)
  const rows = Array.isArray(res?.data) ? res.data : []

  for (const row of rows) {
    await dx(`/items/${spec.collection}/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ revision: 0 })
    })
  }
  if (rows.length) console.log(`Backfilled revision=0 on ${rows.length} existing row(s) in ${spec.collection}.`)

  const remainingRes = await dx(`/items/${spec.collection}?filter=${filter}&fields=id&limit=-1`)
  const remaining = Array.isArray(remainingRes?.data) ? remainingRes.data : []
  if (remaining.length) {
    throw new Error(`${remaining.length} row(s) in ${spec.collection} still have no revision after backfill.`)
  }
}

async function alterSchema() {
  for (const spec of [ENTITY_REVISION_FIELDS, WORKSPACE_REVISION_FIELDS]) {
    await provisionCollection(dx, spec, console.log, { createCollection: false })
    await backfillMissingRevision(spec)
  }

  console.log('Content Workspace revision counters are ready; every existing row starts at 0.')
}

alterSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
