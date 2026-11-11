// Media Gallery World-scope backfill -- Content Workspaces & Studio
// Phase 0 follow-up, now with an explicit, owner-approved Solaris legacy
// assignment mode.
//
// WHY THIS EXISTS: Phase 0's Media Gallery fix (server/api/worlds/[id]/
// media.get.ts) now filters by `directus_files.world_id`. Every file
// uploaded BEFORE that field existed has `world_id = null`, so deploying
// the Phase 0 code as-is would make every pre-existing Media Gallery file
// disappear from every World's gallery -- not exposed to the wrong World,
// just invisible everywhere, since `null` never matches an `_eq`
// comparison.
//
// THREE MUTUALLY EXCLUSIVE RUN MODES (only one may be used per run):
//
// 1. Evidence-based backfill (the default -- no mode flag). Parses the
//    one verified legacy marker (backfill-media-world-scope-core.mjs's
//    own header has the full verification), optionally layered with an
//    admin-authored `--mapping` file for files the marker can't resolve.
//    Never guesses; a file with no marker and no mapping entry stays
//    unassigned.
//
//      pnpm run media:scope:backfill
//      pnpm run media:scope:backfill -- --apply
//      pnpm run media:scope:backfill -- --mapping ./media-world-mapping.json [--apply]
//
// 2. Explicit Solaris legacy assignment (`--assign-unowned-images-to-
//    world <worldId>`). The owner-approved migration policy: assign
//    EVERY remaining unassigned image file to the given World,
//    regardless of whether it has a legacy marker, a malformed one, or
//    one naming some OTHER World -- historical description content is
//    DELIBERATELY IGNORED in this mode (see
//    backfill-media-world-scope-core.mjs's own header). Mutually
//    exclusive with `--mapping` -- combining "assign everything
//    unassigned" with "use this specific mapping" has no well-defined
//    precedence, so the combination is a hard CLI error, never silently
//    resolved one way or the other. Apply in this mode additionally
//    requires `--acknowledge-maintenance-window` -- see MODE 2's SAFETY
//    MECHANICS below for exactly why.
//
//      pnpm run media:scope:backfill -- --assign-unowned-images-to-world 4
//      pnpm run media:scope:backfill -- --assign-unowned-images-to-world 4 --apply --acknowledge-maintenance-window
//
// 3. World name resolution (`--resolve-world <name>`). A standalone
//    lookup -- "verify Solaris's actual World ID using an EXACT lookup,
//    never a hardcoded assumption" (Solaris has previously been World 4,
//    but that is never trusted here). Prints the resolved id and name;
//    performs no file scan and no write. Rejects a missing OR an
//    ambiguous (more than one) match. Cannot be combined with either
//    other mode -- run it first, standalone, then pass the id it prints
//    to `--assign-unowned-images-to-world`.
//
//      pnpm run media:scope:backfill -- --resolve-world Solaris
//
// ORCHESTRATION ONLY -- every classification/validation decision is made
// by backfill-media-world-scope-core.mjs's pure functions.
//
// TESTABILITY: `main()` takes argv/config explicitly and RETURNS a result
// rather than calling `process.exit` itself -- the only place this module
// touches the real process is the bottom `import.meta.url` guard, which
// never runs when this file is `import`-ed (by a test) rather than
// executed directly, matching packages-sync.mjs's own established
// convention.
//
// MODE 2's SAFETY MECHANICS -- REVIEWED AND CORRECTED. An earlier version
// of this script claimed that a Directus bulk `PATCH /files?filter=...`
// (filtered on BOTH `id` AND `world_id IS NULL` in the same request)
// provided atomic compare-and-set protection. That claim was WRONG and
// has been retracted -- see the verification below -- and the apply path
// now implements the honest, non-atomic-but-bounded alternative the
// owner's own review required.
//
// WHAT WAS VERIFIED (this task's own review, not assumed):
//   - The REQUEST SHAPE is real and documented: Directus's official REST
//     API docs (directus.com/docs/api/items) list `filter` as a supported
//     query parameter on `PATCH /items/{collection}` ("Select items in
//     collection by given conditions"), and `/files` is the same
//     items-style endpoint for the `directus_files` collection. So the
//     filtered-PATCH request this script sends is not a fabricated or
//     guessed shape.
//   - Production access was explicitly out of scope for this review (no
//     disposable Directus instance exists in this environment -- only
//     the project's real, Dokploy-managed production instance -- and
//     reading even its container's own filesystem was correctly refused
//     as a production access), so atomicity could not be confirmed by
//     exercising the live service.
//   - Directus's own publicly available server source (checked via a
//     public mirror of directus/directus, since the live instance could
//     not be inspected) shows `updateByQuery` -- the internal
//     implementation behind a filtered PATCH -- as TWO SEPARATE STEPS:
//     first a read resolves which primary keys currently match the
//     filter, THEN a second `updateMany` call writes those specific
//     keys. This is NOT a single atomic `UPDATE ... WHERE` SQL
//     statement at the database layer -- a row's `world_id` could change
//     between those two internal steps, and the second step would still
//     apply the write to that now-stale key.
//
// CONCLUSION: this script does NOT claim race-safe atomicity from the
// filtered PATCH, and never did have it proven. The actual safety model
// is now operational, bounded, and verified after the fact, not
// transactional:
//   1. MAINTENANCE WINDOW, EXPLICITLY ACKNOWLEDGED -- apply in this mode
//      REQUIRES `--acknowledge-maintenance-window`, a deliberate
//      admin confirmation that no concurrent uploads, ownership edits,
//      or other backfill processes are running for the duration of the
//      apply. Omitting the flag refuses to write anything.
//   2. RE-READ IMMEDIATELY BEFORE WRITING -- a fresh `GET` on the exact
//      file, checked for `world_id` still being null, right before that
//      file's write. This narrows the race window to the time between
//      this read and the write; it does not eliminate it, and this
//      script does not claim it does.
//   3. FILTERED PATCH, KEPT AS A BEST-EFFORT SECOND LAYER -- the same
//      `id` + `world_id IS NULL` filter from before is still sent; it
//      costs nothing and still catches some concurrent writes, but is no
//      longer the thing this script relies on for correctness.
//   4. VERIFY AFTER WRITING -- a second fresh `GET` after the write,
//      comparing the stored `world_id` against what was just requested.
//      A mismatch is reported as its own distinct outcome
//      (`verification-mismatch`) and counted as a failure (nonzero exit),
//      never silently trusted.
//   5. FIXED INVENTORY + PAGINATION (unchanged) -- the full candidate
//      list is still fetched ONCE via explicit `limit`+`offset`
//      pagination (never a bare `limit=-1`), before any write happens.
//   6. IDEMPOTENT (unchanged) -- every run re-fetches current state; an
//      already-assigned file always classifies `already-assigned` (dry
//      run) or is caught by step 2's re-read (apply) and skipped.
//
// No direct-Postgres mutation path and no transaction framework were
// introduced to close this gap -- the brief for this review explicitly
// ruled both out, and the operational mitigation above is the documented,
// bounded alternative.
//
// MODE 1's BATCHING is unchanged from the original follow-up: one PATCH
// per file, sequential, each wrapped in its own try/catch -- every file
// gets a DIFFERENT world_id there, so a same-payload bulk update does not
// apply the way it does in Mode 2, where every assignment shares the same
// target World. Mode 1 never claimed filtered-PATCH atomicity in the
// first place, so it is unaffected by this correction.

