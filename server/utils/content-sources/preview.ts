// Content Source Preview -- the response-shaping logic Step 4 of
// .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence (§12) makes generic. Both
// GET /api/content-sources/[system]/[collection]/preview (the generic
// route) and preview/srd-5-1.get.ts (now a compatibility wrapper) call
// this same function -- neither re-implements it, which is what makes the
// wrapper an honest delegation rather than a second copy.
//
// Everything here was previously inline in preview/srd-5-1.get.ts's own
// handler; moved verbatim except that `source` is now the provider's own
// `collectionKey` instead of the hardcoded literal `'srd-5.1'` (for
// SRD 5.1 those are the same string, so this is byte-for-byte identical
// today) and `reason`/`message` on the unavailable branch now pass through
// whatever the provider's checkAvailability() reports instead of a
// hardcoded 'dataset-missing' literal (again identical in value for the
// SRD 5.1 case -- see 5etools-collection.ts's own checkAvailability).
//
// This module knows nothing about HTTP, capabilities, or routing -- it
// takes an already-resolved SourceCollectionProvider and returns a plain
// response object. Provider resolution, key validation, and
// authorization all stay with the routes, per the architecture doc's own
// responsibility split (§4).

import type { SourceCollectionProvider } from './types'

export type ContentSourcePreviewEntry = {
  externalId: string
  title: string
  sourceBook?: string
}

export type ContentSourcePreviewCategory = {
  key: string
  label: string
  entries: ContentSourcePreviewEntry[]
}

export type ContentSourcePreviewResult =
  | {
      available: true
      source: string
      categories: ContentSourcePreviewCategory[]
      totalEntries: number
      warnings: string[]
    }
  | {
      available: false
      reason: string
      message: string
    }

export async function buildContentSourcePreview(provider: SourceCollectionProvider): Promise<ContentSourcePreviewResult> {
  const availability = await provider.checkAvailability()
  if (!availability.available) {
    return {
      available: false,
      reason: availability.reason,
      message: availability.message
    }
  }

  const categories: ContentSourcePreviewCategory[] = []
  const warnings: string[] = []
  let totalEntries = 0

  for (const category of provider.categories) {
    try {
      const { candidates, warnings: categoryWarnings } = await provider.loadCategory(category.key)

      warnings.push(...categoryWarnings.map((message) => `[${category.label}] ${message}`))

      const entries = candidates.map((candidate) => ({
        externalId: candidate.externalId,
        title: candidate.title,
        sourceBook: candidate.sourceBook
      }))

      totalEntries += entries.length
      categories.push({ key: category.key, label: category.label, entries })
    } catch (error: any) {
      // One category's importer failing never fails the whole preview --
      // matches every content-pack route's own per-category isolation.
      warnings.push(`[${category.label}] Failed to generate preview: ${error?.message || 'unknown error'}`)
      categories.push({ key: category.key, label: category.label, entries: [] })
    }
  }

  return {
    available: true,
    source: provider.collectionKey,
    categories,
    totalEntries,
    warnings
  }
}
