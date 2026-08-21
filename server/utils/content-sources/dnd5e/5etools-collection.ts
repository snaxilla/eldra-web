// The 5etools Source Collection Provider factory -- Step 2 of
// .github/docs/architecture/content-source-architecture.md's Recommended
// Implementation Sequence (§12), designed in that document's §5.3.
//
// This is the piece that actually makes a 5etools dataset collection
// (SRD 5.1 today; a future XPHB, XDMG, XMM would each be one more call to
// this same factory -- see that document's §9 for why routing is free but
// XPHB's shape work is not, and this step implements NEITHER XPHB nor any
// other new collection) satisfy SourceCollectionProvider. It composes
// entirely out of 5etools-dataset.ts's primitives (DATA_ROOT,
// loadDatasetEntries, getPreviewFn) plus the existing publication adapter
// (content-pack-5etools-adapter.ts) -- nothing here re-implements dataset
// traversal or importer wiring a second time.
//
// The per-collection difference this factory takes as input is exactly
// what the architecture doc's §2.3 established must be entry-level, never
// file-name-based: a `membership` predicate. SRD 5.1's predicate is
// `isSrd51Entry` (`entry.srd` truthy); a future XPHB provider's would be
// `entry.source === 'XPHB'`. Everything else -- walking files, extracting
// rows, running the right preview parser, adapting into
// ContentPublicationCandidate[] -- is identical regardless of which
// predicate is passed in.
//
// ESCAPE HATCH -- `loadCandidates` (optional, per category): every category
// so far (species/classes/backgrounds/feats/items/spells, across three
// collections) shares one importer output contract
// (EldraImportPreviewResult) and flows through the default
// loadDatasetEntries -> getPreviewFn -> toContentPublicationCandidates
// pipeline below unchanged. Monsters do not: preview5eToolsMonsters returns
// a bespoke shape with no `externalId`, and its content is joined from TWO
// file families (bestiary stat blocks + fluff), which loadDatasetEntries's
// single-array-per-file extraction cannot express (see
// 5etools-dataset.ts's own "Bestiary (monsters)" section and
// content-pack-monsters-adapter.ts). Rather than force monsters through a
// pipeline built for a different shape, or fork a second provider factory
// (duplicating everything this one already does), a category may supply
// `loadCandidates` to REPLACE the three default steps for itself alone --
// every other category on every existing provider is unaffected, since
// this is purely additive to FiveEToolsCategoryDefinition.

import { readdir } from 'node:fs/promises'

import { toContentPublicationCandidates } from '../../content-pack-5etools-adapter'
import type { SourceAvailability, SourceCategory, SourceCategoryLoadResult, SourceCollectionProvider } from '../types'
import { DATA_ROOT, getPreviewFn, loadDatasetEntries, type DatasetKey } from './5etools-dataset'

type FiveEToolsCategoryDefinition = {
  key: string
  label: string
  datasetKey?: DatasetKey
  // See this file's header ESCAPE HATCH note. When present, this replaces
  // loadDatasetEntries/getPreviewFn/toContentPublicationCandidates for this
  // one category; `datasetKey` is not read.
  loadCandidates?: (membership: (entry: any) => boolean) => Promise<SourceCategoryLoadResult>
}

export type FiveEToolsCollectionInput = {
  collectionKey: string
  // Human name of the collection (e.g. "SRD 5.1"), used only to compose
  // the dataset-missing message -- never surfaced as a route/response
  // shape decision, which stays with the caller per this module's own
  // header.
  label: string
  membership: (entry: any) => boolean
  categories: readonly FiveEToolsCategoryDefinition[]
}

export function create5eToolsCollectionProvider(input: FiveEToolsCollectionInput): SourceCollectionProvider {
  const categoriesByKey = new Map(input.categories.map((category) => [category.key, category]))

  // Same reachability check preview/srd-5-1.get.ts made inline (a bare
  // `readdir(DATA_ROOT)`) before this step -- dataset access, so it
  // belongs to the provider now, not the route.
  async function checkAvailability(): Promise<SourceAvailability> {
    try {
      await readdir(DATA_ROOT)
      return { available: true }
    } catch {
      return {
        available: false,
        reason: 'dataset-missing',
        message: `The 5etools ${input.label} dataset is not available on this server. Nothing can be previewed until it is installed.`
      }
    }
  }

  async function loadCategory(categoryKey: string): Promise<SourceCategoryLoadResult> {
    const category = categoriesByKey.get(categoryKey)
    if (!category) {
      throw new Error(`Unknown category '${categoryKey}' for content source '${input.collectionKey}'`)
    }

    if (category.loadCandidates) {
      return category.loadCandidates(input.membership)
    }

    if (!category.datasetKey) {
      throw new Error(`Category '${categoryKey}' for content source '${input.collectionKey}' has neither datasetKey nor loadCandidates`)
    }

    const rows = await loadDatasetEntries(category.datasetKey, input.membership)
    const preview = getPreviewFn(category.datasetKey)(rows)
    const candidates = toContentPublicationCandidates(preview)

    return { candidates, warnings: preview.warnings }
  }

  const categories: readonly SourceCategory[] = input.categories.map((category) => ({ key: category.key, label: category.label }))

  return {
    gameSystemKey: 'dnd5e',
    collectionKey: input.collectionKey,
    adapterId: '5etools-json',
    categories,
    checkAvailability,
    loadCategory
  }
}
