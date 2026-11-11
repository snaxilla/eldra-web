// Pure parsing/planning logic behind backfill-media-world-scope.mjs --
// Content Workspaces & Studio Phase 0, Media Gallery World-scope
// follow-up. Same split packages-sync-core.mjs/packages-sync.mjs already
// establish: no Directus I/O lives here, every function takes
// already-fetched data as plain arguments and returns a plain result, so
// this is directly unit-testable without a network call.
//
// ---------------------------------------------------------------------------
// THE VERIFIED LEGACY FORMAT (do not change without re-verifying against
// the real upload route)
// ---------------------------------------------------------------------------
// `server/api/worlds/[id]/media/upload.post.ts` has written EXACTLY this
// description on every upload, unchanged across its entire git history
// (cf5b8d0 "Add world media gallery" through the current Phase 0 pass):
//
//   `Eldra media upload for world ${worldId}`
//
// where `worldId` is `cleanText(getRouterParam(event, 'id'))` -- the raw
// numeric World id from the route, e.g. "Eldra media upload for world 6".
// This is the ONLY historical Media Gallery upload route and the ONLY
// place this exact string has ever been written -- confirmed by
// `git log --oneline --follow` on that file (3 commits total, same
// description literal in all three) and by checking every OTHER route
// that also writes to the shared `directus_files` collection
// (server/api/admin/upload-setting-image.post.ts,
// server/api/map-pins/upload-image.post.ts,
// server/api/worlds/[id]/maps/upload.post.ts,
// server/api/worlds/[id]/presentation/upload-background.post.ts,
// server/api/entities/[id]/blocks/[blockKey]/upload-image.post.ts) --
// none of them sets `description` at all. Their files were still visible
// through the (pre-Phase-0, unscoped) Media Gallery listing, since it
// filtered only on `type: image/*`, but they carry no parseable World
// marker of any kind and MUST classify as `missing-metadata`, never
// guessed from filename, folder, title, uploader, or any other field --
// this task's own explicit prohibition.
//
// The regex below requires an EXACT, whole-string match (after trimming)
// -- never a substring match anywhere inside a longer, human-authored
// description. A description that merely CONTAINS this phrase alongside
// other text is deliberately NOT treated as a safe match (see
// classifyFile's `malformed-metadata` branch below) -- it is evidence
// someone or something touched the marker, not proof of which World.
const LEGACY_WORLD_MARKER_EXACT = /^Eldra media upload for world (\d+)$/
const LEGACY_WORLD_MARKER_PREFIX = /eldra media upload for world/i

// Returns the matched World id (as a string, e.g. "6") for an EXACT
// legacy marker, or `null` for anything else -- including an empty/
// missing description, a description that merely resembles the marker,
// or one with a non-numeric/garbled World id. Exported standalone so a
// caller (or a test) can distinguish "parses cleanly" from "classifies
// as malformed," without re-deriving the regex.
export function parseLegacyWorldMarker(description) {
  if (typeof description !== 'string') return null
  const trimmed = description.trim()
  if (!trimmed) return null
  const match = LEGACY_WORLD_MARKER_EXACT.exec(trimmed)
  return match ? match[1] : null
}

// True when a description looks like a DAMAGED/incomplete attempt at the
// legacy marker (contains the phrase but didn't parse cleanly) -- the
// `malformed-metadata` category, distinct from "no marker at all."
function looksLikeDamagedLegacyMarker(description) {
  if (typeof description !== 'string') return false
  const trimmed = description.trim()
  if (!trimmed) return false
  return LEGACY_WORLD_MARKER_PREFIX.test(trimmed) && !LEGACY_WORLD_MARKER_EXACT.test(trimmed)
}

