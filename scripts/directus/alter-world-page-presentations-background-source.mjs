// Adds `background_source` to `world_page_presentations` -- World
// Background Defaults / Show Background pass
// (.github/docs/architecture/world-background-defaults-and-show-background.md).
//
// Nullable `string` column distinguishing a page's own intent when it
// has no stored override image:
//   'override' -- never written explicitly; always inferred from
//                  `background_file_id` being set (see
//                  resolveBackgroundSource, server/utils/world-page-
//                  presentation.ts), so an existing override keeps
//                  working whether or not this column is backfilled.
//   'inherit'  -- explicit "Use World Default" choice: show the World's
//                  own default background/mode instead of nothing.
//   'none'     -- explicit "No Background" choice: show nothing, even if
//                  a World default exists.
//
// Backfill rationale: every row that predates this column reached
// background_file_id === null the ONLY way the pre-existing UI allowed
// -- clicking "Clear" -- which meant "no background," not "inherit."
// Silently reinterpreting that as inherit the moment a World sets a
// default would change what an already-configured page shows without
// anyone touching it. Backfilling 'override'/'none' onto every existing
// row (instead of leaving it null and inferring at read time) makes the
// new 'inherit' state reachable only through a FUTURE, explicit "Use
// World Default" click -- never by inference from an old row.
//
// Additive only. No existing row's background_file_id/presentation_mode
// changes. A page with NO row at all (the common case -- most pages in
// most Worlds have never been touched) is unaffected by this script and
// is resolved as 'inherit' by server/utils/world-page-presentation.ts's
// own read-time fallback (nothing to migrate -- there is no row).
//
// DEPLOYMENT ORDER NOTE (overrides the general "deploy app, then
// migrate" checklist in CLAUDE.md for this one column): the presentation
// GET route reads this collection with `fields=*` specifically so it
// degrades safely before this script has run (an unset column just
// reads as undefined, resolved identically to "no background" -- see
// world-page-presentation.ts). But the two NEW save actions ("Use World
// Default" / "No Background") write `background_source` explicitly, and
// Directus rejects a write naming a field the collection's schema
// doesn't have. Run this script BEFORE those two actions are exposed to
// real users in production, or they will fail with a Directus error
// until it has run. Every pre-existing save path (mode toggle, picking
// an image, the legacy single "Clear" on pages that don't support
// inheritance) never touches this column at all and is unaffected
// either way.

import { createDirectusClient, provisionCollection, resolveDirectusConfig } from './lib/schema-helpers.mjs'

const config = resolveDirectusConfig()

if (!config.token) {
  console.error('Missing Directus token for schema migration.')
  process.exit(1)
}

const dx = createDirectusClient(config)
const COLLECTION = 'world_page_presentations'

const SPEC = {
  collection: COLLECTION,
  fields: [
    {
      field: 'background_source',
      type: 'string',
      maxLength: 16,
      note: "override | inherit | none. Null on rows older than this column -- backfilled below, never left to read-time inference."
    }
  ]
}

async function listRowsNeedingBackfill() {
  const filter = encodeURIComponent(JSON.stringify({ background_source: { _null: true } }))
  const res = await dx(`/items/${COLLECTION}?filter=${filter}&fields=id,background_file_id&limit=-1`)
  return Array.isArray(res?.data) ? res.data : []
}

async function alterSchema() {
  await provisionCollection(dx, SPEC, console.log, { createCollection: false })

  const rows = await listRowsNeedingBackfill()
  for (const row of rows) {
    const value = row?.background_file_id ? 'override' : 'none'
    await dx(`/items/${COLLECTION}/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ background_source: value })
    })
  }
  if (rows.length) console.log(`Backfilled background_source on ${rows.length} existing row(s).`)

  const remaining = await listRowsNeedingBackfill()
  if (remaining.length) {
    throw new Error(`${remaining.length} world_page_presentations row(s) still have no background_source after backfill.`)
  }

  console.log('world_page_presentations.background_source is ready; every existing row keeps its prior meaning.')
}

alterSchema().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
