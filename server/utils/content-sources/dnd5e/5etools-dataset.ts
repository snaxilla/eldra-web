// Shared 5etools SRD 5.1 dataset traversal/parsing helpers -- extracted
// verbatim (Step 1 of .github/docs/architecture/content-source-architecture.md's
// Recommended Implementation Sequence, §12) from the three byte-identical
// copies that used to live in server/api/content-packs/preview/srd-5-1.get.ts,
// server/api/content-packs/publish/srd-5-1.post.ts, and
// server/api/content-packs/publish/srd-5-1-curated.post.ts. Every function
// below is moved, not rewritten -- this is a zero-behavior-change
// extraction.
//
// Step 2 (server/utils/content-sources/dnd5e/5etools-collection.ts) adds
// the one piece of generality this module didn't yet have: `isSrd51Entry`
// was the only membership predicate `loadSrd51DatasetEntries` could use.
// `loadDatasetEntries` below generalizes that predicate to an arbitrary
// `(entry) => boolean`, which is what lets the same file-walk/parse/extract
// pipeline serve a future collection (e.g. XPHB) without a second copy of
// the loop -- `loadSrd51DatasetEntries` itself is now a thin wrapper over
// it and its behavior is unchanged.
//
// This module still does NOT define SourceCollectionProvider, categories,
// or registration -- those live in 5etools-collection.ts and are what
// actually turns this into the provider abstraction.
//
// server/api/import/bulk.post.ts's own independent fileLooksRelevant copy
// is intentionally left alone -- it belongs to a different subsystem (the
// World-entity importer, not Content Pack publishing) and widening this
// extraction's diff to touch it risks behavior it wasn't asked to touch.

import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { preview5eToolsBackgrounds } from '../../../../app/lib/importers/5etools-backgrounds'
import { preview5eToolsClasses } from '../../../../app/lib/importers/5etools-classes'
import { preview5eToolsFeats } from '../../../../app/lib/importers/5etools-feats'
import { preview5eToolsItems } from '../../../../app/lib/importers/5etools-items'
import { preview5eToolsSpecies } from '../../../../app/lib/importers/5etools-species'
import { preview5eToolsSpells } from '../../../../app/lib/importers/5etools-spells'
import type { EldraImportPreviewResult } from '../../../../app/lib/importers/types'

export const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

export type DatasetKey = 'species' | 'classes' | 'backgrounds' | 'feats' | 'items' | 'spells'

// Display order matches preview/srd-5-1.get.ts's and
// publish/srd-5-1-curated.post.ts's own shared order (Species, Classes,
// Backgrounds, Feats, Items, Spells) -- both import this constant.
// publish/srd-5-1.post.ts iterates the same six datasets in a different
// order and keeps its own local constant for that reason (see that
// file's own note) -- that ordering was never actually duplicated, so it
// was not moved here.
export const DATASETS: readonly DatasetKey[] = ['species', 'classes', 'backgrounds', 'feats', 'items', 'spells']

export const CATEGORY_LABELS: Record<DatasetKey, string> = {
  species: 'Species',
  classes: 'Classes',
  backgrounds: 'Backgrounds',
  feats: 'Feats',
  items: 'Items',
  spells: 'Spells'
}

export function getPreviewFn(dataset: DatasetKey): (payload: any) => EldraImportPreviewResult {
  switch (dataset) {
    case 'species': return preview5eToolsSpecies
    case 'classes': return preview5eToolsClasses
    case 'backgrounds': return preview5eToolsBackgrounds
    case 'feats': return preview5eToolsFeats
    case 'items': return preview5eToolsItems
    case 'spells': return preview5eToolsSpells
  }
}

export function getCollectionKeys(dataset: DatasetKey): string[] {
  switch (dataset) {
    case 'species': return ['race', 'species']
    case 'classes': return ['class']
    case 'backgrounds': return ['background']
    case 'feats': return ['feat']
    case 'items': return ['item', 'baseitem', 'magicvariant']
    case 'spells': return ['spell']
  }
}

// Identical predicate previously duplicated across all three content-pack
// routes (server/api/import/bulk.post.ts keeps its own separate copy --
// see this file's header).
export function fileLooksRelevant(dataset: DatasetKey, filePath: string): boolean {
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

export async function walkJsonFiles(root: string, dataset: DatasetKey, out: string[] = []): Promise<string[]> {
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

export function extractEntitiesFromJson(parsed: any, dataset: DatasetKey): any[] {
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
export function isSrd51Entry(entry: any): boolean {
  return Boolean(entry && typeof entry === 'object' && entry.srd)
}

// Generic membership-filtered entry loader -- the primitive Step 2's
// provider factory needs. Walks the dataset, parses each relevant file,
// extracts the collection's rows, and keeps only entries the caller's own
// `membership` predicate accepts. `loadSrd51DatasetEntries` below is this
// function with `isSrd51Entry` as that predicate; a future collection
// (e.g. XPHB, predicate `entry.source === 'XPHB'`) is this function with a
// different predicate, not a new copy of the loop.
export async function loadDatasetEntries(dataset: DatasetKey, membership: (entry: any) => boolean): Promise<any[]> {
  const files = await walkJsonFiles(DATA_ROOT, dataset)
  const rows: any[] = []

  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      const extracted = extractEntitiesFromJson(parsed, dataset).filter(membership)

      if (extracted.length) {
        rows.push(...extracted)
      }
    } catch {
      // ignore bad/irrelevant files -- same tolerance all three original callers had
    }
  }

  return rows
}

export async function loadSrd51DatasetEntries(dataset: DatasetKey): Promise<any[]> {
  return loadDatasetEntries(dataset, isSrd51Entry)
}
