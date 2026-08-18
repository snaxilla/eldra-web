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
// WHY THIS DUPLICATES publish/srd-5-1.post.ts's DATA_ROOT/file-discovery
// logic rather than importing it: that file exports nothing (a route
// module's default export is a handler, not a library), and this task's
// own NON-GOALS explicitly excludes "Publishing" -- touching that file at
// all, even for a no-behavior-change extraction, risks reading as
// implementing publishing work this task was told not to do. Duplicating
// ~130 lines of already-proven, unit-tested-by-the-publish-route logic
// verbatim is the same trade-off already made for that route's own
// relationship to server/api/import/bulk.post.ts. The risk this creates --
// preview and publish's filters silently drifting apart -- is real and
// worth flagging: if this SRD filter is ever changed, both copies must be
// changed together. A future task that touches both files at once would be
// the natural place to extract a shared module; this one deliberately does
// not, to keep its diff from touching Publishing at all.
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
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { preview5eToolsBackgrounds } from '../../../../app/lib/importers/5etools-backgrounds'
import { preview5eToolsClasses } from '../../../../app/lib/importers/5etools-classes'
import { preview5eToolsFeats } from '../../../../app/lib/importers/5etools-feats'
import { preview5eToolsItems } from '../../../../app/lib/importers/5etools-items'
import { preview5eToolsSpecies } from '../../../../app/lib/importers/5etools-species'
import { preview5eToolsSpells } from '../../../../app/lib/importers/5etools-spells'
import type { EldraImportPreviewResult } from '../../../../app/lib/importers/types'
import { requireCapability } from '../../../utils/authorization'
import { toContentPublicationCandidates } from '../../../utils/content-pack-5etools-adapter'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

type DatasetKey = 'species' | 'classes' | 'backgrounds' | 'feats' | 'items' | 'spells'

// Display order matches this task's own PREVIEW section list exactly
// (Species, Classes, Backgrounds, Feats, Items, Spells).
const DATASETS: readonly DatasetKey[] = ['species', 'classes', 'backgrounds', 'feats', 'items', 'spells']

const CATEGORY_LABELS: Record<DatasetKey, string> = {
  species: 'Species',
  classes: 'Classes',
  backgrounds: 'Backgrounds',
  feats: 'Feats',
  items: 'Items',
  spells: 'Spells'
}

function getPreviewFn(dataset: DatasetKey): (payload: any) => EldraImportPreviewResult {
  switch (dataset) {
    case 'species': return preview5eToolsSpecies
    case 'classes': return preview5eToolsClasses
    case 'backgrounds': return preview5eToolsBackgrounds
    case 'feats': return preview5eToolsFeats
    case 'items': return preview5eToolsItems
    case 'spells': return preview5eToolsSpells
  }
}

function getCollectionKeys(dataset: DatasetKey): string[] {
  switch (dataset) {
    case 'species': return ['race', 'species']
    case 'classes': return ['class']
    case 'backgrounds': return ['background']
    case 'feats': return ['feat']
    case 'items': return ['item', 'baseitem', 'magicvariant']
    case 'spells': return ['spell']
  }
}

// Identical predicate to server/api/import/bulk.post.ts's and
// publish/srd-5-1.post.ts's own fileLooksRelevant -- same dataset, same
// file layout, deliberately not re-derived (see this file's header note).
function fileLooksRelevant(dataset: DatasetKey, filePath: string): boolean {
  const name = basename(filePath).toLowerCase()
  const normalized = filePath.toLowerCase()

  switch (dataset) {
    case 'spells':
      return normalized.includes('/spells/') && name.endsWith('.json')
    case 'classes':
      return normalized.includes('/class/') && name.endsWith('.json')
    case 'items':
      return (name.startsWith('items') || normalized.includes('/items/') || name.includes('item')) && name.endsWith('.json')
    case 'backgrounds':
      return name.includes('background') && name.endsWith('.json')
    case 'feats':
      return name.includes('feat') && name.endsWith('.json')
    case 'species':
      return (name.includes('race') || name.includes('species')) && name.endsWith('.json')
  }
}

async function walkJsonFiles(root: string, dataset: DatasetKey, out: string[] = []): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })

  for (const entry of entries) {
    const full = join(root, entry.name)

    if (entry.isDirectory()) {
      await walkJsonFiles(full, dataset, out)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    if (fileLooksRelevant(dataset, full)) {
      out.push(full)
    }
  }

  return out
}

function extractEntitiesFromJson(parsed: any, dataset: DatasetKey): any[] {
  const keys = getCollectionKeys(dataset)
  const found: any[] = []

  for (const key of keys) {
    if (Array.isArray(parsed?.[key])) {
      found.push(...parsed[key])
    }
    if (Array.isArray(parsed?.data?.[key])) {
      found.push(...parsed.data[key])
    }
  }

  return found
}

// SRD 5.1 flag only -- never `srd52` (the 2024/CC-BY revision). See
// publish/srd-5-1.post.ts's own SRD FILTER note for the verified-against-
// the-dataset reasoning; unchanged here.
function isSrd51Entry(entry: any): boolean {
  return Boolean(entry && typeof entry === 'object' && entry.srd)
}

async function loadSrd51DatasetEntries(dataset: DatasetKey): Promise<any[]> {
  const files = await walkJsonFiles(DATA_ROOT, dataset)
  const rows: any[] = []

  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      const extracted = extractEntitiesFromJson(parsed, dataset).filter(isSrd51Entry)

      if (extracted.length) {
        rows.push(...extracted)
      }
    } catch {
      // ignore bad/irrelevant files -- same tolerance the publish route has
    }
  }

  return rows
}

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
