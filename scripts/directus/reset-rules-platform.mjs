// Rules Platform reset -- a controlled maintenance migration, NOT a
// feature commit. See scripts/directus/audit-rules-platform-reset.mjs
// (the read-only audit this script's DELETE list, ORDER, and preserve
// list are approved directly from) for the findings that justify every
// decision below.
//
// THIS SCRIPT IS INTENTIONALLY DESTRUCTIVE. It permanently deletes the
// legacy gameplay content that predates the Rules Platform, to create a
// clean foundation for Character Sheet V2. There is no dry-run mode and
// no undo -- the audit is the dry run; this is the real thing.
//
// Run:
//   DIRECTUS_TOKEN=... node scripts/directus/reset-rules-platform.mjs --confirm
//
// Without --confirm, or without DIRECTUS_TOKEN, this script refuses to
// run and performs zero requests -- see assertPreconditions() below,
// which executes before any Directus call of any kind.
//
// ---------------------------------------------------------------------------
// WHY THIS ORDER, AND WHY IT IS "SAFE AGAINST PARTIAL EXECUTION"
// ---------------------------------------------------------------------------
// Directus's REST API has no cross-collection transaction this script can
// wrap ten sequential DELETE calls in -- so "safe against partial
// execution" cannot mean atomicity. It means two narrower, achievable
// properties instead, both load-bearing for the specific order below:
//
// 1. NO STEP EVER CREATES A NEW DANGLING REFERENCE. Every step deletes
//    ONLY rows that reference something already being removed, and every
//    such row is deleted BEFORE the thing it references. Concretely: the
//    doomed entity id set is computed ONCE, up front (`loadDoomedEntityIds`),
//    as a frozen snapshot, and every downstream step (relationships,
//    block_instances, entity_actions, entity_statblocks, monster_profiles,
//    and the final entities delete) reads from that SAME snapshot -- never
//    a fresh re-query -- so a row that referenced a doomed entity at the
//    start of the run is still recognized as doomed even after some of
//    those entities have already been deleted by the time a later step
//    runs. `entities` itself is deleted LAST, specifically so that by the
//    time any entity row disappears, every row anywhere in the schema that
//    referenced it has ALREADY been removed in an earlier step -- see the
//    audit's own section 1 finding: only 4 real foreign keys exist in this
//    schema, so the database will not enforce this ordering for us.
//
// 2. THE SCRIPT IS SAFE TO RE-RUN AFTER A FAILURE, WITH NO MANUAL CLEANUP.
//    Every step's SELECT-then-DELETE (see `deleteWhereIn`/`deleteAll`)
//    re-queries CURRENT state, not a cached list from a previous attempt.
//    If step 6 fails, steps 1-5's deletions are already committed in
//    Directus (each DELETE call is its own request) and stay deleted;
//    re-running the whole script from the top simply finds nothing left
//    to do for steps 1-5 (their queries now return zero rows) and resumes
//    real work at step 6. This is what makes the script deterministic and
//    repeatable rather than requiring the operator to track progress by
//    hand.
//
// FAIL FAST: every Directus call that returns a non-2xx throws, and
// nothing in this script catches an error to continue past it -- an
// uncaught rejection stops the process (see the bottom of this file) with
// a non-zero exit code and WITHOUT printing "Rules Platform reset
// complete.", which only ever prints after every step has actually
// succeeded.

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
    console.error('This script permanently deletes legacy gameplay data (character sheets,')
    console.error('inventory, transfers, relationships, and content/character entities).')
    console.error('Review scripts/directus/audit-rules-platform-reset.mjs\'s output first.')
    console.error()
    console.error('Re-run as:')
    console.error('  node scripts/directus/reset-rules-platform.mjs --confirm')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Read-only + delete transport. Two functions, two verbs, nothing else --
// there is no PATCH/PUT anywhere in this file, and no third way to reach
// Directus other than these two.
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
    // FAIL FAST: thrown, never caught locally -- see file header.
    throw new Error(`${method} ${path} -> ${res.status} ${res.statusText}: ${message}`)
  }

  return json
}

async function fetchIds(collection, filter) {
  const query = new URLSearchParams()
  query.set('limit', '-1')
  query.set('fields', 'id')
  if (filter) query.set('filter', JSON.stringify(filter))
  const res = await dxRequest('GET', `/items/${collection}?${query.toString()}`)
  return (Array.isArray(res?.data) ? res.data : []).map((row) => row.id)
}

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size))
  return chunks
}

const CHUNK_SIZE = 200

// Deletes exactly the ids passed in, in chunks, via Directus's bulk-delete-
// by-primary-key-array endpoint (DELETE /items/:collection with a JSON
// array body) -- never a filter-based bulk delete, so there is no path by
// which a filter mistake could delete more than the ids this script itself
// already resolved and is about to report.
async function deleteByIds(collection, ids) {
  for (const batch of chunk(ids, CHUNK_SIZE)) {
    await dxRequest('DELETE', `/items/${collection}`, batch)
  }
  return ids.length
}

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
  const result = await fn()
  return result
}

