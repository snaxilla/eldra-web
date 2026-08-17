// World Content Resolution -- Phase 1.
// See .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §7 and this task's own OBJECTIVE: "Teach a World to resolve the Content
// Packs bound to it." Mirrors server/utils/world-runtime-service.ts's own
// shape exactly -- that module's header names itself "the single most
// important new module and the only one that knows both halves exist" for
// Rules Packages; this module is the same seam for Content Packs. It
// composes three already-independently-built, already-independently-tested
// layers -- World binding (world-content-packs.ts), the pack loader
// (content-packs.ts's loadPublishedContentPack, which already verifies
// status and integrity), and nothing else, because Content Packs have no
// pure "runtime assembler" the way Rules Packages have
// app/lib/rules/world-runtime.ts (NON-GOALS: no overrides, no conflict
// resolution -- there is nothing to assemble beyond concatenation).
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. MANY bindings, not one -- generalizes world-runtime-service.ts's
//    "three states, not two" rule to a list. A World may bind many Content
//    Packs (world-content-packs.ts's own design decision 3), so resolution
//    cannot collapse to "configured | unconfigured | broken" the way a
//    single active Rules Package can. Instead EVERY binding resolves
//    independently to ok:true or ok:false, and a broken binding NEVER
//    disappears from `packs` or silently drops out of the result -- the
//    same "configured but broken is never reported as absent" principle
//    (world-runtime-service.ts design decision 1), generalized: one broken
//    binding is reported as broken; it does not fail the whole World, and
//    it does not vanish.
//
// 2. Integrity is NOT re-verified here -- loadPublishedContentPack already
//    verifies status and integrity on every call (content-packs.ts's own
//    documented contract: "The only loader safe to treat as 'this pack's
//    content may be trusted'"). This module adds no second verification
//    pass, exactly like world-runtime-service.ts never re-verifies what
//    loadPublishedPackage already checked.
//
// 3. Content is exposed, never mutated or merged -- task's own IMPLEMENT
//    section: "Do NOT mutate content. Do NOT merge overrides. Simply
//    expose the bound content." A published pack's `content` array
//    (ContentPackEntry[], opaque at content-packs.ts's storage layer) is,
//    for every pack this pipeline can produce today, structurally a
//    ContentPublicationCandidate[] -- content-pack-publishing.ts's
//    publishContentPack stores `input.candidates` verbatim as `content`.
//    This module is the first layer allowed to know that (content-packs.ts
//    deliberately does not -- "no importer or content-resolution consumer
//    exists yet... a future resolver commit gives this a real type" is
//    exactly this commit). Reading the envelope fields
//    (systemKey/entityType/title/slug/externalId/provider/sourceBook/
//    sourcePage) is reading already-normalized publication metadata, not
//    interpreting `data` -- `data` itself is carried through completely
//    untouched and unread, same opacity contract content-pack-publishing.ts
//    already established for it.
//
// 4. Two layers, mirroring world-runtime-service.ts's getWorldRuntime/
//    summarizeWorldRuntime split exactly:
//      - resolveWorldContent  -- FULL composition: every bound pack loaded
//        (or its failure reported), every entry's full envelope AND `data`,
//        grouped by entityType. The internal, complete result.
//      - summarizeWorldContent -- the API-safe SUMMARY view: strips `data`
//        from every entry (a caller "discovering" a World's catalogue does
//        not need every spell's full 5etools JSON body -- that is
//        Character Creation's job, an explicit NON-GOAL here), keeping
//        only identity + provenance fields, grouped by entityType with
//        counts. This is the shape GET /api/worlds/:id/content returns.
//
// 5. No caching, no writes, no capability check on the read -- matching
//    GET /api/worlds/:id/content-packs and GET /api/worlds/:id/rules/summary's
//    own precedent exactly ("reading a World's configuration is not gated
//    the way writing it is"). worldId is trusted from the route the same
//    way every other World-scoped read in this codebase already is.

import { loadPublishedContentPack, type ContentPackLoadFailure } from './content-packs'
import { listContentPackBindingsForWorld } from './world-content-packs'
import type { ContentPublicationCandidate } from './content-pack-publishing'

// ---------------------------------------------------------------------------
// FULL resolution
// ---------------------------------------------------------------------------

