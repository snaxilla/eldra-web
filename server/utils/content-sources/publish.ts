// Content Source Publish -- the orchestration logic Step 5 of
// .github/docs/architecture/content-source-architecture.md's Implementation
// Sequence (§12) makes generic. Both POST /api/content-packs/publish (the
// generic route) and publish/srd-5-1-curated.post.ts (now a compatibility
// wrapper) call this same function -- neither re-implements it, mirroring
// exactly how preview.ts's buildContentSourcePreview is already shared by
// both preview routes (Step 4).
//
// Do NOT create another publisher (this task's own IMPLEMENT section): this
// module still calls the one existing publishContentPack orchestration
// (content-pack-publishing.ts) unchanged. What generalizes here is only
// WHERE the manifest's identity/label/license/origin come from -- a
// resolved SourceCollectionProvider (dataset access, category loading) and
// a resolved SourceCollectionDefinition from the registry
// (label/description/license/suggestedPackageId) -- replacing what used to
// be hardcoded SRD 5.1 literals inside the route itself.
//
// SELECTION IS INTENT, NEVER DATA (this task's own IMPORTANT section,
// carried over verbatim from srd-5-1-curated.post.ts's own original
// design): `selection` contributes only a set of `externalId`s per
// category. Every candidate's `title`/`sourceBook`/`data` is always
// re-derived by calling `provider.loadCategory` fresh -- the request body
// is never trusted for content, only for which externalIds to keep. A
// tampered payload can at most publish a different SUBSET of the real
// collection, never fabricated content.
//
// PACKAGE ID DEFAULTING IS THE CALLER'S DECISION, NOT THIS MODULE'S: this
// function takes `packageId` as an already-resolved string and passes it
// straight through. The generic route defaults an empty/omitted packageId
// to `collection.suggestedPackageId` (architecture doc §5.4); the
// srd-5-1-curated compatibility wrapper deliberately does NOT, to keep its
// own existing behavior byte-for-byte identical (an empty packageId there
// has always been rejected by validateContentPackForPublication, and a
// test pins that). Defaulting here would silently change the wrapper's
// contract, which this task's own IMPORTANT section forbids ("Publishing
// behavior must remain identical").
//
// UNKNOWN SELECTION KEYS ARE IGNORED, NOT ERRORS: this function only ever
// reads `selection[category.key]` for categories the PROVIDER declares --
// any other key in the submitted selection object is never consulted. A
// preview generated before a provider's category list changed degrades
// gracefully rather than failing (architecture doc §6.2).

import type { ContentPackPublicationIssue, ContentPublicationCandidate } from '../content-pack-publishing'
import { publishContentPack } from '../content-pack-publishing'
import type { SourceCollectionDefinition } from '../../../app/lib/content-sources/registry'
import type { SourceCollectionProvider } from './types'

export type ContentSourcePublishSelection = Record<string, unknown>

export type ContentSourcePublishInput = {
  provider: SourceCollectionProvider
  collection: SourceCollectionDefinition
  // Already resolved by the caller -- see this file's header PACKAGE ID
  // DEFAULTING note. Never defaulted or mutated here.
  packageId: string
  version: string
  selection: ContentSourcePublishSelection
}

export type ContentSourcePublishOutcome =
  | { published: false; stage: 'validation'; issues: ContentPackPublicationIssue[] }
  | { published: false; stage: 'already-exists'; packageId: string; version: string; status: string }
  | {
      published: true
      packageId: string
      version: string
      integrityHash: string
      counts: Record<string, number>
      issues: ContentPackPublicationIssue[]
    }

function readSelectionFor(selection: ContentSourcePublishSelection, categoryKey: string): Set<string> {
  const raw = (selection as Record<string, unknown>)?.[categoryKey]
  if (!Array.isArray(raw)) return new Set()
  return new Set(raw.filter((value): value is string => typeof value === 'string'))
}

// The canonical entry point for this module. Resolves candidates category
// by category from `provider.loadCategory`, filters each to the selected
// externalIds, and hands the result to the unchanged publishContentPack
// pipeline with a manifest composed from `collection` (title/description/
// license) and `provider` (origin.adapterId/sourceId) -- see this file's
// header and the architecture doc's §5.4 manifest-composition table.
export async function publishContentSourceSelection(input: ContentSourcePublishInput): Promise<ContentSourcePublishOutcome> {
  const { provider, collection } = input

  const candidates: ContentPublicationCandidate[] = []
  const warnings: string[] = []
  const counts: Record<string, number> = {}
  for (const category of provider.categories) {
    counts[category.key] = 0
  }

  for (const category of provider.categories) {
    const selectedIds = readSelectionFor(input.selection, category.key)
    if (selectedIds.size === 0) continue

    try {
      const { candidates: categoryCandidates, warnings: categoryWarnings } = await provider.loadCategory(category.key)
      warnings.push(...categoryWarnings.map((message) => `[${category.label}] ${message}`))

      const selected = categoryCandidates.filter((candidate) => selectedIds.has(candidate.externalId))
      counts[category.key] = selected.length
      candidates.push(...selected)
    } catch (error: any) {
      // One category's regeneration failing never fails the whole publish
      // -- mirrors buildContentSourcePreview's own per-category isolation.
      warnings.push(`[${category.label}] Failed to regenerate selected entries: ${error?.message || 'unknown error'}`)
    }
  }

  const result = await publishContentPack({
    packageId: input.packageId,
    version: input.version,
    title: collection.label,
    description: collection.description,
    license: collection.license,
    origin: {
      kind: 'translated',
      adapterId: provider.adapterId,
      sourceId: provider.collectionKey
    },
    candidates,
    warnings
  })

  if (!result.published) {
    if (result.stage === 'validation') {
      return { published: false, stage: 'validation', issues: result.issues }
    }

    return {
      published: false,
      stage: 'already-exists',
      packageId: result.packageId,
      version: result.version,
      status: result.status
    }
  }

  return {
    published: true,
    packageId: result.package.packageId,
    version: result.package.version,
    integrityHash: result.package.integrityHash,
    counts,
    issues: result.issues
  }
}