import { readFileSync } from 'node:fs'
import {
  buildExplicitAssignmentReport,
  buildMappingAssignments,
  buildReport,
  classifyFile,
  classifyForExplicitAssignment,
  resolveWorldByExactName,
  validateMapping
} from './backfill-media-world-scope-core.mjs'

export function resolveConfig() {
  return {
    url: process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || 'https://directus.theledouxs.com',
    token:
      process.env.DIRECTUS_SCHEMA_TOKEN ||
      process.env.DIRECTUS_TOKEN ||
      process.env.NUXT_DIRECTUS_TOKEN ||
      process.env.NITRO_DIRECTUS_TOKEN ||
      ''
  }
}

async function dx(config, path, options = {}) {
  const res = await fetch(`${config.url.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
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
    // Directus error bodies are structural (codes/messages), never
    // credentials -- safe to surface verbatim, matching every other
    // schema script's own error handling.
    const message = typeof json === 'string' ? json : JSON.stringify(json)
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status} ${res.statusText}: ${message}`)
  }

  return json
}

export function parseArgs(argv) {
  const args = {
    apply: false,
    mapping: null,
    assignUnownedToWorld: null,
    resolveWorldName: null,
    acknowledgeMaintenanceWindow: false
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') {
      args.apply = true
    } else if (arg === '--mapping') {
      args.mapping = argv[++i] || null
    } else if (arg === '--assign-unowned-images-to-world') {
      args.assignUnownedToWorld = argv[++i] || null
    } else if (arg === '--resolve-world') {
      args.resolveWorldName = argv[++i] || null
    } else if (arg === '--acknowledge-maintenance-window') {
      args.acknowledgeMaintenanceWindow = true
    }
  }
  return args
}