// `file`: { id, title?, filename?, description?, world_id }
// `worldIds`: Set<string> of every real worlds.id, as strings
// `mapping`: Map<fileId, worldId> of ALREADY-VALIDATED manual overrides
//   (see buildMappingAssignments below -- an invalid/duplicate/unknown
//   mapping entry is never present here; it is reported separately).
//
// Returns exactly one of the six required classifications. Never mutates
// `file`. Never infers from anything but `file.description`'s exact
// legacy marker and an already-validated `mapping` entry.
export function classifyFile(file, { worldIds, mapping = new Map() } = {}) {
  const fileId = String(file?.id ?? '')
  const description = file?.description ?? null

  if (file?.world_id !== null && file?.world_id !== undefined && file?.world_id !== '') {
    return {
      fileId,
      status: 'already-assigned',
      worldId: String(file.world_id),
      reason: 'world_id is already set; never overwritten'
    }
  }

  const inferredWorldId = parseLegacyWorldMarker(description)
  const mappedWorldId = mapping.has(fileId) ? mapping.get(fileId) : null

  if (inferredWorldId && mappedWorldId && inferredWorldId !== mappedWorldId) {
    return {
      fileId,
      status: 'conflict',
      reason: `Legacy description infers World ${inferredWorldId}, but the mapping file assigns World ${mappedWorldId} -- resolve the conflict manually, nothing is assigned automatically`
    }
  }

  const candidateWorldId = inferredWorldId || mappedWorldId
  const source = inferredWorldId ? 'legacy-description' : mappedWorldId ? 'mapping' : null

  if (!candidateWorldId) {
    if (looksLikeDamagedLegacyMarker(description)) {
      return {
        fileId,
        status: 'malformed-metadata',
        reason: `description resembles the legacy marker but did not parse exactly: ${JSON.stringify(description)}`
      }
    }

    return {
      fileId,
      status: 'missing-metadata',
      reason: 'no legacy description marker and no mapping entry'
    }
  }

  if (!worldIds.has(candidateWorldId)) {
    return {
      fileId,
      status: 'world-not-found',
      worldId: candidateWorldId,
      source,
      reason: `World ${candidateWorldId} does not exist`
    }
  }

  return {
    fileId,
    status: 'safe',
    worldId: candidateWorldId,
    source,
    reason: source === 'legacy-description'
      ? 'parsed from the exact legacy upload description'
      : 'provided by the manual mapping file'
  }
}

// ---------------------------------------------------------------------------
// Manual mapping file validation (Part 3) -- structural issues with the
// MAPPING ITSELF, independent of any one file's classification above.
// ---------------------------------------------------------------------------

// `entries`: the raw, untrusted JSON array read from --mapping.
// `fileIds`: Set<string> of every real directus_files id this run saw.
// `worldIds`: Set<string> of every real worlds.id.
//
// Returns a flat list of issues -- never throws, so a malformed mapping
// file degrades to "every entry reported, nothing assigned," never a
// crash.
export function validateMapping(entries, { fileIds, worldIds }) {
  const issues = []

  if (!Array.isArray(entries)) {
    issues.push({ status: 'invalid-mapping-file', reason: 'Mapping file must contain a JSON array of { fileId, worldId } objects' })
    return issues
  }

  const seenFileIds = new Map() // fileId -> count

  for (const entry of entries) {
    const fileId = entry && typeof entry === 'object' ? String(entry.fileId ?? '').trim() : ''
    const worldId = entry && typeof entry === 'object' ? String(entry.worldId ?? '').trim() : ''

    if (!fileId || !worldId) {
      issues.push({ entry, status: 'invalid-entry', reason: 'Each mapping entry requires a non-empty fileId and worldId' })
      continue
    }

    seenFileIds.set(fileId, (seenFileIds.get(fileId) ?? 0) + 1)

    if (!fileIds.has(fileId)) {
      issues.push({ fileId, worldId, status: 'unknown-file', reason: `No Directus file with id '${fileId}' was found` })
      continue
    }

    if (!worldIds.has(worldId)) {
      issues.push({ fileId, worldId, status: 'invalid-world', reason: `World '${worldId}' does not exist` })
    }
  }

  for (const [fileId, count] of seenFileIds) {
    if (count > 1) {
      issues.push({ fileId, status: 'duplicate-mapping-entry', reason: `fileId '${fileId}' appears ${count} times in the mapping file -- none of its entries are used` })
    }
  }

  return issues
}

// Builds the Map<fileId, worldId> classifyFile actually consults --
// EXCLUDING anything validateMapping flagged (duplicates, unknown files,
// invalid Worlds, malformed entries). A duplicate fileId is excluded
// entirely (never "picks the first/last one") -- it is reported by
// validateMapping, not silently resolved here.
export function buildMappingAssignments(entries, { fileIds, worldIds }) {
  const map = new Map()
  if (!Array.isArray(entries)) return map

  const seen = new Set()
  const duplicates = new Set()

  for (const entry of entries) {
    const fileId = entry && typeof entry === 'object' ? String(entry.fileId ?? '').trim() : ''
    if (!fileId) continue
    if (seen.has(fileId)) duplicates.add(fileId)
    seen.add(fileId)
  }

  for (const entry of entries) {
    const fileId = entry && typeof entry === 'object' ? String(entry.fileId ?? '').trim() : ''
    const worldId = entry && typeof entry === 'object' ? String(entry.worldId ?? '').trim() : ''
    if (!fileId || !worldId) continue
    if (duplicates.has(fileId)) continue
    if (!fileIds.has(fileId) || !worldIds.has(worldId)) continue
    map.set(fileId, worldId)
  }

  return map
}

