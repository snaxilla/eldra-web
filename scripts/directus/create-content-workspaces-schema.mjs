// Provisions the Content Workspaces collections -- Content Workspaces &
// Studio Phase 1. The schema itself is declared in
// lib/content-workspace-schema-spec.mjs; this script only applies it.
//
// Idempotent and additive: creates what is missing, alters nothing that
// exists, and touches no existing collection. Safe on every deploy via
// bootstrap.mjs. Run verify-content-workspaces-schema.mjs afterwards to
// confirm constraints and access.

import { CONTENT_WORKSPACE_COLLECTIONS } from './lib/content-workspace-schema-spec.mjs'
import { createDirectusClient, provisionCollection, resolveDirectusConfig } from './lib/schema-helpers.mjs'

const config = resolveDirectusConfig()

if (!config.token) {
  console.error('Missing Directus token for schema migration.')
  process.exit(1)
}

const dx = createDirectusClient(config)

async function createSchema() {
  for (const spec of CONTENT_WORKSPACE_COLLECTIONS) {
    await provisionCollection(dx, spec)
  }
  console.log('Content Workspaces schema is ready.')
}

createSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
