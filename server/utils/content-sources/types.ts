// The Source Collection Provider contract -- Step 2 of
// .github/docs/architecture/content-source-architecture.md's Recommended
// Implementation Sequence (§12), designed in that document's §5.2/§5.3.
//
// A provider answers exactly one question -- "what candidates does this
// collection contain?" -- and is the seam the architecture doc's §4 table
// draws between what's generic (routes, publishing, the Builder) and
// what's per-collection (dataset access, membership predicate, category
// loading, importer wiring, adapter invocation). It knows nothing about
// HTTP, capabilities, package identity, or license text -- those stay
// with the route (HTTP/auth/validation/responses) and, eventually, the
// registry (identity/license/labels) per §6.3/§6.4 of that document.
//
// No registry changes, no generic routes, and no availability-derivation
// feature (the future GET /api/content-sources of §5.4/§6.3) are part of
// this file -- `checkAvailability` exists here only because §5.2's own
// contract includes it as a provider responsibility (dataset reachability
// is dataset access), and because preview/srd-5-1.get.ts already had an
// equivalent inline check before this step that needed a provider-owned
// home to keep "the provider owns dataset access" true. Nothing new is
// built on top of it in this step.

import type { ContentPublicationCandidate } from '../content-pack-publishing'

export type SourceCategory = {
  key: string
  label: string
}

export type SourceAvailability =
  | { available: true }
  | { available: false; reason: string; message: string }

export type SourceCategoryLoadResult = {
  candidates: ContentPublicationCandidate[]
  warnings: string[]
}

export type SourceCollectionProvider = {
  gameSystemKey: string
  collectionKey: string
  // Manifest origin.adapterId for anything this provider publishes -- see
  // content-pack-5etools-adapter.ts and content-pack-publishing.ts's own
  // ContentPackOrigin.
  adapterId: string
  categories: readonly SourceCategory[]
  checkAvailability(): Promise<SourceAvailability>
  loadCategory(categoryKey: string): Promise<SourceCategoryLoadResult>
}
