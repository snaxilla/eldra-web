// POST /api/content-packs/publish/srd-5-1-curated
// { packageId, version, selection: { species/classes/backgrounds/feats/items/spells: string[] } }
//
// Curated Content Pack Publishing -- completes the workflow started by
// GET /api/content-packs/preview/srd-5-1: Import -> Preview -> Curate ->
// Publish. Where publish/srd-5-1.post.ts is the ONE hardcoded "publish
// everything SRD 5.1 has, under fixed identity 'eldra.content.srd-5.1'"
// milestone action (left untouched -- this task's own instruction is to
// implement Curated Publishing, not redesign that route), this route lets
// a GM publish a Content Pack containing ONLY the entries they selected in
// the Preview UI (AdminContentPackBuilderPanel.vue), under a
// GM-supplied packageId/version.
//
// REUSE, NOT A SECOND PUBLISHER: this route calls the SAME
// publishContentPack orchestration (content-pack-publishing.ts) the
// milestone route already uses, unchanged. It regenerates the SAME full
// candidate list preview/srd-5-1.get.ts would (same importers, same SRD
// filter, same adapter -- see that file's own duplication note; this is a
// third copy of the same ~130 lines of dataset-loading logic, for the same
// reason: touching preview/srd-5-1.get.ts or publish/srd-5-1.post.ts here
// risked reading as a redesign of either, which this task explicitly
// forbids). The only new step this route adds is filtering each category's
// regenerated candidates down to the externalIds the client says were
// selected, BEFORE calling publishContentPack -- the selection is the
// caller's INTENT, never their DATA: `title`/`sourceBook`/`data` are always
// re-derived from disk here, never trusted from the request body, so a
// tampered client payload can at most publish a different SUBSET of the
// real dataset, never fabricated content.
//
// PACKAGE NAME: the Builder UI collects one identity field, "Package
// Name" -- there is no separate title/description input (this task's own
// UI section lists only "Package Name, Version, Publish"). That single
// value is used as both `packageId` (validateContentPackForPublication's
// existing reverse-DNS-shaped identifier check governs whether it is
// well-formed -- no new validation invented here) and `title` (a plain,
// defensible reuse given no separate field exists). `license`/`description`
// /`origin` are fixed to the same SRD 5.1 / OGL-1.0a metadata
// publish/srd-5-1.post.ts already hardcodes, since Phase 1's only Import
// Source is, and remains, "5etools SRD 5.1" -- not re-collected from the
// GM because nothing in this phase varies it.
//
// VALIDATION: "no entries selected" / "package name empty" / "version
// empty" are NOT re-checked here -- they fall straight through to
// validateContentPackForPublication (via publishContentPack), which
// already rejects all three (empty-content / invalid-package-id /
// invalid-version). Continuing to use that existing validator, not a
// second one, is this task's own explicit instruction.
//
// NOT BINDING: this route only publishes. Binding a World to the resulting
// pack is the caller's separate next step via the existing
// POST /api/worlds/:id/content-packs (world-content-pack-binding.ts) --
// unchanged, untouched, and never invoked from here.

import { createError, defineEventHandler, readBody } from 'h3'
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
import { publishContentPack, type ContentPublicationCandidate } from '../../../utils/content-pack-publishing'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

type DatasetKey = 'species' | 'classes' | 'backgrounds' | 'feats' | 'items' | 'spells'

// Same display/category order as preview/srd-5-1.get.ts -- the Builder
// panel's selection object is keyed identically.
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

// Identical predicate to preview/srd-5-1.get.ts's and publish/srd-5-1.post.ts's
// own fileLooksRelevant -- same dataset, same file layout.
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
// publish/srd-5-1.post.ts's own SRD FILTER note; unchanged here.
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
      // ignore bad/irrelevant files -- same tolerance the other two routes have
    }
  }

  return rows
}

function readSelectionFor(body: any, dataset: DatasetKey): Set<string> {
  const raw = body?.selection?.[dataset]
  if (!Array.isArray(raw)) return new Set()
  return new Set(raw.filter((value): value is string => typeof value === 'string'))
}

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  const body = await readBody(event)
  const packageId = typeof body?.packageId === 'string' ? body.packageId.trim() : ''
  const version = typeof body?.version === 'string' ? body.version.trim() : ''

  const candidates: ContentPublicationCandidate[] = []
  const warnings: string[] = []
  const counts: Record<DatasetKey, number> = {
    species: 0,
    classes: 0,
    backgrounds: 0,
    feats: 0,
    items: 0,
    spells: 0
  }

  for (const dataset of DATASETS) {
    const selectedIds = readSelectionFor(body, dataset)
    if (selectedIds.size === 0) continue

    try {
      const rows = await loadSrd51DatasetEntries(dataset)
      const preview = getPreviewFn(dataset)(rows)
      warnings.push(...preview.warnings.map((message) => `[${CATEGORY_LABELS[dataset]}] ${message}`))

      const selected = toContentPublicationCandidates(preview).filter((candidate) => selectedIds.has(candidate.externalId))
      counts[dataset] = selected.length
      candidates.push(...selected)
    } catch (error: any) {
      // One category's regeneration failing never fails the whole publish
      // -- mirrors preview/srd-5-1.get.ts's own per-category isolation.
      warnings.push(`[${CATEGORY_LABELS[dataset]}] Failed to regenerate selected entries: ${error?.message || 'unknown error'}`)
    }
  }

  const result = await publishContentPack({
    packageId,
    version,
    title: packageId || '(untitled)',
    description: 'Curated selection of System Reference Document 5.1 content, chosen by a Game Master from the 5etools SRD 5.1 import.',
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
        statusMessage: 'Curated SRD 5.1 Content Pack failed publication validation',
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
