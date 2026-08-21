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

// `monsters` is a full member of this union -- bestiary files are located,
// filtered, and key-extracted by exactly the same per-dataset machinery
// every other category uses (fileLooksRelevant/getCollectionKeys/
// walkJsonFiles), which is what lets monsters inherit the Foundry-companion
// exclusion below for free instead of re-deriving it.
//
// It is deliberately NOT a member of `DATASETS`. That constant is what the
// existing providers map over to build their category lists (srd51Provider,
// xphbProvider; xdmgProvider uses its own narrower list), so appending
// 'monsters' there would silently graft a monsters category onto every
// existing collection. A collection that wants monsters declares that
// category explicitly -- see 5etools-collection.ts's `loadCandidates` hook.
//
// The two functions monsters genuinely cannot share are guarded rather than
// silently wrong: `getPreviewFn` and `loadDatasetEntries` both throw for
// 'monsters' (see each). Monsters flow through loadMonsterDatasetEntries +
// content-pack-monsters-adapter.ts instead.
export type DatasetKey = 'species' | 'classes' | 'backgrounds' | 'feats' | 'items' | 'spells' | 'monsters'

// Display order matches preview/srd-5-1.get.ts's and
// publish/srd-5-1-curated.post.ts's own shared order (Species, Classes,
// Backgrounds, Feats, Items, Spells) -- both import this constant.
// publish/srd-5-1.post.ts iterates the same six datasets in a different
// order and keeps its own local constant for that reason (see that
// file's own note) -- that ordering was never actually duplicated, so it
// was not moved here.
//
// 'monsters' is intentionally absent -- see the DatasetKey note above.
export const DATASETS: readonly DatasetKey[] = ['species', 'classes', 'backgrounds', 'feats', 'items', 'spells']

export const CATEGORY_LABELS: Record<DatasetKey, string> = {
  species: 'Species',
  classes: 'Classes',
  backgrounds: 'Backgrounds',
  feats: 'Feats',
  items: 'Items',
  spells: 'Spells',
  monsters: 'Monsters'
}

export function getPreviewFn(dataset: DatasetKey): (payload: any) => EldraImportPreviewResult {
  switch (dataset) {
    case 'species': return preview5eToolsSpecies
    case 'classes': return preview5eToolsClasses
    case 'backgrounds': return preview5eToolsBackgrounds
    case 'feats': return preview5eToolsFeats
    case 'items': return preview5eToolsItems
    case 'spells': return preview5eToolsSpells
    case 'monsters':
      // preview5eToolsMonsters does NOT return EldraImportPreviewResult --
      // that shape mismatch is the entire reason
      // content-pack-monsters-adapter.ts exists. Throwing here keeps this
      // function's return type honest and turns any attempt to run monsters
      // through the default per-category pipeline into a loud failure
      // rather than a cast that would fail later, further away.
      throw new Error("getPreviewFn: 'monsters' has no EldraImportPreviewResult parser -- use content-pack-monsters-adapter.ts's toMonsterContentPublicationCandidates")
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
    case 'monsters': return ['monster']
  }
}

// 5etools ships Foundry VTT companion exports alongside its own content,
// inside the same tree and under names this module's per-category matchers
// would otherwise accept: `foundry-races.json`, `foundry-feats.json`,
// `foundry-items.json` at the root, plus `class/foundry.json` and
// `spells/foundry.json`. Their entries carry a real `source` (e.g. 'XPHB')
// but a completely different, Foundry-specific body (`advancement`,
// `activities`, `effects[].foundryId`, `migrationVersion`) with none of the
// fields app/lib/importers/* reads -- so they parse "successfully" into
// entries whose every field is blank.
//
// This never affected SRD 5.1 because no Foundry entry carries an `srd`
// flag, so `isSrd51Entry` excluded them for free. A source-code membership
// predicate (`entry.source === 'XPHB'`) does NOT, which is how these files
// first became visible. Excluding them here rather than in any one
// collection's membership predicate is deliberate: a Foundry export is
// relevant to NO category and NO collection, which is exactly the question
// this function exists to answer -- and fixing it here means every current
// and future collection gets the fix once, instead of each one re-deriving
// a `!entry.migrationVersion`-style workaround.
//
// Verified against the dataset: excluding these removes 0 SRD 5.1 rows in
// every category (Foundry files contribute srd=0 everywhere) and 380
// spurious rows from XPHB.
function isFoundryCompanionFile(filePath: string): boolean {
  return basename(filePath).toLowerCase().startsWith('foundry')
}

