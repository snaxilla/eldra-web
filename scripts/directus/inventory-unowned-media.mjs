// Read-only inventory of `directus_files` rows with `world_id IS NULL` --
// Pass B review follow-up, Item 2 ("Existing files" section).
//
// WHY THIS EXISTS. The Media Gallery ownership policy (`world_id` on
// `directus_files`) and the multipart field-order bug this same review
// pass fixed (server/utils/entity-factory.ts, server/utils/directus-maps.ts,
// and four server/api/**/upload*.post.ts routes -- see the Pass B handoff's
// own "Multipart audit matrix") mean some files uploaded AFTER the
// ownership policy shipped may still have `world_id: null`, not because
// they are genuinely ownerless but because the upload that created them
// silently dropped the field. This script finds candidates for operator
// review. It NEVER assigns ownership itself.
//
// WHAT THIS DOES NOT DO, ON PURPOSE.
//   - It never writes anything -- there is no apply/confirm mode in this
//     file at all, unlike the schema-provisioning scripts in this
//     directory. A separate, explicit, human-reviewed mapping (a second
//     script, written and run only when an operator has actually decided
//     file X belongs to World Y) is the correct next step if ownership
//     needs to be assigned -- never inferred here and auto-applied.
//   - It never broadens Media Gallery visibility. It only reads
//     `directus_files` and a few back-reference collections and prints a
//     report; it does not change any file's visibility/policy.
//   - It does not run against production from this task. Point
//     DIRECTUS_URL at whichever instance the operator is reviewing; this
//     script itself places no restriction on that (unlike this
//     directory's disposable-only scripts), because reading
//     `directus_files`/referencing collections is exactly the kind of
//     read-only operational inspection an operator needs to run against
//     the real instance to do this review at all -- but no session in
//     this project has run it against production, and doing so remains
//     an operator action, not an automated one.
//
// EVIDENCE, NOT ASSIGNMENT. For each unowned file, this cross-references
// a handful of known "a File id lives here, and that row has its own
// World" locations: `entities.image`, `maps.image`/`image_file`,
// `map_pins.image`, `world_page_presentations.background_file_id` (keyed
// by `world_key`). A file referenced from exactly one World is reported
// as "single candidate" evidence; referenced from several, or not
// referenced at all (e.g. a genuinely platform-only asset, or an orphaned
// upload), is reported as such -- the operator decides, this script only
// shows what it found. `block_instances.data`'s own nested image shapes
// (character-sheet-inventory icons, free-form block image fields) are
// NOT scanned -- that payload has no fixed schema, so searching it
// generically risks false "evidence" from an unrelated JSON key that
// happens to match a file id string. Left as a documented gap, not a
// silent one.

const DIRECTUS_URL = (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN || process.env.NUXT_DIRECTUS_TOKEN || process.env.NITRO_DIRECTUS_TOKEN || ''

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error('DIRECTUS_URL and DIRECTUS_TOKEN are required (read-only -- point these at whichever instance you are reviewing).')
  process.exit(1)
}

async function dx(p) {
  const res = await fetch(`${DIRECTUS_URL}${p}`, { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } })
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status}: ${await res.text()}`)
  return (await res.json())?.data ?? []
}

console.log(`Inventorying unowned media against: ${DIRECTUS_URL}  (READ-ONLY -- nothing will be written)\n`)

// `directus_files` is a Directus SYSTEM collection -- read via `/files`,
// never `/items/directus_files` (that path is rejected outright; system
// collections have their own top-level endpoints).
const unowned = await dx('/files?filter[world_id][_null]=true&limit=-1&fields=id,filename_download,uploaded_by,created_on,filesize,type')
console.log(`${unowned.length} file(s) with world_id IS NULL.\n`)

if (!unowned.length) {
  console.log('Nothing to review.')
  process.exit(0)
}

const [entities, maps, pins, pages] = await Promise.all([
  dx('/items/entities?filter[image][_nnull]=true&limit=-1&fields=id,world_id,image'),
  dx('/items/maps?limit=-1&fields=id,world,image,image_file').catch(() => []),
  dx('/items/map_pins?filter[image][_nnull]=true&limit=-1&fields=id,world_id,image').catch(() => []),
  dx('/items/world_page_presentations?filter[background_file_id][_nnull]=true&limit=-1&fields=id,world_key,background_file_id').catch(() => [])
])

const evidenceByFileId = new Map()
function addEvidence(fileId, worldId, source) {
  if (!fileId || worldId === undefined || worldId === null) return
  const key = String(fileId)
  const list = evidenceByFileId.get(key) ?? []
  list.push({ worldId: String(worldId), source })
  evidenceByFileId.set(key, list)
}

for (const row of entities) addEvidence(row.image, row.world_id, `entities.id=${row.id}`)
for (const row of maps) {
  addEvidence(row.image, row.world, `maps.id=${row.id}.image`)
  addEvidence(row.image_file, row.world, `maps.id=${row.id}.image_file`)
}
for (const row of pins) addEvidence(row.image, row.world_id, `map_pins.id=${row.id}`)
for (const row of pages) addEvidence(row.background_file_id, row.world_key, `world_page_presentations.id=${row.id}`)

let singleCandidate = 0
let conflicting = 0
let noEvidence = 0

for (const file of unowned) {
  const evidence = evidenceByFileId.get(String(file.id)) ?? []
  const distinctWorlds = [...new Set(evidence.map((e) => e.worldId))]

  console.log(`- ${file.id}  (${file.filename_download || '(no filename)'}, ${file.filesize ?? '?'} bytes, uploaded_by=${file.uploaded_by || '(none)'}, ${file.created_on || '(no date)'})`)
  if (distinctWorlds.length === 1) {
    singleCandidate++
    console.log(`    SINGLE CANDIDATE: World ${distinctWorlds[0]} (${evidence.map((e) => e.source).join(', ')})`)
  } else if (distinctWorlds.length > 1) {
    conflicting++
    console.log(`    CONFLICTING EVIDENCE across Worlds ${distinctWorlds.join(', ')} -- do not auto-assign; review each reference by hand (${evidence.map((e) => e.source).join(', ')})`)
  } else {
    noEvidence++
    console.log('    no evidence found -- may be a genuinely platform-only asset, or an orphaned upload with no surviving reference')
  }
}

console.log(`\n${singleCandidate} single-candidate, ${conflicting} conflicting, ${noEvidence} with no evidence. Nothing was written.`)
console.log('If ownership should be assigned, do so with a separate, explicit, reviewed mapping -- never by re-running this script with different flags.')