// One bound pack's own resolution outcome -- see design decision 1. Never
// throws; every possible outcome loadPublishedContentPack can report is
// surfaced here, nested (not flattened) under `failure`, exactly the
// reasoning world-runtime-service.ts's own design decision 2 gives for why
// PublishedPackageLoadFailure is nested rather than spread.
export type WorldContentPackResolution =
  | { ok: true; packageId: string; version: string; title: string; entryCount: number }
  | { ok: false; packageId: string; version: string; failure: ContentPackLoadFailure }

// A single catalogue entry -- a pack's ContentPublicationCandidate, plus
// which bound pack it came from (a World may bind several packs; an entry
// must say which one it resolved through). `data` remains exactly what the
// pack stored -- opaque, untouched.
export type WorldContentEntry = ContentPublicationCandidate & {
  packageId: string
  packageVersion: string
}

export type WorldContentCatalogue = {
  worldId: string
  packs: WorldContentPackResolution[]
  entries: WorldContentEntry[]
  byEntityType: Record<string, WorldContentEntry[]>
}

function groupByEntityType(entries: readonly WorldContentEntry[]): Record<string, WorldContentEntry[]> {
  const grouped: Record<string, WorldContentEntry[]> = {}

  for (const entry of entries) {
    const key = entry.entityType || 'unknown'
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(entry)
  }

  return grouped
}

// The canonical entry point for resolving a World's bound Content Pack
// catalogue. Composes listContentPackBindingsForWorld -> (per binding)
// loadPublishedContentPack, and nothing else. A World with zero bindings
// resolves to an empty catalogue (empty `packs`/`entries`/`byEntityType`),
// never an error -- "absence is legal" (world-content-packs.ts's own design
// decision 5, generalized from one binding to the whole set).
export async function resolveWorldContent(worldId: string | number): Promise<WorldContentCatalogue> {
  const bindings = await listContentPackBindingsForWorld(worldId)

  const packs: WorldContentPackResolution[] = []
  const entries: WorldContentEntry[] = []

  for (const binding of bindings) {
    const result = await loadPublishedContentPack(binding.packageId, binding.packageVersion)

    if (!result.ok) {
      const { ok: _ok, ...failure } = result
      packs.push({
        ok: false,
        packageId: binding.packageId,
        version: binding.packageVersion,
        failure
      })
      continue
    }

    const pack = result.package

    packs.push({
      ok: true,
      packageId: pack.packageId,
      version: pack.version,
      title: pack.manifest.title,
      entryCount: pack.content.length
    })

    for (const rawEntry of pack.content) {
      const candidate = rawEntry as ContentPublicationCandidate
      entries.push({
        ...candidate,
        packageId: pack.packageId,
        packageVersion: pack.version
      })
    }
  }

  return {
    worldId: String(worldId),
    packs,
    entries,
    byEntityType: groupByEntityType(entries)
  }
}

// ---------------------------------------------------------------------------
// GET /api/worlds/:id/content response shaping
// ---------------------------------------------------------------------------
//
// Pulled out as its own pure function (rather than left inline in the route
// handler) so it is directly unit-testable without a Nuxt/H3 runtime --
// server/api/worlds/[id]/content.get.ts calls this and returns its result
// verbatim. Never exposes `data` -- see design decision 4.

export type WorldContentSummaryEntry = {
  systemKey: string
  entityType: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
  packageId: string
  packageVersion: string
}

export type WorldContentSummary = {
  worldId: string
  packs: WorldContentPackResolution[]
  totalEntries: number
  byEntityType: Record<string, WorldContentSummaryEntry[]>
}

function toSummaryEntry(entry: WorldContentEntry): WorldContentSummaryEntry {
  return {
    systemKey: entry.systemKey,
    entityType: entry.entityType,
    title: entry.title,
    slug: entry.slug,
    externalId: entry.externalId,
    provider: entry.provider,
    sourceBook: entry.sourceBook,
    sourcePage: entry.sourcePage,
    packageId: entry.packageId,
    packageVersion: entry.packageVersion
  }
}

export function summarizeWorldContent(catalogue: WorldContentCatalogue): WorldContentSummary {
  const byEntityType: Record<string, WorldContentSummaryEntry[]> = {}

  for (const [entityType, entries] of Object.entries(catalogue.byEntityType)) {
    byEntityType[entityType] = entries.map(toSummaryEntry)
  }

  return {
    worldId: catalogue.worldId,
    packs: catalogue.packs,
    totalEntries: catalogue.entries.length,
    byEntityType
  }
}
