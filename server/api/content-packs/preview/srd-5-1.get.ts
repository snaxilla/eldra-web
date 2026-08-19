// GET /api/content-packs/preview/srd-5-1
//
// The Content Pack Builder Preview -- see CLAUDE.md and this task's own
// DESIGN GOAL: "Import -> Preview -> Curate -> Publish -> Bind. This task
// ends after Preview + Curate." This route IS the "Preview" half: it
// generates exactly the same candidate list
// POST /api/content-packs/publish/srd-5-1 would publish, using the SAME
// importer, the SAME SRD 5.1 filter, and the SAME adapter -- but performs
// NO write of any kind. Nothing is validated for publication-readiness
// (validateContentPackForPublication), nothing is hashed, nothing reaches
// content-packs.ts. This route's only job is to let a GM see what
// publishing would produce before it happens.
//
// DATASET TRAVERSAL: the dataset root, file-discovery, and SRD-filter
// logic this route needs is shared with publish/srd-5-1.post.ts and
// publish/srd-5-1-curated.post.ts via
// server/utils/content-sources/dnd5e/5etools-dataset.ts (Step 1 of
// .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence, §12) -- previously three independently
// maintained, byte-identical copies of the same ~130 lines; see that
// module's own header for what was and wasn't moved.
//
// CURATION HAPPENS ENTIRELY CLIENT-SIDE: this route runs once per preview
// request and returns the full candidate list for all six categories.
// Checkbox state, Select All / Deselect All, and "what's currently
// selected" all live in the browser (AdminContentPackBuilderPanel.vue) --
// nothing here tracks or persists a selection, because nothing is saved
// yet (this task's own CURATION section: "Nothing is saved yet").
//
// WHAT IS DELIBERATELY STRIPPED: each entry's opaque `data` (the raw
// 5etools JSON) is read by the importer and the adapter but never included
// in this route's response -- this task's own PREVIEW section: "No
// mechanics. No rule text. No editing." Only identity (externalId, title)
// and provenance (sourceBook) reach the client, mirroring
// world-content-runtime.ts's own summarizeWorldContent posture of never
// shipping `data` to a surface that only needs to identify and present.
//
// FAILURE MODES (this task's own EMPTY STATES section):
//   - Dataset missing entirely (DATA_ROOT itself unreadable) -> the whole
//     response reports `available: false, reason: 'dataset-missing'`.
//   - One category's importer throws (malformed JSON, unexpected shape)
//     -> caught per-category; that category reports zero entries plus a
//     warning, the other five are unaffected. Never fails the whole
//     preview for one bad file.
//   - Zero SRD-flagged entries in an otherwise-healthy category -> a
//     normal empty category (`entries: []`), no warning -- this is
//     "No entries," a legitimate outcome (see publish/srd-5-1.post.ts's
//     own note that SRD 5.1 genuinely has only one feat and one
//     background), not a failure.
//
// AUTHORIZATION: gated on the same `platform.contentpack.publish`
// capability POST /api/content-packs/publish/srd-5-1 already requires --
// Preview is a read-only step inside the same privileged, Platform-scoped
// workflow (Import -> Preview -> Curate -> Publish -> Bind), not a
// player/GM-facing feature of its own. No new capability is invented.

import { createError, defineEventHandler } from 'h3'
import { readdir } from 'node:fs/promises'

import { requireCapability } from '../../../utils/authorization'
import { toContentPublicationCandidates } from '../../../utils/content-pack-5etools-adapter'
import {
  CATEGORY_LABELS,
  DATA_ROOT,
  DATASETS,
  getPreviewFn,
  loadSrd51DatasetEntries,
  type DatasetKey
} from '../../../utils/content-sources/dnd5e/5etools-dataset'

// ---------------------------------------------------------------------------
// Response shaping -- presentation-only. See this file's header "WHAT IS
// DELIBERATELY STRIPPED."
// ---------------------------------------------------------------------------

type ContentPackPreviewEntry = {
  externalId: string
  title: string
  sourceBook?: string
}

type ContentPackPreviewCategory = {
  key: DatasetKey
  label: string
  entries: ContentPackPreviewEntry[]
}

type ContentPackPreviewResult =
  | {
      available: true
      source: 'srd-5.1'
      categories: ContentPackPreviewCategory[]
      totalEntries: number
      warnings: string[]
    }
  | {
      available: false
      reason: 'dataset-missing'
      message: string
    }

export default defineEventHandler(async (event): Promise<ContentPackPreviewResult> => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  // Confirms the dataset root itself is reachable before attempting any
  // per-category work -- see this file's header FAILURE MODES note.
  // Per-file failures inside loadSrd51DatasetEntries are already tolerated
  // there; this only guards the one failure that would otherwise abort
  // every category identically (the root directory itself missing).
  try {
    await readdir(DATA_ROOT)
  } catch {
    return {
      available: false,
      reason: 'dataset-missing',
      message: 'The 5etools SRD 5.1 dataset is not available on this server. Nothing can be previewed until it is installed.'
    }
  }

  const categories: ContentPackPreviewCategory[] = []
  const warnings: string[] = []
  let totalEntries = 0

  for (const dataset of DATASETS) {
    try {
      const rows = await loadSrd51DatasetEntries(dataset)
      const preview = getPreviewFn(dataset)(rows)

      warnings.push(...preview.warnings.map((message) => `[${CATEGORY_LABELS[dataset]}] ${message}`))

      const entries = toContentPublicationCandidates(preview).map((candidate) => ({
        externalId: candidate.externalId,
        title: candidate.title,
        sourceBook: candidate.sourceBook
      }))

      totalEntries += entries.length
      categories.push({ key: dataset, label: CATEGORY_LABELS[dataset], entries })
    } catch (error: any) {
      // One category's importer failing never fails the whole preview --
      // see this file's header FAILURE MODES note.
      warnings.push(`[${CATEGORY_LABELS[dataset]}] Failed to generate preview: ${error?.message || 'unknown error'}`)
      categories.push({ key: dataset, label: CATEGORY_LABELS[dataset], entries: [] })
    }
  }

  return {
    available: true,
    source: 'srd-5.1',
    categories,
    totalEntries,
    warnings
  }
})