// ---------------------------------------------------------------------------
// Report assembly -- pure grouping, no I/O, no console output (the CLI
// entry point owns printing).
// ---------------------------------------------------------------------------

const STATUS_ORDER = ['safe', 'already-assigned', 'missing-metadata', 'malformed-metadata', 'world-not-found', 'conflict']

export function buildReport(classifications, mappingIssues = []) {
  const byStatus = Object.fromEntries(STATUS_ORDER.map((status) => [status, []]))

  for (const item of classifications) {
    ;(byStatus[item.status] ?? (byStatus[item.status] = [])).push(item)
  }

  return {
    byStatus,
    mappingIssues,
    summary: {
      total: classifications.length,
      safe: byStatus.safe.length,
      alreadyAssigned: byStatus['already-assigned'].length,
      missingMetadata: byStatus['missing-metadata'].length,
      malformedMetadata: byStatus['malformed-metadata'].length,
      worldNotFound: byStatus['world-not-found'].length,
      conflict: byStatus.conflict.length,
      mappingIssues: mappingIssues.length
    }
  }
}

// ---------------------------------------------------------------------------
// Explicit, owner-approved Solaris legacy assignment -- a SEPARATE,
// mutually exclusive run mode from the evidence-based one above. The
// owner explicitly accepted "assign every unassigned image to Solaris,
// including images that never carried any parseable marker at all, and
// regardless of what any historical description says" as a deliberate
// MIGRATION POLICY DECISION, not an inference -- so this mode's
// classification is deliberately much simpler than classifyFile's: no
// description parsing, no malformed/missing distinction, no mapping. A
// historical description naming some OTHER World is explicitly NOT
// consulted here (explicit policy override) -- the only thing checked is
// whether `world_id` is still null right now.
// ---------------------------------------------------------------------------

// `file`: { id, world_id }. Every image file with `world_id: null` is a
// candidate, full stop; an already-assigned file is always skipped
// (never overwritten) -- the one rule this mode shares with the
// evidence-based one.
export function classifyForExplicitAssignment(file) {
  const fileId = String(file?.id ?? '')

  if (file?.world_id !== null && file?.world_id !== undefined && file?.world_id !== '') {
    return {
      fileId,
      status: 'already-assigned',
      worldId: String(file.world_id),
      reason: 'world_id is already set; never overwritten'
    }
  }

  return {
    fileId,
    status: 'safe',
    reason: 'explicit owner-approved legacy assignment -- historical description content, if any, is deliberately ignored by this mode'
  }
}

export function buildExplicitAssignmentReport(classifications, targetWorldId) {
  const safe = classifications.filter((item) => item.status === 'safe')
  const alreadyAssigned = classifications.filter((item) => item.status === 'already-assigned')

  return {
    targetWorldId: String(targetWorldId),
    safe,
    alreadyAssigned,
    summary: {
      total: classifications.length,
      safe: safe.length,
      alreadyAssigned: alreadyAssigned.length
    }
  }
}

// Exact-name World lookup -- "Resolve/verify the target and print its ID
// and name" (never hardcode a previously-known id, e.g. Solaris having
// once been World 4). `worlds`: [{ id, name }]. Rejects both a missing
// match and an ambiguous (more than one) match -- never guesses which one
// was meant.
export function resolveWorldByExactName(worlds, name) {
  const target = String(name ?? '').trim()
  const matches = (Array.isArray(worlds) ? worlds : []).filter((world) => String(world?.name ?? '').trim() === target)

  if (matches.length === 0) {
    return { ok: false, reason: `No World named '${target}' was found.` }
  }

  if (matches.length > 1) {
    return {
      ok: false,
      reason: `Ambiguous: ${matches.length} Worlds are named '${target}' (ids: ${matches.map((w) => w.id).join(', ')}). Resolve the ambiguity before proceeding -- rename one, or pass its id directly.`
    }
  }

  return { ok: true, world: matches[0] }
}
