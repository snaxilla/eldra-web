// Orphan garbage collection -- NOT a gameplay reset.
//
// Context: scripts/directus/reset-rules-platform.mjs (base reset +
// --purge-monsters) and the audit that grounds it
// (scripts/directus/audit-rules-platform-reset.mjs) both establish the
// same fact: this schema has only 4 real, database-enforced foreign keys
// (see the audit's own section 1). Every other `*_id` column, including
// `block_instances.entity_id`, `entity_actions.entity_id`,
// `entity_statblocks.entity_id`, and `monster_profiles.entity_id`, is an
// unconstrained integer -- deletes never cascade, so deleting an `entities`
// row (as both prior reset runs did, for characters/content/monsters)
// leaves these four collections' rows behind, pointing at ids that no
// longer exist. The post-purge audit confirmed this live: 109 / 19 / 19
// already-dangling `entity_actions` / `entity_statblocks` /
// `monster_profiles` rows, plus 218 already-dangling `block_instances`
// rows, none of which the reset scripts ever touch (by design -- they only
// delete rows that referenced something THEY were about to delete, not
// pre-existing debris from earlier, unrelated deletions).
//
// This script's ONLY job is deleting that debris: rows in the four
// collections above whose `entity_id` references no `entities` row, full
// stop. It does not delete `entities` rows, does not know or care what
// `entity_type` an orphan's dead reference used to point at, and does not
// touch any collection outside the four named above -- see ORPHAN
// DETECTION below and the Project Knowledge Review answers for why.
//
// Run:
//   DIRECTUS_TOKEN=... node scripts/directus/cleanup-orphaned-entities.mjs --confirm
//
// Without --confirm, or without DIRECTUS_TOKEN, this script refuses to
// run and performs zero requests -- see assertPreconditions() below, which
// executes before any Directus call of any kind. Same shape as
// reset-rules-platform.mjs's own precondition guard, deliberately kept
// identical rather than reinvented.

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

// ---------------------------------------------------------------------------
// SAFETY -- runs before any Directus call. No interactive prompt exists
// anywhere in this file; the only way to authorize deletion is the
// --confirm flag, checked here.
// ---------------------------------------------------------------------------

function assertPreconditions() {
  if (!DIRECTUS_TOKEN) {
    console.error('Refusing to run: DIRECTUS_TOKEN is not set.')
    console.error('This script performs real deletes and requires an explicit, valid token.')
    process.exit(1)
  }

  if (!process.argv.includes('--confirm')) {
    console.error('Refusing to run without --confirm.')
    console.error()
    console.error('This script permanently deletes orphaned rows (block_instances,')
    console.error('entity_actions, entity_statblocks, monster_profiles) whose entity_id')
    console.error('references no entity. It does not touch gameplay data, the Rules')
    console.error('Platform, locations, or maps.')
    console.error()
    console.error('Re-run as:')
    console.error('  node scripts/directus/cleanup-orphaned-entities.mjs --confirm')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Read-only + delete transport. Two functions, two verbs, nothing else --
// there is no PATCH/PUT anywhere in this file, and no third way to reach
// Directus other than these two. Identical shape to reset-rules-platform.mjs's
// own dxRequest, kept consistent rather than reinvented.
// ---------------------------------------------------------------------------

async function dxRequest(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
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
    // FAIL FAST: thrown, never caught locally -- an uncaught rejection
    // stops the process (see the bottom of this file) with a non-zero
    // exit code and WITHOUT printing "Orphan cleanup complete.", which
    // only ever prints after every step has actually succeeded.
    throw new Error(`${method} ${path} -> ${res.status} ${res.statusText}: ${message}`)
  }

  return json
}

// Unfiltered read: no `_in`/`_nin` filter is ever built against an id list
// in this file (unlike reset-rules-platform.mjs's fetchIdsWhereAnyFieldIn),
// so there is no equivalent of that script's HTTP 431 hazard to guard
// against on the read side -- `fields` is deliberately kept to `id` (+
// `entity_id` where relevant), keeping every GET small regardless of row
// count. Orphan detection happens in JS afterward (findOrphanedIds), not
// via a Directus filter.
async function fetchAll(collection, fields) {
  const query = new URLSearchParams()
  query.set('limit', '-1')
  query.set('fields', fields)
  const res = await dxRequest('GET', `/items/${collection}?${query.toString()}`)
  return Array.isArray(res?.data) ? res.data : []
}

export function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size))
  return chunks
}

