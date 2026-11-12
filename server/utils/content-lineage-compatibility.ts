// "May this workspace adopt this package lineage?" -- the system
// compatibility half of the answer. Ownership is content-package-
// lineages.ts's half.
//
// This lives in its own module for a dependency reason, not a
// conceptual one: content-packs.ts imports content-package-lineages.ts
// for the publication guard, so content-package-lineages.ts must not
// import content-packs.ts back. This module sits above both.

import { listPublishedContentPacks, loadPublishedContentPack } from './content-packs'
import type { ContentPublicationCandidate } from './content-pack-publishing'
import { latestVersionFor } from '../../app/lib/content-packs/versions'

export type LineageCompatibility =
  | { compatible: true; lineageSystemKeys: string[]; inspectedVersion: string | null }
  | { compatible: false; lineageSystemKeys: string[]; inspectedVersion: string; message: string }

// A lineage with no published release yet constrains nothing -- there is
// no content whose system could disagree -- so adoption is allowed and
// the first publish decides. Otherwise the latest release's own entries
// are inspected; they are the only authority on what system the lineage
// holds (the manifest does not record one).
export async function checkLineageSystemCompatibility(
  packageId: string,
  workspaceSystemKey: string
): Promise<LineageCompatibility> {
  const listings = await listPublishedContentPacks()
  const version = latestVersionFor(packageId, listings)

  if (!version) return { compatible: true, lineageSystemKeys: [], inspectedVersion: null }

  const loaded = await loadPublishedContentPack(packageId, version)
  if (!loaded.ok) {
    // The release cannot be read, so its system cannot be established.
    // Adoption is not blocked on it: refusing here would make an
    // unreadable historical release permanently un-adoptable, and
    // adoption writes nothing into that release either way.
    return { compatible: true, lineageSystemKeys: [], inspectedVersion: version }
  }

  const systemKeys = [
    ...new Set(
      (loaded.package.content as ContentPublicationCandidate[])
        .map((entry) => (typeof entry?.systemKey === 'string' ? entry.systemKey : ''))
        .filter(Boolean)
    )
  ].sort()

  if (systemKeys.length === 0 || systemKeys.includes(workspaceSystemKey)) {
    return { compatible: true, lineageSystemKeys: systemKeys, inspectedVersion: version }
  }

  return {
    compatible: false,
    lineageSystemKeys: systemKeys,
    inspectedVersion: version,
    message:
      `Package '${packageId}' publishes ${systemKeys.map((key) => `'${key}'`).join(', ')} content, `
      + `which this '${workspaceSystemKey}' workspace cannot publish. Adopt it from a workspace for that game system instead.`
  }
}
