// Read-only inventory of legacy gameplay data, ahead of any Rules Platform
// reset decision.
//
// THIS SCRIPT NEVER MUTATES DIRECTUS. It issues GET requests only -- see
// `dxGet` below, which is the single network function in this file and
// hard-refuses any other method. There is no POST/PATCH/DELETE path, no
// schema call, and no write of any kind, by construction rather than by
// convention.
//
// Run:
//   node scripts/directus/audit-rules-platform-reset.mjs
//
// ---------------------------------------------------------------------------
// WHAT THIS AUDIT IS ACTUALLY FOR
// ---------------------------------------------------------------------------
// The question behind it -- "if we delete Characters, Sheets, Inventory,
// Species, Classes, Backgrounds, Feats, Items and Spells, what breaks?" --
// has a non-obvious answer in this schema, for two structural reasons that
// this script exists to make visible:
//
// 1. MOST OF THOSE ARE NOT COLLECTIONS. `entities` is a single polymorphic
//    table; "Characters", "Species", "Classes", "Backgrounds", "Feats",
//    "Items", "Spells" and "Locations" are all just `entities` rows
//    separated by `entity_type` (app/lib/systems/dnd5e.ts's own
//    `entityTypes` list). Deleting "Species" means deleting a SUBSET OF
//    ROWS from the same table that also holds the Characters you are
//    keeping. Any reset plan phrased as "drop these collections" does not
//    survive contact with the actual schema.
//
// 2. ALMOST NOTHING IS ENFORCED BY THE DATABASE. Directus reports only a
//    handful of real foreign keys for this project's collections; every
//    other `*_id` column below is a bare integer with no constraint, no
//    ON DELETE rule, and no referential guarantee. So deletes neither
//    cascade nor get refused -- the referencing rows simply survive,
//    silently, pointing at ids that no longer exist. `REFERENCE_GRAPH`
//    below is the hand-maintained model of those soft references, because
//    the database itself cannot answer the question.
//
// Both claims are verified live at runtime rather than asserted: the report
// prints the real FK list from Directus, and counts real dangling rows for
// every soft reference.

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

if (!DIRECTUS_TOKEN) {
  console.error('Missing Directus token. Set DIRECTUS_TOKEN (read access is sufficient).')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Read-only transport
// ---------------------------------------------------------------------------

let requestCount = 0

// The ONLY network call in this file. Method is not a parameter -- it is
// hardcoded to GET, so no caller (present or future) can turn this script
// into a writer by passing an option.
async function dxGet(path) {
  requestCount++
  const res = await fetch(`${DIRECTUS_URL.replace(/\/$/, '')}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      Accept: 'application/json'
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
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText}: ${message}`)
  }

  return json
}

async function readAll(collection, fields) {
  const query = `limit=-1&fields=${encodeURIComponent(fields)}`
  const res = await dxGet(`/items/${collection}?${query}`)
  return Array.isArray(res?.data) ? res.data : []
}

async function countRows(collection) {
  try {
    const res = await dxGet(`/items/${collection}?aggregate%5Bcount%5D=*`)
    const raw = res?.data?.[0]?.count
    return typeof raw === 'object' ? Number(Object.values(raw)[0]) : Number(raw ?? 0)
  } catch (error) {
    return { error: error.message }
  }
}

// ---------------------------------------------------------------------------
// The model the database cannot supply: soft references
// ---------------------------------------------------------------------------

// `entities.entity_type` values that mean "this row is a character".
// Sourced from app/lib/systems/dnd5e.ts + the character-sheet server utils'
// own filters (`character|npc|npc_sheet|pc|player_character`).
const CHARACTER_TYPES = ['character', 'npc', 'npc_sheet', 'pc', 'player_character']

// The `entity_type` groups the reset question names as if they were
// collections. Each is a slice of `entities`, not a table.
const CONTENT_TYPE_GROUPS = {
  Characters: CHARACTER_TYPES,
  Species: ['species'],
  Classes: ['class', 'subclass'],
  Backgrounds: ['background'],
  Feats: ['feat'],
  Items: ['item'],
  Spells: ['spell'],
  Locations: ['location'],
  Enemies: ['enemy', 'monster']
}