// Mode exclusivity -- "combining them could create ambiguous precedence"
// (the brief's own words). Checked once, before any Directus call, so an
// invalid combination never does partial work first.
function assertExclusiveMode(args) {
  const activeModes = [
    args.resolveWorldName ? '--resolve-world' : null,
    args.assignUnownedToWorld ? '--assign-unowned-images-to-world' : null,
    args.mapping ? '--mapping' : null
  ].filter(Boolean)

  if (args.resolveWorldName && (args.assignUnownedToWorld || args.mapping)) {
    throw new Error(
      `--resolve-world is a standalone lookup and cannot be combined with ${activeModes.filter((m) => m !== '--resolve-world').join(' or ')}. ` +
      'Run it by itself first, then pass the id it prints to --assign-unowned-images-to-world.'
    )
  }

  if (args.assignUnownedToWorld && args.mapping) {
    throw new Error(
      '--assign-unowned-images-to-world cannot be combined with --mapping -- these are two different, mutually exclusive run modes ' +
      '(explicit owner-approved "assign everything unassigned" vs. evidence-based inference with manual overrides), ' +
      'and combining them has no well-defined precedence. Run them separately.'
    )
  }
}

async function assertWorldIdFieldExists(config) {
  const res = await dx(config, '/fields/directus_files')
  const names = new Set((Array.isArray(res?.data) ? res.data : []).map((row) => String(row?.field || '').trim()))

  if (!names.has('world_id')) {
    throw new Error(
      "directus_files.world_id does not exist on this Directus instance. " +
      "Run 'pnpm run directus:create-media-world-scope' (or 'pnpm run directus:bootstrap') " +
      'before running this script -- see the deployment order in ' +
      '.github/docs/architecture/content-workspaces-and-studio.md.'
    )
  }
}

async function fetchWorldIds(config) {
  const res = await dx(config, '/items/worlds?limit=-1&fields=id')
  return new Set((Array.isArray(res?.data) ? res.data : []).map((row) => String(row.id)))
}

async function fetchWorldsWithNames(config) {
  const res = await dx(config, '/items/worlds?limit=-1&fields=id,name')
  return (Array.isArray(res?.data) ? res.data : []).map((row) => ({ id: String(row.id), name: String(row.name ?? '') }))
}

// Fetches EVERY image file, not only `world_id: null` ones -- a manual
// mapping entry must be checkable against an already-assigned file too
// (so "cannot overwrite a non-null world_id" is a real, reportable
// classification, not a silent gap), and the report is more useful when
// it can also show what's already correctly scoped. Mode 1 only; its
// real-world file count has never needed explicit pagination so far, but
// see fetchUnassignedImageFilesPaginated below for Mode 2's stricter
// requirement.
async function fetchAllImageFiles(config) {
  const filter = encodeURIComponent(JSON.stringify({ type: { _starts_with: 'image/' } }))
  const fields = encodeURIComponent('id,title,filename_download,filename_disk,description,world_id')
  const res = await dx(config, `/files?limit=-1&filter=${filter}&fields=${fields}`)
  return Array.isArray(res?.data) ? res.data : []
}

// Mode 2's candidate fetch -- EXPLICIT `limit`+`offset` pagination, never
// a bare `limit=-1`, so a real production file count can never be
// silently truncated to "whatever Directus's default page happened to
// be." Collects the FULL result into one in-memory array before
// returning -- this IS the "fixed candidate inventory captured at run
// start" the apply loop then works from, never re-queried mid-run.
export async function fetchUnassignedImageFilesPaginated(config, pageSize = 200) {
  const all = []
  let offset = 0

  while (true) {
    const filter = encodeURIComponent(JSON.stringify({
      type: { _starts_with: 'image/' },
      world_id: { _null: true }
    }))
    const fields = encodeURIComponent('id,title,filename_download,filename_disk,description,world_id')
    const res = await dx(config, `/files?filter=${filter}&fields=${fields}&limit=${pageSize}&offset=${offset}&sort=id`)
    const page = Array.isArray(res?.data) ? res.data : []
    all.push(...page)

    if (page.length < pageSize) break
    offset += pageSize
  }

  return all
}

