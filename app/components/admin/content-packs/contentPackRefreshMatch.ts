// Pure matching logic for AdminContentPackBuilderPanel.vue's Refresh
// Content Package workflow -- Package Sync Phase 1's REFRESH BUTTON ROOT
// CAUSE FIX. Extracted for the same reason contentPackBuilderSelection.ts
// already is (this repo has no component-mounting test harness -- see that
// file's own header).
//
// ---------------------------------------------------------------------------
// THE BUG THIS REPLACES
// ---------------------------------------------------------------------------
// The panel used to decide "has this Content Source ever been published?"
// by comparing a published pack's `packageId` against the Content Source
// registry's *suggested default* packageId
// (SourceCollectionDefinition.suggestedPackageId) -- which only holds when
// nobody ever published under a different, manually-chosen packageId.
// Solaris's real Player's Handbook (2024) pack is published as
// `eldra.solaris.xphb`, not the suggested `eldra.content.xphb`, so that
// comparison always missed and the panel reported "not yet published"
// despite real published versions existing.
//
// ---------------------------------------------------------------------------
// THE FIX
// ---------------------------------------------------------------------------
// Match on `origin.sourceId` instead -- the Content Source's own stable
// identity, written into every published pack's manifest at publish time
// (content-sources/publish.ts) regardless of what packageId string was
// chosen. content-packs.ts's ContentPackListing.origin is what makes this
// field available to a listing consumer. This is generic, not
// PHB-specific: ANY Content Source published under a non-default packageId
// is found the same way.

import { compareVersions } from '~/lib/content-packs/versions'

export type RefreshMatchCandidate = {
  packageId: string
  version: string
  origin: { adapterId: string; sourceId: string } | null
}

// parseVersionTriple/compareVersions moved to app/lib/content-packs/versions.ts
// (Content Workspaces & Studio Phase 0, Area 2) -- this was the third
// independent copy of the exact same comparator.

// The latest published pack whose `origin.sourceId` matches the given
// Content Source's collectionKey, regardless of what packageId it was
// published under. `null` when no published pack has ever been produced by
// this Content Source (a genuine "not yet published" -- the correct case
// this function must still report honestly) or when the source has no
// selected collectionKey yet.
export function findLatestPublishedPack<T extends RefreshMatchCandidate>(
  publishedPacks: readonly T[],
  collectionKey: string | undefined | null
): T | null {
  if (!collectionKey) return null

  let latest: T | null = null
  for (const pack of publishedPacks) {
    if (pack.origin?.sourceId !== collectionKey) continue
    if (!latest || compareVersions(pack.version, latest.version) > 0) latest = pack
  }
  return latest
}
