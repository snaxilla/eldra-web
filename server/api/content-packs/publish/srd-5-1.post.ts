// POST /api/content-packs/publish/srd-5-1
//
// The first real Content Pack publication -- see CLAUDE.md and
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §7
// (Content Packs re-derived from provenance/campaign-stability/licensing).
// This route IS the "first SRD Content Pack publication workflow"
// milestone: it walks the same local 5etools dataset the existing importer
// already reads (mirrors server/api/import/bulk.post.ts's own DATA_ROOT/
// file-discovery logic exactly, duplicated rather than imported since that
// file exports nothing -- see SCOPE below for why duplicating ~60 lines of
// already-proven logic was preferred over refactoring a working, unrelated
// route), runs the SAME preview parsers (app/lib/importers) filtered to
// SRD-flagged entries only, converts through the existing adapter
// (content-pack-5etools-adapter.ts), and publishes through the existing
// pipeline (content-pack-publishing.ts's publishContentPack). It does not
// bind the pack to any World, does not implement content resolution, and
// touches no world/character/entity/permission code -- this is the
// Platform-level "produce the pack" half only.
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

type DatasetKey = 'spells' | 'items' | 'backgrounds' | 'feats' | 'species' | 'classes'

const DATASETS: readonly DatasetKey[] = ['spells', 'items', 'backgrounds', 'feats', 'species', 'classes']

const PACKAGE_ID = 'eldra.content.srd-5.1'
const VERSION = '1.0.0'

function getPreviewFn(dataset: DatasetKey): (payload: any) => EldraImportPreviewResult {
  switch (dataset) {
    case 'spells': return preview5eToolsSpells
    case 'items': return preview5eToolsItems
    case 'backgrounds': return preview5eToolsBackgrounds
    case 'feats': return preview5eToolsFeats
    case 'species': return preview5eToolsSpecies
    case 'classes': return preview5eToolsClasses
  }
}

function getCollectionKeys(dataset: DatasetKey): string[] {
  switch (dataset) {
    case 'spells': return ['spell']
    case 'items': return ['item', 'baseitem', 'magicvariant']
    case 'backgrounds': return ['background']
    case 'feats': return ['feat']
    case 'species': return ['race', 'species']
    case 'classes': return ['class']
  }
}

// Identical predicate to server/api/import/bulk.post.ts's fileLooksRelevant
// -- same dataset, same file layout, deliberately not re-derived.
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

// SRD 5.1 flag only -- never `srd52` (the 2024/CC-BY revision). See this
// file's header SRD FILTER note.
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
      // ignore bad/irrelevant files -- same tolerance import/bulk.post.ts already has
    }
  }

  return rows
}

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
