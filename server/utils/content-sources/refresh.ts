// Content Source Refresh -- Developer Workflow: Refresh Content Package.
//
// A Content Pack is a compiled artifact: its `content` is produced by
// running the CURRENT importer, the CURRENT Rules Facets (attachRulesFacets,
// 5etools-collection.ts), and the CURRENT Content Action/Presentation
// resolvers over a source dataset. None of those inputs are versioned
// alongside a published pack -- only the pack's OWN identity (packageId,
// version) is. So a change to any of them (a Rules Facet gaining a grant, an
// importer bugfix, a resolver change) can make an already-published pack
// STALE even though the underlying 5etools source file never changed -- see
// app/lib/content-rules/dnd5e-2024.ts's own Health System commit for a real
// example: every class published before that commit is missing a grant
// forever, until refreshed.
//
// REFRESH IS NOT REPUBLISH. It does not take a curated selection from the
// caller the way publishContentSourceSelection does. It re-derives one from
// the LAST PUBLISHED version's own content -- "keep whatever was already
// selected, rebuilt with today's pipeline" -- then publishes that as a new,
// separate, immutable version. This is deliberately narrower than "select
// everything the provider currently offers": a refresh must never silently
// pull in NEW entries nobody has reviewed. "No manual preview inspection
// required" only holds because refresh cannot change WHAT is included, only
// HOW it is built.
//
// ORCHESTRATION ONLY -- every step below calls an existing function:
//   - listPublishedContentPacks / loadPublishedContentPack (content-packs.ts,
//     unchanged) find and read the version being refreshed FROM.
//   - provider.loadCategory (unchanged, the same call
//     publishContentSourceSelection itself makes) regenerates today's
//     candidates.
//   - publishContentSourceSelection (publish.ts, unchanged) performs the
//     actual publish.
// This module invents no new persistence and no new validation. A refresh
// that produces byte-identical content still runs the full pipeline and
// gets a new immutable version -- versioning is not conditioned on whether
// anything actually changed (see FUTURE FINGERPRINT EXTENSION POINT below
// for how that could change later).
//
// FUTURE FINGERPRINT EXTENSION POINT: the only versioning decision made
// here is bumpPatchVersion's own patch-level bump. If Rules Facets, the
// importer, or a resolver ever gain a fingerprint/hash of their own, the
// natural extension is comparing that fingerprint against one recorded on
// the previous published version's manifest (`ContentPackManifest.origin`
// already carries `adapterId`/`sourceId` -- a sibling `compilerFingerprint`
// field would sit right next to it) to decide WHETHER a refresh would
// change anything before spending a version number on it, or to surface
// "this pack is stale" proactively in the admin UI. Nothing here precludes
// that; it is simply not implemented, per this task's own instruction not
// to invent automatic staleness detection.

import type { ContentPackPublicationIssue, ContentPublicationCandidate } from '../content-pack-publishing'
import { listPublishedContentPacks, loadPublishedContentPack } from '../content-packs'
import { publishContentSourceSelection } from './publish'
import type { SourceCollectionDefinition } from '../../../app/lib/content-sources/registry'
import type { SourceCollectionProvider } from './types'

export type ContentSourceRefreshInput = {
  provider: SourceCollectionProvider
  collection: SourceCollectionDefinition
  // Already resolved by the caller -- same posture as
  // ContentSourcePublishInput.packageId (publish.ts's own header). The
  // route defaults an omitted/blank packageId to
  // collection.suggestedPackageId; this module never does that itself.
  packageId: string
}

export type ContentSourceRefreshOutcome =
  | { refreshed: false; stage: 'not-found'; packageId: string }
  | { refreshed: false; stage: 'load-failed'; packageId: string; version: string; reason: string }
  | { refreshed: false; stage: 'validation'; issues: ContentPackPublicationIssue[] }
  | { refreshed: false; stage: 'already-exists'; packageId: string; version: string; status: string }
  | {
      refreshed: true
      packageId: string
      previousVersion: string
      version: string
      integrityHash: string
      counts: Record<string, number>
      issues: ContentPackPublicationIssue[]
    }