// ---------------------------------------------------------------------------
// Deletion targets
// ---------------------------------------------------------------------------

// Exactly the twelve entity_type values this task approved for deletion.
// Everything else (location, enemy, monster, and anything not listed) is
// preserved -- see PRESERVE below and the Project Knowledge Review answer
// on why locations/enemies specifically survive.
const DOOMED_ENTITY_TYPES = [
  'character',
  'npc',
  'npc_sheet',
  'pc',
  'player_character',
  'species',
  'class',
  'subclass',
  'background',
  'feat',
  'item',
  'spell'
]

// `character_sheet_inventory`, `character_sheet_inventory_transfers`, and
// `character_sheets` are deleted WHOLESALE below (unqualified in this
// task's own DELETE list -- no "belonging to deleted entities" qualifier),
// because they are 100% legacy Character Sheet V1 machinery being retired
// outright, independent of any individual entity's fate. They are not
// collected into one array/loop here because the required ORDER
// interleaves them with the entity-child steps (inventory/transfers come
// first; character_sheets comes after) -- each is handled at its own
// step, in place, below.

// Collections whose rows are deleted ONLY when they reference a doomed
// entity (this task's own "belonging to deleted entities" qualifier).
// Each is a 1:1 or many:1 detail/child table keyed by `entity_id`.
const ENTITY_CHILD_COLLECTIONS = ['block_instances', 'entity_actions', 'entity_statblocks', 'monster_profiles']

// Collections/data this script MUST NOT touch, restated here (not just in
// the header) as a literal list so a future edit to this file has
// something concrete to diff against: locations, enemies/monsters, worlds,
// maps, map_pins, scene_layer_objects, events, eras, articles,
// world_page_presentations, app_settings, rules_packages, world_rules_config.
// None of these collections appears anywhere below this comment.

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  assertPreconditions()

  console.log('RULES PLATFORM RESET -- DESTRUCTIVE, CONFIRMED')
  console.log(`Directus : ${DIRECTUS_URL}`)
  console.log(`Started  : ${new Date().toISOString()}`)

  // Snapshot the doomed entity id set ONCE. Every later step reads this
  // frozen array, never a fresh query -- see file header, safety property 1.
  const doomedEntityIds = await step('0/9 resolve doomed entity ids', async () => {
    const ids = await fetchIds('entities', { entity_type: { _in: DOOMED_ENTITY_TYPES } })
    console.log(`  entity_type in [${DOOMED_ENTITY_TYPES.join(', ')}]`)
    console.log(`  resolved ${ids.length} doomed entity ids`)
    return Object.freeze(ids)
  })

  // ORDER, verbatim: inventory -> inventory transfers -> relationships ->
  // block_instances -> entity_actions -> entity_statblocks ->
  // monster_profiles -> character_sheets -> entities.

  await step('1/9 character_sheet_inventory (wholesale)', async () => {
    const ids = await fetchIds('character_sheet_inventory')
    const deleted = await deleteByIds('character_sheet_inventory', ids)
    report('character_sheet_inventory', deleted)
  })

  await step('2/9 character_sheet_inventory_transfers (wholesale)', async () => {
    const ids = await fetchIds('character_sheet_inventory_transfers')
    const deleted = await deleteByIds('character_sheet_inventory_transfers', ids)
    report('character_sheet_inventory_transfers', deleted)
  })

  await step('3/9 entity_relationships referencing a doomed entity', async () => {
    if (doomedEntityIds.length === 0) {
      report('entity_relationships', 0)
      return
    }
    const ids = await fetchIds('entity_relationships', {
      _or: [{ source_entity_id: { _in: doomedEntityIds } }, { target_entity_id: { _in: doomedEntityIds } }]
    })
    const deleted = await deleteByIds('entity_relationships', ids)
    report('entity_relationships', deleted)
  })

  for (const [index, collection] of ENTITY_CHILD_COLLECTIONS.entries()) {
    await step(`${4 + index}/9 ${collection} belonging to a doomed entity`, async () => {
      if (doomedEntityIds.length === 0) {
        report(collection, 0)
        return
      }
      const ids = await fetchIds(collection, { entity_id: { _in: doomedEntityIds } })
      const deleted = await deleteByIds(collection, ids)
      report(collection, deleted)
    })
  }

  await step('8/9 character_sheets (wholesale)', async () => {
    const ids = await fetchIds('character_sheets')
    const deleted = await deleteByIds('character_sheets', ids)
    report('character_sheets', deleted)
  })

  await step('9/9 entities (doomed entity_type values)', async () => {
    const deleted = await deleteByIds('entities', doomedEntityIds)
    report('entities', deleted)
  })

  console.log()
  console.log(`Total rows deleted: ${runningTotal}`)
  console.log('Rules Platform reset complete.')
}

main().catch((error) => {
  console.error()
  console.error(`RESET ABORTED: ${error?.message || error}`)
  console.error('Fail-fast: no further steps were attempted.')
  console.error('Re-run the script -- already-deleted rows will not be re-processed;')
  console.error('it resumes at whichever step still has matching rows.')
  process.exit(1)
})