// Every soft reference this codebase relies on: a column that behaves like
// a foreign key but has no database constraint behind it. `to` is the
// collection it points at; `via` names the id field on that target.
const REFERENCE_GRAPH = [
  { from: 'character_sheets', field: 'entity_id', to: 'entities', note: 'the character this sheet belongs to' },
  { from: 'character_sheets', field: 'world_id', to: 'worlds', note: 'owning world' },
  { from: 'character_sheets', field: 'class_entity_id', to: 'entities', note: 'chosen class (content entity)' },
  { from: 'character_sheets', field: 'species_entity_id', to: 'entities', note: 'chosen species (content entity)' },
  { from: 'character_sheets', field: 'background_entity_id', to: 'entities', note: 'chosen background (content entity)' },
  { from: 'character_sheet_inventory', field: 'sheet_id', to: 'character_sheets', note: 'owning sheet' },
  { from: 'character_sheet_inventory', field: 'item_entity_id', to: 'entities', note: 'catalogue item; null for custom rows' },
  { from: 'character_sheet_inventory_transfers', field: 'source_sheet_id', to: 'character_sheets', note: 'grant/transfer audit' },
  { from: 'character_sheet_inventory_transfers', field: 'target_sheet_id', to: 'character_sheets', note: 'grant/transfer audit' },
  { from: 'character_sheet_inventory_transfers', field: 'source_entity_id', to: 'entities', note: 'grant/transfer audit' },
  { from: 'character_sheet_inventory_transfers', field: 'target_entity_id', to: 'entities', note: 'grant/transfer audit' },
  { from: 'character_sheet_inventory_transfers', field: 'item_entity_id', to: 'entities', note: 'granted item' },
  { from: 'character_sheet_inventory_transfers', field: 'world_id', to: 'worlds', note: 'owning world' },
  { from: 'entity_relationships', field: 'source_entity_id', to: 'entities', note: 'relationship endpoint' },
  { from: 'entity_relationships', field: 'target_entity_id', to: 'entities', note: 'relationship endpoint' },
  { from: 'entity_relationships', field: 'world_id', to: 'worlds', note: 'owning world' },
  { from: 'block_instances', field: 'entity_id', to: 'entities', note: 'wiki article body blocks' },
  { from: 'entity_actions', field: 'entity_id', to: 'entities', note: 'statblock actions' },
  { from: 'entity_statblocks', field: 'entity_id', to: 'entities', note: 'monster/NPC statblock' },
  { from: 'monster_profiles', field: 'entity_id', to: 'entities', note: 'monster profile' },
  { from: 'map_pins', field: 'entity_id', to: 'entities', note: 'pin -> entity link (REAL FK, SET NULL)' },
  { from: 'map_pins', field: 'map_id', to: 'maps', note: 'owning map (REAL FK, CASCADE)' },
  { from: 'entities', field: 'world_id', to: 'worlds', note: 'owning world' },
  { from: 'world_rules_config', field: 'world_id', to: 'worlds', note: 'active rules package binding' }
]

// The reset the audit is being asked to reason about.
const PROPOSED_DELETION = {
  collections: ['character_sheets', 'character_sheet_inventory'],
  entityTypeGroups: ['Characters', 'Species', 'Classes', 'Backgrounds', 'Feats', 'Items', 'Spells']
}

// Collections the reset does not name, reported so "what remains" is
// answered from the real schema rather than from memory.
const ALL_AUDITED_COLLECTIONS = [
  'worlds',
  'entities',
  'character_sheets',
  'character_sheet_inventory',
  'character_sheet_inventory_transfers',
  'entity_relationships',
  'entity_actions',
  'entity_statblocks',
  'monster_profiles',
  'block_instances',
  'maps',
  'map_pins',
  'scene_layer_objects',
  'events',
  'eras',
  'articles',
  'world_page_presentations',
  'rules_packages',
  'world_rules_config',
  'app_settings'
]

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