// A single fresh read of one file's CURRENT `world_id`, used both as the
// pre-write check and the post-write verification below. Returns `null`
// when the field is null/absent, otherwise the value as a string.
export async function readFileWorldId(config, fileId) {
  const res = await dx(config, `/files/${encodeURIComponent(fileId)}?fields=id,world_id`)
  const data = res && typeof res === 'object' ? res.data : null
  if (!data || typeof data !== 'object') return null
  const worldId = data.world_id
  return worldId === null || worldId === undefined ? null : String(worldId)
}

// Mode 2's write, with the verified, non-atomic-but-bounded safety model
// from this file's own header: re-read immediately before writing, skip
// if no longer unassigned; write via the filtered PATCH (kept as a
// best-effort second layer, not relied on alone); re-read again after
// writing to verify the value actually stuck. Returns one of three
// outcomes -- never silently assumes success.
export async function assignFileWithVerification(config, fileId, targetWorldId) {
  const currentWorldId = await readFileWorldId(config, fileId)
  if (currentWorldId !== null) {
    return { status: 'skipped-already-assigned', worldId: currentWorldId }
  }

  const filter = encodeURIComponent(JSON.stringify({
    _and: [
      { id: { _eq: fileId } },
      { world_id: { _null: true } }
    ]
  }))

  await dx(config, `/files?filter=${filter}`, {
    method: 'PATCH',
    body: JSON.stringify({ world_id: Number(targetWorldId) })
  })

  const verifiedWorldId = await readFileWorldId(config, fileId)
  if (verifiedWorldId !== String(targetWorldId)) {
    return { status: 'verification-mismatch', expected: String(targetWorldId), actual: verifiedWorldId }
  }

  return { status: 'assigned', worldId: verifiedWorldId }
}

function fileLabel(file) {
  return file.title || file.filename_download || file.filename_disk || '(untitled)'
}

function printGroup(log, title, items, fileById) {
  if (!items.length) return
  log(`\n${title} (${items.length})`)
  for (const item of items) {
    const file = fileById.get(item.fileId)
    const label = file ? fileLabel(file) : '(file not loaded)'
    const target = item.worldId ? ` -> World ${item.worldId}` : ''
    log(`  [${item.fileId}] ${label}${target} -- ${item.reason}`)
  }
}

// Mode 3 -- standalone World name resolution. Never writes anything.
async function runResolveWorld(name, config, log) {
  const worlds = await fetchWorldsWithNames(config)
  const resolved = resolveWorldByExactName(worlds, name)

  if (!resolved.ok) {
    throw new Error(resolved.reason)
  }

  log(`Resolved World '${name}' -> id ${resolved.world.id} (${resolved.world.name})`)
  return { mode: 'resolve-world', world: resolved.world, applied: false, failures: [] }
}