// ---------------------------------------------------------------------------
// Versioning -- a small, self-contained major.minor.patch comparator, the
// same "no new dependency for one shape check" posture
// content-pack-publishing.ts's own VERSION_PATTERN already takes and
// server/utils/rules-packages.ts's engineApiVersion comparator states
// explicitly. Only the major.minor.patch PREFIX is read, matching
// VERSION_PATTERN's own `/^\d+\.\d+\.\d+/` (a version may carry a
// pre-release/build suffix this never inspects).
// ---------------------------------------------------------------------------

function parseVersionTriple(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersionTriple(a)
  const pb = parseVersionTriple(b)
  if (!pa || !pb) return a.localeCompare(b)
  const [aMajor, aMinor, aPatch] = pa
  const [bMajor, bMinor, bPatch] = pb
  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  return aPatch - bPatch
}

// Refresh's own versioning decision (this task's own VERSIONING section:
// "Refresh still creates a new immutable Content Pack version. Never
// overwrite published versions."). A PATCH bump, never major/minor -- a
// refresh changes HOW the pack was built, never WHAT it contains or its
// compatibility contract, exactly the distinction semver itself draws.
export function bumpPatchVersion(version: string): string {
  const parsed = parseVersionTriple(version)
  if (!parsed) throw new Error(`Cannot refresh from a malformed version '${version}'`)
  const [major, minor, patch] = parsed
  return `${major}.${minor}.${patch + 1}`
}

function latestVersionFor(packageId: string, listings: readonly { packageId: string; version: string }[]): string | null {
  let latest: string | null = null
  for (const listing of listings) {
    if (listing.packageId !== packageId) continue
    if (!latest || compareVersions(listing.version, latest) > 0) latest = listing.version
  }
  return latest
}

// The canonical entry point for this module. See this file's header for
// the full REFRESH IS NOT REPUBLISH reasoning.
export async function refreshContentSource(input: ContentSourceRefreshInput): Promise<ContentSourceRefreshOutcome> {
  const { provider, collection, packageId } = input

  const listings = await listPublishedContentPacks()
  const previousVersion = latestVersionFor(packageId, listings)
  if (!previousVersion) {
    return { refreshed: false, stage: 'not-found', packageId }
  }

  const loaded = await loadPublishedContentPack(packageId, previousVersion)
  if (!loaded.ok) {
    return { refreshed: false, stage: 'load-failed', packageId, version: previousVersion, reason: loaded.stage }
  }

  // The previous version's own content IS the selection to rebuild -- see
  // this file's header. `content` is `ContentPublicationCandidate[]` at
  // runtime (published verbatim by publishContentPack), even though
  // loadPublishedContentPack's own return type keeps `ContentPackEntry`
  // opaque for its own, unrelated reasons (content-packs.ts's own header).
  const previousExternalIds = new Set(
    (loaded.package.content as ContentPublicationCandidate[]).map((entry) => entry.externalId)
  )

  const selection: Record<string, string[]> = {}
  for (const category of provider.categories) {
    const { candidates } = await provider.loadCategory(category.key)
    const kept = candidates.filter((candidate) => previousExternalIds.has(candidate.externalId))
    if (kept.length) selection[category.key] = kept.map((candidate) => candidate.externalId)
  }

  const nextVersion = bumpPatchVersion(previousVersion)

  const outcome = await publishContentSourceSelection({ provider, collection, packageId, version: nextVersion, selection })

  if (!outcome.published) {
    if (outcome.stage === 'validation') {
      return { refreshed: false, stage: 'validation', issues: outcome.issues }
    }
    return { refreshed: false, stage: 'already-exists', packageId: outcome.packageId, version: outcome.version, status: outcome.status }
  }

  return {
    refreshed: true,
    packageId: outcome.packageId,
    previousVersion,
    version: outcome.version,
    integrityHash: outcome.integrityHash,
    counts: outcome.counts,
    issues: outcome.issues
  }
}
