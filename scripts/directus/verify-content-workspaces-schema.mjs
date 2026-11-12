// Read-only verification of the Content Workspaces schema on a real
// Directus instance. Writes nothing. Exits nonzero on any problem.
//
// Checks three separate things, because a collection existing proves
// none of them:
//   1. every spec field exists with its UNIQUE / NOT NULL constraints;
//   2. the configured token can read items (item access is a separate
//      Directus concern from schema access);
//   3. an unauthenticated request is refused (default-deny).
//
// It cannot prove write access without writing; the first workspace
// created through the application is that check.

import {
  BINDING_MODE_FIELDS,
  CONTENT_WORKSPACE_COLLECTIONS
} from './lib/content-workspace-schema-spec.mjs'
import { createDirectusClient, findSchemaProblems, resolveDirectusConfig } from './lib/schema-helpers.mjs'

const config = resolveDirectusConfig()

if (!config.token) {
  console.error('Missing Directus token for schema verification.')
  process.exit(1)
}

const dx = createDirectusClient(config)

async function verify() {
  const problems = []

  for (const spec of [...CONTENT_WORKSPACE_COLLECTIONS, BINDING_MODE_FIELDS]) {
    problems.push(...await findSchemaProblems(dx, spec))
  }

  for (const spec of CONTENT_WORKSPACE_COLLECTIONS) {
    try {
      await dx(`/items/${spec.collection}?limit=1&fields=id`)
    } catch (error) {
      problems.push(`${spec.collection}: the configured token cannot read items (${error.message})`)
    }

    try {
      await dx(`/items/${spec.collection}?limit=1&fields=id`, { anonymous: true })
      problems.push(`${spec.collection}: readable WITHOUT authentication -- remove the public permission`)
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) {
        problems.push(`${spec.collection}: unexpected response to an unauthenticated read (${error.message})`)
      }
    }
  }

  const filter = encodeURIComponent(JSON.stringify({ binding_mode: { _neq: 'pinned' } }))
  const nonPinned = await dx(`/items/${BINDING_MODE_FIELDS.collection}?filter=${filter}&fields=id&limit=-1`)
  const count = Array.isArray(nonPinned?.data) ? nonPinned.data.length : 0
  console.log(`Bindings not in 'pinned' mode: ${count}`)

  if (problems.length) {
    console.error('Content Workspaces schema verification FAILED:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }

  console.log('Content Workspaces schema verified: constraints present, items readable, unauthenticated access refused.')
}

verify().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