// Mode 2 -- explicit, owner-approved legacy assignment to one target
// World (e.g. Solaris). See this file's own header for the full,
// verified safety model: fixed inventory, pagination, an EXPLICITLY
// ACKNOWLEDGED maintenance window, a re-read-before-write check, and a
// read-back verification after every write. This does NOT claim
// race-safe atomicity -- see the header for why that claim was retracted.
async function runExplicitAssignment(targetWorldId, apply, acknowledgeMaintenanceWindow, config, log, logError) {
  const worldIds = await fetchWorldIds(config)
  if (!worldIds.has(String(targetWorldId))) {
    throw new Error(`Target World '${targetWorldId}' does not exist.`)
  }

  const files = await fetchUnassignedImageFilesPaginated(config)
  const classifications = files.map((file) => classifyForExplicitAssignment(file))
  const report = buildExplicitAssignmentReport(classifications, targetWorldId)
  const fileById = new Map(files.map((file) => [String(file.id), file]))

  log(`Explicit legacy assignment -- target World ${report.targetWorldId} -- ${apply ? 'APPLY' : 'DRY RUN'}`)
  log(`Candidate inventory captured at run start: ${report.summary.total} unassigned image file(s) (non-image files excluded by the query itself).`)
  log(`Safely assignable: ${report.summary.safe}`)
  log(`Already assigned (skipped, never overwritten): ${report.summary.alreadyAssigned}`)

  printGroup(log, 'Safely assignable', report.safe, fileById)

  if (!apply) {
    log('\nDry run -- zero writes performed. Re-run with --apply --acknowledge-maintenance-window to assign the files above.')
    return { mode: 'assign-unowned', applied: false, report, succeeded: 0, skippedConcurrent: 0, verificationMismatches: 0, failures: [] }
  }

  // Apply in this mode is NOT a proven atomic compare-and-set (see this
  // file's own header) -- it is only safe when nothing else can change
  // `world_id` on these files for the duration of the run. Refusing to
  // write without an explicit, deliberate acknowledgment of that
  // condition is the point of this flag, not a formality.
  if (!acknowledgeMaintenanceWindow) {
    throw new Error(
      'Applying the explicit Solaris-style legacy assignment requires --acknowledge-maintenance-window. ' +
      "This mode's write is not a proven atomic compare-and-set (see this script's own header) -- it is only " +
      'safe when no concurrent uploads, ownership edits, or other backfill processes can run for the duration ' +
      'of this apply. Confirm that condition is true for this deployment, then re-run with ' +
      '--apply --acknowledge-maintenance-window.'
    )
  }

  if (!report.safe.length) {
    log('\nNothing to apply -- no unassigned image files. Zero writes performed.')
    return { mode: 'assign-unowned', applied: true, report, succeeded: 0, skippedConcurrent: 0, verificationMismatches: 0, failures: [] }
  }

  log(`\nApplying ${report.safe.length} assignment(s) to World ${report.targetWorldId} (maintenance window acknowledged)...`)

  let succeeded = 0
  let skippedConcurrent = 0
  let verificationMismatches = 0
  const failures = []

  for (const item of report.safe) {
    try {
      const result = await assignFileWithVerification(config, item.fileId, targetWorldId)

      if (result.status === 'assigned') {
        succeeded++
        log(`  Assigned [${item.fileId}] -> World ${targetWorldId} (read back and verified)`)
      } else if (result.status === 'skipped-already-assigned') {
        skippedConcurrent++
        log(`  Skipped [${item.fileId}] -- already assigned to World ${result.worldId} by the time this file was reached`)
      } else {
        verificationMismatches++
        failures.push({
          fileId: item.fileId,
          error: `verification mismatch: expected World ${result.expected}, read back World ${result.actual ?? '(null)'}`
        })
        logError(`  MISMATCH [${item.fileId}]: expected World ${result.expected}, read back World ${result.actual ?? '(null)'}`)
      }
    } catch (error) {
      failures.push({ fileId: item.fileId, error: error?.message || String(error) })
      logError(`  FAILED [${item.fileId}]: ${error?.message || error}`)
    }
  }

  log(
    `\nApply complete: ${succeeded} assigned (verified), ${skippedConcurrent} skipped (already assigned), ` +
    `${verificationMismatches} verification mismatch(es), ${failures.length} failed overall, ` +
    `out of ${report.safe.length} candidate(s).`
  )

  return { mode: 'assign-unowned', applied: true, report, succeeded, skippedConcurrent, verificationMismatches, failures }
}

