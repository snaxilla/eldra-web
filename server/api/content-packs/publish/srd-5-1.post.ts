// POST /api/content-packs/publish/srd-5-1
//
// The first real Content Pack publication -- see CLAUDE.md and
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §7
// (Content Packs re-derived from provenance/campaign-stability/licensing).
// This route IS the "first SRD Content Pack publication workflow"
// milestone: it walks the same local 5etools dataset the existing importer
// already reads, runs the SAME preview parsers (app/lib/importers) filtered
// to SRD-flagged entries only, converts through the existing adapter
// (content-pack-5etools-adapter.ts), and publishes through the existing
// pipeline (content-pack-publishing.ts's publishContentPack). It does not
// bind the pack to any World, does not implement content resolution, and
// touches no world/character/entity/permission code -- this is the
// Platform-level "produce the pack" half only.
//
// DATASET TRAVERSAL: the dataset root, file-discovery, and SRD-filter
// logic this route needs is shared with preview/srd-5-1.get.ts and
// publish/srd-5-1-curated.post.ts via
// server/utils/content-sources/dnd5e/5etools-dataset.ts (Step 1 of
// .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence, §12) -- previously three independently
// maintained, byte-identical copies of the same ~60-130 lines; see that
// module's own header for what was and wasn't moved. This route keeps its
// own local `DATASETS` constant below: its six-dataset iteration order
// (spells, items, backgrounds, feats, species, classes) has always
// differed from the other two routes' order, so it was never actually
// duplicated code and was not moved -- only the truly identical helpers
// were.
//
// WHY A NITRO ROUTE, NOT A SCRIPT (unlike scripts/directus/publish-starter-
// package.mjs, the Rules Package precedent): that script reimplements its
// OWN Directus row-insert rather than calling rules-packages.ts's publish
// function, because directusServiceRequest (server/utils/directus.ts)
// calls useRuntimeConfig(), a Nuxt/Nitro-only global unavailable to a plain
// `node script.mjs` process. This task's own instruction is the opposite
// of that precedent: "Do NOT bypass the publisher. Do NOT write directly
// to Directus." The only way to literally CALL publishContentPack (not
// reimplement its logic) is to run inside a Nitro process -- so this is a
// route, invoked once as this milestone's real action, not a recurring
// player/GM-facing feature.
//
// SCOPE: six content categories share preview5eTools*'s common
// `EldraImportPreviewResult` return shape (spells, items, feats,
// backgrounds, species, classes) and are all published here. Monsters/
// bestiary are deliberately excluded: preview5eToolsMonsters has no
// `EldraImportPreviewResult` return type annotation and returns a
// different, bespoke shape (server/api/import/save/5etools/monsters.post.ts
// itself casts `preview.items as any` for exactly this reason) that would
// need its own adapter -- out of scope for "use the existing importer,"
// not a gap in this milestone.
//
// SRD FILTER: 5etools' own dataset distinguishes `srd` (the legacy/2014
// System Reference Document 5.1, OGL 1.0a -- what "eldra.content.srd-5.1"
// names) from `srd52` (the 2024 revision's SRD, CC-BY-4.0) as separate
// fields on every entry -- verified directly against the dataset on disk:
// spells-xphb.json's (2024 revision) entries all carry `srd52` and never
// `srd`; spells-phb.json's (2014) entries carry `srd`. Filtering on `srd`
// truthy alone therefore selects exactly SRD 5.1 content with no risk of
// pulling in 2024-revision duplicates, and no need to also filter by
// filename/source code. Spot-checked against real SRD 5.1 content: exactly
// one SRD feat (Grappler), one SRD background (Acolyte), the nine core PHB
// species, and the twelve core classes -- all well-known, correct facts
// about the real SRD 5.1's sparse feat/background list.
//
// AUTHORIZATION: gated on `platform.contentpack.publish` -- this is a
// Platform-scoped write (installs a new global, immutable Content Pack
// namespace every World can later see), not a World-scoped one, so it is
// checked against `{ kind: 'platform' }`, never a worldId. Authentication
// alone (the deny-by-default middleware's own baseline) is not sufficient
// for a platform operation with this blast radius.

import { createError, defineEventHandler } from 'h3'

import { requireCapability } from '../../../utils/authorization'
import { toContentPublicationCandidates } from '../../../utils/content-pack-5etools-adapter'
import {
  getPreviewFn,
  loadSrd51DatasetEntries,
  type DatasetKey
} from '../../../utils/content-sources/dnd5e/5etools-dataset'
import { publishContentPack, type ContentPublicationCandidate } from '../../../utils/content-pack-publishing'

// See this file's header DATASET TRAVERSAL note for why this stays a
// local constant rather than the shared module's own `DATASETS`.
const DATASETS: readonly DatasetKey[] = ['spells', 'items', 'backgrounds', 'feats', 'species', 'classes']

const PACKAGE_ID = 'eldra.content.srd-5.1'
const VERSION = '1.0.0'

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  const candidates: ContentPublicationCandidate[] = []
  const warnings: string[] = []
  const counts: Record<DatasetKey, number> = {
    spells: 0,
    items: 0,
    backgrounds: 0,
    feats: 0,
    species: 0,
    classes: 0
  }

  for (const dataset of DATASETS) {
    const rows = await loadSrd51DatasetEntries(dataset)
    const preview = getPreviewFn(dataset)(rows)

    counts[dataset] = preview.items.length
    warnings.push(...preview.warnings.map((message) => `[${dataset}] ${message}`))
    candidates.push(...toContentPublicationCandidates(preview))
  }

  const result = await publishContentPack({
    packageId: PACKAGE_ID,
    version: VERSION,
    title: '5th Edition SRD 5.1',
    description: 'Core Dungeons & Dragons 5th Edition rules content released by Wizards of the Coast under the System Reference Document 5.1, imported from the 5etools dataset.',
    license: {
      id: 'OGL-1.0a',
      notice: 'This Content Pack includes material from the System Reference Document 5.1 ("SRD 5.1"), licensed under the Open Game License Version 1.0a. Portions of the Materials used are property of Wizards of the Coast LLC and are used with permission under the OGL 1.0a.',
      attribution: 'System Reference Document 5.1. Copyright Wizards of the Coast LLC.'
    },
    origin: {
      kind: 'translated',
      adapterId: '5etools-json',
      sourceId: 'srd-5.1'
    },
    candidates,
    warnings
  })

  if (!result.published) {
    if (result.stage === 'validation') {
      throw createError({
        statusCode: 422,
        statusMessage: 'SRD 5.1 Content Pack failed publication validation',
        data: { issues: result.issues }
      })
    }

    throw createError({
      statusCode: 409,
      statusMessage: `Content Pack ${result.packageId}@${result.version} already exists (status: ${result.status})`
    })
  }

  return {
    published: true,
    packageId: result.package.packageId,
    version: result.package.version,
    integrityHash: result.package.integrityHash,
    counts,
    issues: result.issues
  }
})