// Identical predicate previously duplicated across all three content-pack
// routes (server/api/import/bulk.post.ts keeps its own separate copy --
// see this file's header), plus the Foundry-companion exclusion above.
export function fileLooksRelevant(dataset: DatasetKey, filePath: string): boolean {
  const name = basename(filePath).toLowerCase()
  const normalized = filePath.toLowerCase()

  if (isFoundryCompanionFile(filePath)) {
    return false
  }

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
    case 'monsters':
      // Both file families in bestiary/ -- `bestiary-*.json` (keyed
      // `monster`) and `fluff-bestiary-*.json` (keyed `monsterFluff`) --
      // because loadMonsterDatasetEntries joins them and therefore needs a
      // single walk that returns both. bestiary/ also holds index.json,
      // fluff-index.json, legendarygroups.json and template.json; none of
      // those carry a `monster` or `monsterFluff` key, so they contribute
      // zero rows without needing their own exclusion. bestiary/foundry.json
      // is already excluded by the Foundry-companion rule above.
      return normalized.includes('/bestiary/') && name.endsWith('.json')
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

// Entry-level source-code membership -- the general form the architecture
// doc's §2.3 requires ("Collection membership is an entry-level predicate,
// never a file filter"), verified against this dataset: PHB and XPHB share
// `class/class-*.json` and `items.json`, so a file-name filter would
// silently publish the wrong book.
//
// Deliberately keyed on `source`, not `edition`: measured against the real
// dataset, `edition: 'one'` is present on XPHB species/classes/backgrounds
// but ABSENT on XPHB feats (0 of 77), spells (0 of 391), and most items
// (0 of 123 in items.json) -- so `edition` identifies a ruleset revision,
// not a book, and cannot select a collection on its own.
export function isEntryFromSource(sourceCode: string): (entry: any) => boolean {
  return (entry: any) => Boolean(entry && typeof entry === 'object' && entry.source === sourceCode)
}

// Generic membership-filtered entry loader -- the primitive Step 2's
// provider factory needs. Walks the dataset, parses each relevant file,
// extracts the collection's rows, and keeps only entries the caller's own
// `membership` predicate accepts. `loadSrd51DatasetEntries` below is this
// function with `isSrd51Entry` as that predicate; a future collection
// (e.g. XPHB, predicate `entry.source === 'XPHB'`) is this function with a
// different predicate, not a new copy of the loop.
//
// 'monsters' is rejected rather than served: this loader extracts ONE key
// per file, so it would silently return stat blocks with no fluff joined --
// a wrong result rather than a failure. loadMonsterDatasetEntries does the
// two-key join instead.
export async function loadDatasetEntries(dataset: DatasetKey, membership: (entry: any) => boolean): Promise<any[]> {
  if (dataset === 'monsters') {
    throw new Error("loadDatasetEntries: 'monsters' requires the bestiary/fluff join -- use loadMonsterDatasetEntries")
  }

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

// ---------------------------------------------------------------------------
// Bestiary (monsters). A real `DatasetKey` -- file location, the Foundry
// exclusion, and key extraction all come from the shared machinery above --
// but NOT a member of `DATASETS`, so no existing provider gains a monsters
// category (see the DatasetKey note at the top of this file).
//
// What monsters genuinely cannot share is the LOADER: descriptions and
// images live in a separate file family (`fluff-bestiary-*.json`, keyed
// `monsterFluff`) from the stat block (`bestiary-*.json`, keyed `monster`),
// joined by (name, source). loadDatasetEntries extracts one key per file
// and so cannot express that join -- which is why it throws for 'monsters'
// and this loader exists instead.

function normalizeSourceCode(value: any): string {
  return String(value || '').trim().toLowerCase()
}

function monsterFluffKey(name: any, source: any): string {
  return `${String(name || '').trim().toLowerCase()}|${normalizeSourceCode(source)}`
}

// Walks every bestiary file exactly once, collecting `monsterFluff` rows
// into a (name, source) map alongside `monster` rows kept by `membership` --
// then joins fluff onto each kept monster as `.fluff` (preview5eToolsMonsters
// already reads `monster.fluff` as its own fallback join, so this requires
// no importer change). The join happens after the full walk completes, so
// file processing order never matters -- a monster's fluff file can be
// walked before OR after its stat-block file.
export async function loadMonsterDatasetEntries(membership: (entry: any) => boolean): Promise<any[]> {
  const files = await walkJsonFiles(DATA_ROOT, 'monsters')
  const fluffByKey = new Map<string, any>()
  const monsters: any[] = []

  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf8')
      const parsed = JSON.parse(raw)

      if (Array.isArray(parsed?.monsterFluff)) {
        for (const fluff of parsed.monsterFluff) {
          if (fluff?.name) {
            fluffByKey.set(monsterFluffKey(fluff.name, fluff.source), fluff)
          }
        }
      }

      if (Array.isArray(parsed?.monster)) {
        monsters.push(...parsed.monster.filter(membership))
      }
    } catch {
      // ignore bad/irrelevant files -- same tolerance loadDatasetEntries has
    }
  }

  return monsters.map((monster) => ({
    ...monster,
    fluff: fluffByKey.get(monsterFluffKey(monster?.name, monster?.source)) ?? monster?.fluff ?? null
  }))
}
