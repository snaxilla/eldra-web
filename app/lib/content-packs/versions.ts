// Content Pack version comparison -- the one shared, numeric
// major.minor.patch comparator for Content Pack version precedence and
// "latest" selection.
//
// Content Workspaces & Studio Phase 0, Area 2
// (.github/docs/architecture/content-workspaces-and-studio.md). Confirmed
// root cause: `server/api/content-packs/index.get.ts`'s
// `listPublishedContentPacks` (server/utils/content-packs.ts) asked
// Directus to sort by the `version` column directly -- a plain varchar
// column, sorted LEXICALLY at the database level, so "1.0.9" ranked above
// "1.0.38" and "1.0.10" ranked below "1.0.9" in the Game Admin Content
// Packs list.
//
// This exact algorithm already existed, correctly, in THREE independent
// copies before this file -- server/utils/content-sources/refresh.ts
// (the one `refreshContentSource`'s own versioning decisions are built on,
// and the one this task's brief named as "the current proven
// parser/comparator"), app/components/admin/health/projectHealth.ts, and
// app/components/admin/content-packs/contentPackRefreshMatch.ts. None of
// those three was wrong; each was just a verbatim, independently
// maintained duplicate. This file is THAT algorithm, moved here
// unchanged, so there is exactly one copy instead of three, importable
// from both a Nuxt server util (server/utils/content-sources/refresh.ts
// already imports app/lib/rules/canonicalize.ts the same way, via
// server/utils/content-sources/compilation-fingerprint.ts -- the
// established precedent for a pure app/lib/** module shared across the
// server/client boundary) and a browser-only admin component.
//
// A FOURTH, pre-existing, unrelated-by-necessity duplicate --
// scripts/directus/packages-sync-core.mjs's own `compareVersions` -- is
// deliberately NOT unified with this module. That file is plain,
// zero-import ESM, run directly via `node` with no TypeScript transpile
// step (its sibling packages-sync.mjs needs `jiti` specifically because a
// bare .mjs script cannot `import` a .ts module on its own); its own
// header already documents this as an intentional, previously-scoped-out
// decision. Adding a transpile dependency there solely to dedupe a
// ~10-line comparator is exactly the kind of unrequested-dependency
// expansion this task's own instructions forbid.
//
// Also NOT unified: server/utils/rules-packages.ts's `compareSemVer`. It
// compares a different, already-parsed `{major,minor,patch}` shape for a
// different purpose (caret-range engine-API-version compatibility,
// `satisfiesEngineApiVersion`) -- a different system (Rules Packages, the
// Mechanics sibling of Content Packs) solving a different problem, not
// another copy of "pick the latest published Content Pack version."
//
// SUPPORTED VERSION FORMAT: only the major.minor.patch PREFIX is read
// (`/^\d+\.\d+\.\d+/`), matching content-pack-publishing.ts's own
// VERSION_PATTERN -- a version may carry a pre-release/build suffix
// (`1.0.0-beta.1`) that this never inspects or orders specially. This is
// the same limitation the three original copies already had; this file
// does not add or remove any version-format support, only relocates the
// existing behavior.

export function parseVersionTriple(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

// Negative when `a` is older than `b`, positive when newer, zero when
// equal. Falls back to `localeCompare` -- a deterministic, if arbitrary,
// ordering -- when either version does not start with a recognizable
// major.minor.patch triple (e.g. a malformed or missing version string).
// This fallback is unchanged from every prior copy: it is not SemVer
// precedence, only "never throw, always return a stable comparator
// result."
export function compareVersions(a: string, b: string): number {
  const pa = parseVersionTriple(a)
  const pb = parseVersionTriple(b)
  if (!pa || !pb) return a.localeCompare(b)
  const [aMajor, aMinor, aPatch] = pa
  const [bMajor, bMinor, bPatch] = pb
  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  return aPatch - bPatch
}

export type VersionedListing = { packageId: string; version: string }

// The newest version of `packageId` among `listings`, or `null` when none
// exist for that package -- a legitimate "unknown" (nothing published
// under this id, or the listing itself is empty), never conflated with
// "this IS the latest" by a caller. Shared by every "is this World/binding
// up to date" classifier (Project Health, the Content Pack Builder's own
// Refresh-availability check) so each stops re-deriving its own notion of
// "latest" from the same raw listing.
export function latestVersionFor(packageId: string, listings: readonly VersionedListing[]): string | null {
  let latest: string | null = null
  for (const listing of listings) {
    if (listing.packageId !== packageId) continue
    if (!latest || compareVersions(listing.version, latest) > 0) latest = listing.version
  }
  return latest
}