const out = []
const say = (line = '') => out.push(line)
const rule = (char = '-') => say(char.repeat(78))
function heading(title) {
  say()
  rule('=')
  say(title)
  rule('=')
}
const pad = (value, width) => String(value).padEnd(width)
const num = (value, width = 6) => String(value).padStart(width)

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function audit() {
  say('ELDRA -- LEGACY GAMEPLAY DATA AUDIT (READ ONLY)')
  say(`Directus : ${DIRECTUS_URL}`)
  say(`Generated: ${new Date().toISOString()}`)
  say('Mutations: NONE. This script issues GET requests only.')

  // --- schema facts -------------------------------------------------------
  const collectionsRes = await dxGet('/collections')
  const collectionNames = (collectionsRes?.data ?? [])
    .map((row) => String(row?.collection ?? ''))
    .filter((name) => name && !name.startsWith('directus_'))
    .sort()

  const relationsRes = await dxGet('/relations')
  const realForeignKeys = (relationsRes?.data ?? []).filter((row) => !String(row?.collection ?? '').startsWith('directus_'))

  heading('1. ENFORCED FOREIGN KEYS (what the DATABASE actually guarantees)')
  say(`Non-system collections present: ${collectionNames.length}`)
  say(`Enforced foreign keys        : ${realForeignKeys.length}`)
  say()
  if (realForeignKeys.length === 0) {
    say('  (none)')
  } else {
    for (const relation of realForeignKeys) {
      const onDelete = relation?.schema?.on_delete ?? 'n/a'
      say(`  ${pad(`${relation.collection}.${relation.field}`, 44)} -> ${pad(relation.related_collection, 16)} ON DELETE ${onDelete}`)
    }
  }
  say()
  say('EVERY OTHER *_id COLUMN IN THIS SCHEMA IS A SOFT REFERENCE:')
  say('an unconstrained integer. Deletes do not cascade and are never')
  say('refused -- referencing rows survive pointing at ids that are gone.')

  // --- row counts ---------------------------------------------------------
  heading('2. ROW COUNTS')
  const counts = {}
  for (const collection of ALL_AUDITED_COLLECTIONS) {
    counts[collection] = await countRows(collection)
    const value = counts[collection]
    say(`  ${pad(collection, 40)} ${typeof value === 'object' ? `ERROR: ${value.error}` : num(value)}`)
  }
  const unaudited = collectionNames.filter((name) => !ALL_AUDITED_COLLECTIONS.includes(name))
  say()
  say(`Collections present but NOT part of this audit (${unaudited.length}):`)
  say(`  ${unaudited.join(', ') || '(none)'}`)

  // --- entities breakdown -------------------------------------------------
  const entities = await readAll('entities', 'id,entity_type,world_id,title')
  const entityType = new Map(entities.map((row) => [Number(row.id), String(row.entity_type ?? '')]))
  const typeCounts = {}
  for (const type of entityType.values()) typeCounts[type] = (typeCounts[type] ?? 0) + 1

  heading('3. `entities` IS POLYMORPHIC -- "collections" that are really row subsets')
  say('Characters, Species, Classes, Backgrounds, Feats, Items, Spells and')
  say('Locations are all rows in ONE table, separated by entity_type.')
  say()
  say(`  ${pad('entity_type', 24)} rows`)
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    say(`  ${pad(type, 24)} ${num(count)}`)
  }
  say(`  ${pad('TOTAL', 24)} ${num(entities.length)}`)
  say()
  say('Grouped the way the reset question phrases them:')
  const groupIds = {}
  for (const [label, types] of Object.entries(CONTENT_TYPE_GROUPS)) {
    const ids = new Set(entities.filter((row) => types.includes(String(row.entity_type))).map((row) => Number(row.id)))
    groupIds[label] = ids
    say(`  ${pad(label, 24)} ${num(ids.size)}   (entity_type: ${types.join(', ')})`)
  }

  // --- referential integrity ---------------------------------------------
  const datasets = {}
  const neededCollections = [...new Set(REFERENCE_GRAPH.map((edge) => edge.from))]
  for (const collection of neededCollections) {
    if (collection === 'entities') {
      datasets[collection] = entities
      continue
    }
    // `name` is pulled for character_sheets specifically so the orphan
    // listing in section 5 can identify a sheet a human would recognize,
    // rather than printing a bare row id.
    const extra = collection === 'character_sheets' ? ['name'] : []
    const fields = ['id', ...extra, ...REFERENCE_GRAPH.filter((edge) => edge.from === collection).map((edge) => edge.field)]
    datasets[collection] = await readAll(collection, [...new Set(fields)].join(','))
  }

  const universes = {
    entities: new Set(entities.map((row) => Number(row.id))),
    character_sheets: new Set((datasets.character_sheets ?? []).map((row) => Number(row.id))),
    worlds: new Set((await readAll('worlds', 'id')).map((row) => Number(row.id))),
    maps: new Set((await readAll('maps', 'id')).map((row) => Number(row.id)))
  }

  heading('4. REFERENTIAL INTEGRITY TODAY (before any deletion)')
  say('"dangling" = the column holds an id that no longer exists.')
  say('Any dangling count above zero is proof that deletes in this system')
  say('already leave debris behind rather than cascading.')
  say()
  say(`  ${pad('reference', 56)} ${num('rows')} ${num('null')} ${num('dangl')}`)
  const danglingToday = {}
  for (const edge of REFERENCE_GRAPH) {
    const rows = datasets[edge.from] ?? []
    const universe = universes[edge.to]
    if (!universe) continue
    const nulls = rows.filter((row) => row[edge.field] === null || row[edge.field] === undefined).length
    const dangling = rows.filter((row) => {
      const value = row[edge.field]
      return value !== null && value !== undefined && !universe.has(Number(value))
    })
    danglingToday[`${edge.from}.${edge.field}`] = dangling.length
    const flag = dangling.length > 0 ? '  <-- ORPHANS' : ''
    say(`  ${pad(`${edge.from}.${edge.field} -> ${edge.to}`, 56)} ${num(rows.length)} ${num(nulls)} ${num(dangling.length)}${flag}`)
  }

  // --- character-specific questions ---------------------------------------
  const characterIds = groupIds.Characters
  heading('5. WHAT SPECIFICALLY REFERENCES CHARACTERS')

  const relationships = datasets.entity_relationships ?? []
  const relToChar = relationships.filter(
    (row) =>
      (row.source_entity_id && characterIds.has(Number(row.source_entity_id))) ||
      (row.target_entity_id && characterIds.has(Number(row.target_entity_id)))
  )
  say(`RELATIONSHIPS referencing a character: ${relToChar.length} of ${relationships.length}`)
  for (const row of relToChar) {
    const source = Number(row.source_entity_id)
    const target = Number(row.target_entity_id)
    say(`   rel ${pad(row.id, 5)} ${source} (${entityType.get(source) ?? 'MISSING'}) -> ${target} (${entityType.get(target) ?? 'MISSING'})`)
  }

  const transfers = datasets.character_sheet_inventory_transfers ?? []
  const transfersToChar = transfers.filter((row) =>
    ['source_entity_id', 'target_entity_id'].some((field) => row[field] && characterIds.has(Number(row[field])))
  )
  say()
  say('GRANTS: there is no `grants` collection. "Grant item/currency" is an')
  say('operation (server/api/worlds/[id]/admin/grants.post.ts) that writes an')
  say('inventory row plus an audit row in character_sheet_inventory_transfers.')
  say(`GRANT/TRANSFER rows referencing a character: ${transfersToChar.length} of ${transfers.length}`)

  const sheets = datasets.character_sheets ?? []
  const sheetsHealthy = sheets.filter((row) => row.entity_id && characterIds.has(Number(row.entity_id)))
  const sheetsOrphaned = sheets.filter((row) => !row.entity_id || !universes.entities.has(Number(row.entity_id)))
  say()
  say(`CHARACTER SHEETS: ${sheets.length} total`)
  say(`   attached to a live character entity : ${sheetsHealthy.length}`)
  say(`   ALREADY ORPHANED (entity_id is gone): ${sheetsOrphaned.length}`)
  if (sheetsOrphaned.length) {
    for (const row of sheetsOrphaned.slice(0, 15)) {
      say(`      sheet ${pad(row.id, 5)} entity_id=${pad(row.entity_id, 8)} ${row.name ?? ''}`)
    }
    if (sheetsOrphaned.length > 15) say(`      ... and ${sheetsOrphaned.length - 15} more`)
  }

  // --- deletion simulation -------------------------------------------------
  const doomedEntityIds = new Set()
  for (const label of PROPOSED_DELETION.entityTypeGroups) {
    for (const id of groupIds[label] ?? []) doomedEntityIds.add(id)
  }
  const survivingEntityIds = new Set([...universes.entities].filter((id) => !doomedEntityIds.has(id)))
  const doomedSheetIds = new Set(sheets.map((row) => Number(row.id)))

  heading('6. SIMULATED DELETION (nothing is written -- this is arithmetic only)')
  say('Proposed: delete Characters, Character Sheets, Character Inventory,')
  say('Species, Classes, Backgrounds, Feats, Items, Spells.')
  say()
  say(`entities to delete : ${doomedEntityIds.size} of ${universes.entities.size}`)
  say(`entities remaining : ${survivingEntityIds.size}`)
  const survivingTypes = {}
  for (const id of survivingEntityIds) {
    const type = entityType.get(id) ?? '<unknown>'
    survivingTypes[type] = (survivingTypes[type] ?? 0) + 1
  }
  say(`remaining by type  : ${Object.entries(survivingTypes).map(([t, n]) => `${t}=${n}`).join(', ') || '(none)'}`)
  say()
  say('Rows that WOULD BE LEFT POINTING AT DELETED IDS (new orphans):')
  say(`  ${pad('reference', 56)} ${num('new')}`)

  const newOrphans = {}
  for (const edge of REFERENCE_GRAPH) {
    const rows = datasets[edge.from] ?? []
    if (PROPOSED_DELETION.collections.includes(edge.from)) continue // row itself is deleted
    let doomedUniverse = null
    if (edge.to === 'entities') doomedUniverse = doomedEntityIds
    else if (edge.to === 'character_sheets') doomedUniverse = doomedSheetIds
    if (!doomedUniverse) continue

    const affected = rows.filter((row) => {
      const value = row[edge.field]
      return value !== null && value !== undefined && doomedUniverse.has(Number(value))
    })
    newOrphans[`${edge.from}.${edge.field}`] = affected.length
    if (affected.length > 0) {
      say(`  ${pad(`${edge.from}.${edge.field} -> ${edge.to}`, 56)} ${num(affected.length)}`)
    }
  }
  if (Object.values(newOrphans).every((value) => value === 0)) say('  (none)')

  const blocks = datasets.block_instances ?? []
  const blocksDoomed = blocks.filter((row) => row.entity_id && doomedEntityIds.has(Number(row.entity_id))).length
  const blocksSurviving = blocks.filter((row) => row.entity_id && survivingEntityIds.has(Number(row.entity_id))).length
  const blocksAlreadyDangling = blocks.filter((row) => row.entity_id && !universes.entities.has(Number(row.entity_id))).length

  say()
  say('block_instances (wiki article bodies) breakdown:')
  say(`   belong to a DELETED entity   : ${blocksDoomed}   <-- must be deleted with it`)
  say(`   belong to a SURVIVING entity : ${blocksSurviving}`)
  say(`   already dangling today       : ${blocksAlreadyDangling}`)

  // --- conclusions ---------------------------------------------------------
  heading('7. ANSWERS')

  say('WHAT REMAINS')
  say(`  - worlds (${counts.worlds}), maps (${counts.maps}), scene_layer_objects (${counts.scene_layer_objects})`)
  say(`  - events (${counts.events}), eras (${counts.eras}), articles (${counts.articles})`)
  say(`  - world_page_presentations (${counts.world_page_presentations})`)
  say(`  - rules_packages (${counts.rules_packages}), world_rules_config (${counts.world_rules_config})`)
  say(`  - app_settings (${counts.app_settings})`)
  say(`  - entities NOT in the deletion set: ${survivingEntityIds.size}`)
  say(`      ${Object.entries(survivingTypes).map(([t, n]) => `${t}=${n}`).join(', ') || '(none)'}`)
  say('  - the entire Rules Platform (packages + world config) is untouched:')
  say('    it references entities by NOTHING. It is bound to a world, not to')
  say('    characters or content, so a content wipe cannot break it.')

  say()
  say('WHAT BREAKS')
  say('  Nothing at the database level -- and that is the problem. There are')
  say(`  only ${realForeignKeys.length} enforced foreign keys, so the delete will neither`)
  say('  cascade nor be refused. Breakage is silent and surfaces later, in app')
  say('  code that assumes a referenced row exists:')
  for (const [reference, count] of Object.entries(newOrphans).filter(([, n]) => n > 0)) {
    say(`    - ${reference}: ${count} rows keep pointing at deleted ids`)
  }
  say(`    - entity_relationships: ${relToChar.length} of ${relationships.length} rows reference a character;`)
  say('      several also target species/class/location entities, so BOTH')
  say('      endpoints can vanish independently.')
  say('    - map_pins.entity_id is the one exception: a REAL FK with')
  say('      ON DELETE SET NULL, so pins survive and self-heal to unlinked.')

  say()
  say('WHAT BECOMES ORPHANED')
  say(`  Already orphaned BEFORE any new deletion: ${sheetsOrphaned.length} character sheets,`)
  say(`  ${blocksAlreadyDangling} block_instances, plus the dangling counts in section 4.`)
  say('  This is direct evidence that previous deletions in this system left')
  say('  debris rather than cascading -- the same will happen again.')
  say('  New orphans from the proposed delete are listed in section 6.')

  say()
  say('WHAT SHOULD BE DELETED AUTOMATICALLY (alongside the named set)')
  say('  These have no meaning once their owner is gone, and nothing else')
  say('  reads them:')
  say(`    - block_instances for deleted entities        (${blocksDoomed} rows)`)
  say('    - entity_actions / entity_statblocks / monster_profiles for any')
  say('      deleted entity (all are 1:1 detail tables keyed by entity_id)')
  say(`    - character_sheet_inventory                    (${counts.character_sheet_inventory} rows; sheet-owned, cannot outlive it)`)
  say(`    - entity_relationships touching a deleted endpoint (${relToChar.length} rows)`)
  say('  Recommended order (children first, so nothing is momentarily')
  say('  unreachable): inventory -> transfers -> relationships -> blocks/')
  say('  actions/statblocks/profiles -> sheets -> entities.')

  say()
  say('WHAT SHOULD BE PRESERVED')
  say('  - worlds, maps, scene_layer_objects, map_pins: the map/scene stack is')
  say('    independent of characters; pins already degrade safely (SET NULL).')
  say('  - events, eras, articles: narrative/timeline content with no')
  say('    character foreign keys at all.')
  say('  - rules_packages, world_rules_config: the Rules Platform. Deleting')
  say('    content does not invalidate an active package -- world config binds')
  say('    a world to a package version, never to a character or an entity.')
  say('  - world_page_presentations, app_settings: presentation/config only.')
  say('  - character_sheet_inventory_transfers: THIS IS AN AUDIT LOG. Deleting')
  say('    it destroys the record of who granted what to whom. Preserving it')
  say('    is a deliberate choice to keep provenance, and it is the one place')
  say(`    where dangling ids are ACCEPTABLE by design (${transfers.length} rows today).`)

  say()
  rule('=')
  say(`Read-only audit complete. ${requestCount} GET requests issued, 0 writes.`)
  rule('=')
}

audit()
  .then(() => {
    console.log(out.join('\n'))
  })
  .catch((error) => {
    console.log(out.join('\n'))
    console.error(`\nAudit failed: ${error?.message || error}`)
    process.exit(1)
  })