export const CHUNK_SIZE = 200

// Deletes exactly the ids passed in, in chunks, via Directus's bulk-delete-
// by-primary-key-array endpoint (DELETE /items/:collection with a JSON
// array body). Same chunking discipline as reset-rules-platform.mjs's
// deleteByIds, exported here for direct testing since this script's own
// DELETE calls are the batching this task's SAFETY section asks for.
export async function deleteByIds(collection, ids) {
  for (const batch of chunk(ids, CHUNK_SIZE)) {
    await dxRequest('DELETE', `/items/${collection}`, batch)
  }
  return ids.length
}

// ---------------------------------------------------------------------------
// ORPHAN DETECTION
// ---------------------------------------------------------------------------
// A row is orphaned iff its `entity_id` is non-null AND does not appear in
// the CURRENT `entities` id set, resolved fresh at the start of each run
// (never cached across runs, so re-running after a partial failure simply
// re-detects whatever is still actually orphaned -- see resumability in
// the file header and the test suite).
//
// entity_type is never read from any row here -- not `entities`' own, not
// the orphan candidates'. Membership in the live id set is the entire
// test. See the Project Knowledge Review's answer on why.
export function findOrphanedIds(rows, liveEntityIds) {
  return rows
    .filter((row) => row.entity_id !== null && row.entity_id !== undefined)
    .filter((row) => !liveEntityIds.has(Number(row.entity_id)))
    .map((row) => row.id)
}

// The four collections this script is scoped to, restated here as a
// literal list (not just in the header) so a future edit has something
// concrete to diff against. Nothing else -- not `entities`, not `maps`,
// not `rules_packages`/`world_rules_config`, not `character_sheets` -- is
// read or written anywhere below this comment.
const ORPHAN_CHECK_COLLECTIONS = ['block_instances', 'entity_actions', 'entity_statblocks', 'monster_profiles']

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

let runningTotal = 0

function report(collection, deletedCount) {
  runningTotal += deletedCount
  console.log(`  ${collection.padEnd(40)} deleted=${String(deletedCount).padStart(6)}   running total=${runningTotal}`)
}

async function step(label, fn) {
  console.log(`\n[${label}]`)
  return fn()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Exported (in addition to being invoked below via the entry-point guard)
// so tests/scripts/directus/cleanup-orphaned-entities.test.ts can exercise
// the full orchestration against a mocked `fetch` -- importing this does
// not run it; only the guard at the bottom of this file does that, and
// only when the file is executed directly.
export async function main() {
  assertPreconditions()

  const totalSteps = ORPHAN_CHECK_COLLECTIONS.length

  console.log('ORPHAN CLEANUP -- DESTRUCTIVE, CONFIRMED')
  console.log(`Directus : ${DIRECTUS_URL}`)
  console.log(`Started  : ${new Date().toISOString()}`)

  const liveEntityIds = await step(`0/${totalSteps} resolve live entity ids`, async () => {
    const rows = await fetchAll('entities', 'id')
    const ids = new Set(rows.map((row) => Number(row.id)))
    console.log(`  ${ids.size} live entities`)
    return ids
  })

  for (const [index, collection] of ORPHAN_CHECK_COLLECTIONS.entries()) {
    await step(`${index + 1}/${totalSteps} ${collection} orphaned rows (entity_id references no entity)`, async () => {
      const rows = await fetchAll(collection, 'id,entity_id')
      const orphanedIds = findOrphanedIds(rows, liveEntityIds)
      const deleted = await deleteByIds(collection, orphanedIds)
      report(collection, deleted)
    })
  }

  console.log()
  console.log(`Total rows deleted: ${runningTotal}`)
  console.log('Orphan cleanup complete.')
}

// Guarded so this module can be imported (e.g. by
// tests/scripts/directus/cleanup-orphaned-entities.test.ts) without
// triggering a real, destructive run as a side effect of the import
// itself. Running the file directly
// (`node cleanup-orphaned-entities.mjs --confirm`) is unaffected -- this
// condition is true in exactly that case. Same precedent as
// reset-rules-platform.mjs / publish-starter-package.mjs.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error()
    console.error(`ORPHAN CLEANUP ABORTED: ${error?.message || error}`)
    console.error('Fail-fast: no further steps were attempted.')
    console.error('Re-run the script -- already-deleted rows will not be re-processed;')
    console.error('it resumes by re-detecting whatever is still actually orphaned.')
    process.exit(1)
  })
}
