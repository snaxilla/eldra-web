// 5etools Importer -> Content Pack Publication Adapter.
//
// This is the ONLY module allowed to know about both shapes: the
// importer's `EldraImportPreviewEntity` (app/lib/importers/types -- built
// for World-entity persistence, carrying `blocks: EldraEntityBlockInstance[]`
// in the exact shape BlockRenderer.vue/app/lib/systems' buildDefaultEntityData
// produce) and the Content Pack system's own `ContentPublicationCandidate`
// (server/utils/content-pack-publishing.ts -- Eldra's publication contract,
// which knows nothing about blocks or rendering).
//
// server/utils/content-pack-publishing.ts must never import from
// app/lib/importers. This module exists so it doesn't have to: it is the
// explicit seam between "what a 5etools importer produces" and "what the
// Content Pack Publisher accepts," so a future Foundry or Pathfinder
// importer gets its own adapter here rather than either (a) being forced
// to fake up `EldraImportPreviewEntity.blocks` just to publish a Content
// Pack, or (b) the publisher growing a second importer-specific branch.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. `data` on the resulting candidate is `entity.raw` -- the untouched
//    upstream 5etools JSON -- never `entity.blocks`. `blocks` is discarded
//    entirely by this adapter; it is a World-entity/BlockRenderer
//    presentation concept (app/lib/systems' buildDefaultEntityData shapes
//    it explicitly for that renderer) with no place in a Content Pack.
//    `raw` is source-specific (5etools' own JSON shape), which is
//    expected and correct -- a future content resolver interprets it per
//    (systemKey, entityType); this adapter's job is only to normalize the
//    ENVELOPE (identity + provenance), not to design that resolver.
//
// 2. Identity and provenance fields (systemKey/entityType/title/slug/
//    externalId/provider/sourceBook/sourcePage) map across unchanged --
//    those are already normalized, presentation-free facts about the
//    entry, not World-entity-specific.
//
// 3. Pure, no I/O -- a plain data transform, exactly like every importer
//    mapper in app/lib/importers itself.

import type { ContentPublicationCandidate } from './content-pack-publishing'
import type { EldraImportPreviewEntity, EldraImportPreviewResult } from '../../app/lib/importers/types'

export function toContentPublicationCandidate(entity: EldraImportPreviewEntity): ContentPublicationCandidate {
  return {
    systemKey: entity.systemKey,
    entityType: entity.entityType,
    title: entity.title,
    slug: entity.slug,
    externalId: entity.externalId,
    provider: entity.provider,
    sourceBook: entity.sourceBook,
    sourcePage: entity.sourcePage,
    data: entity.raw
  }
}

export function toContentPublicationCandidates(result: EldraImportPreviewResult): ContentPublicationCandidate[] {
  return result.items.map(toContentPublicationCandidate)
}