// Mode 1 -- the original evidence-based backfill, unchanged.
async function runEvidenceBasedBackfill(args, config, log, logError) {
  const [worldIds, files] = await Promise.all([fetchWorldIds(config), fetchAllImageFiles(config)])
  const fileIds = new Set(files.map((file) => String(file.id)))
  const fileById = new Map(files.map((file) => [String(file.id), file]))

  let mappingEntries = []
  if (args.mapping) {
    const raw = readFileSync(args.mapping, 'utf8')
    mappingEntries = JSON.parse(raw)
  }

  const mappingIssues = validateMapping(mappingEntries, { fileIds, worldIds })
  const mapping = buildMappingAssignments(mappingEntries, { fileIds, worldIds })

  const classifications = files.map((file) => classifyFile(file, { worldIds, mapping }))
  const report = buildReport(classifications, mappingIssues)

  log(`Media Gallery World-scope backfill -- ${args.apply ? 'APPLY' : 'DRY RUN'}`)
  log(`Scanned ${report.summary.total} image file(s) across the instance.`)

  printGroup(log, 'Safely assignable', report.byStatus.safe, fileById)
  printGroup(log, 'Already assigned (skipped, never overwritten)', report.byStatus['already-assigned'], fileById)
  printGroup(log, 'Missing legacy metadata (no marker, no mapping entry)', report.byStatus['missing-metadata'], fileById)
  printGroup(log, 'Malformed legacy metadata (needs manual review)', report.byStatus['malformed-metadata'], fileById)
  printGroup(log, 'Referenced World does not exist', report.byStatus['world-not-found'], fileById)
  printGroup(log, 'Conflict between legacy description and mapping file', report.byStatus.conflict, fileById)

  if (mappingIssues.length) {
    log(`\nMapping file issues (${mappingIssues.length})`)
    for (const issue of mappingIssues) {
      const where = issue.fileId ? `[${issue.fileId}]` : ''
      log(`  ${where} ${issue.status} -- ${issue.reason}`)
    }
  }

  log(
    `\nSummary: ${report.summary.safe} safe, ${report.summary.alreadyAssigned} already assigned, ` +
    `${report.summary.missingMetadata} missing metadata, ${report.summary.malformedMetadata} malformed, ` +
    `${report.summary.worldNotFound} unknown World, ${report.summary.conflict} conflicting, ` +
    `${report.summary.mappingIssues} mapping issue(s).`
  )

  if (!args.apply) {
    log('\nDry run -- zero writes performed. Re-run with --apply to write the safe assignments above.')
    return { mode: 'evidence-based', applied: false, report, succeeded: 0, failures: [] }
  }

  const safe = report.byStatus.safe
  if (!safe.length) {
    log('\nNothing to apply -- no safely assignable files. Zero writes performed.')
    return { mode: 'evidence-based', applied: true, report, succeeded: 0, failures: [] }
  }

  log(`\nApplying ${safe.length} safe assignment(s)...`)

  let succeeded = 0
  const failures = []

  for (const item of safe) {
    try {
      await dx(config, `/files/${encodeURIComponent(item.fileId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ world_id: Number(item.worldId) })
      })
      succeeded++
      log(`  Assigned [${item.fileId}] -> World ${item.worldId} (${item.source})`)
    } catch (error) {
      failures.push({ fileId: item.fileId, worldId: item.worldId, error: error?.message || String(error) })
      logError(`  FAILED [${item.fileId}] -> World ${item.worldId}: ${error?.message || error}`)
    }
  }

  log(`\nApply complete: ${succeeded}/${safe.length} assignment(s) written, ${failures.length} failed.`)

  return { mode: 'evidence-based', applied: true, report, succeeded, failures }
}

// The one function this module exists to run. Throws for fatal
// configuration/schema/argument problems (missing token, missing
// `world_id` field, incompatible mode flags) -- never calls
// `process.exit` itself. Returns a plain result describing what
// happened, so the caller (a test, or this file's own bottom block)
// decides what the real process's exit behavior should be.
export async function main(argv = process.argv.slice(2), config = resolveConfig(), log = console.log, logError = console.error) {
  if (!config.token) {
    throw new Error('Missing Directus token (DIRECTUS_TOKEN or DIRECTUS_SCHEMA_TOKEN).')
  }

  await assertWorldIdFieldExists(config)

  const args = parseArgs(argv)
  assertExclusiveMode(args)

  if (args.resolveWorldName) {
    return await runResolveWorld(args.resolveWorldName, config, log)
  }

  if (args.assignUnownedToWorld) {
    return await runExplicitAssignment(
      args.assignUnownedToWorld,
      args.apply,
      args.acknowledgeMaintenanceWindow,
      config,
      log,
      logError
    )
  }

  return await runEvidenceBasedBackfill(args, config, log, logError)
}

// Only runs when this file is executed directly (`node
// backfill-media-world-scope.mjs`), never when `import`-ed -- same guard
// packages-sync.mjs already uses, for the same reason: a test importing
// this module for its exports must never trigger a real Directus run.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((result) => {
      if (result.failures && result.failures.length) {
        process.exitCode = 1
      }
    })
    .catch((error) => {
      console.error(error?.message || String(error))
      process.exit(1)
    })
}
