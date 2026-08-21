// The Monster Manual (2025) Source Collection Provider -- the architecture's
// third acceptance test after XPHB and XDMG (see xphb.ts's own header and
// .github/docs/architecture/content-source-architecture.md §12 Step 8), and
// specifically the test for Monster Content Publication
// (content-pack-monsters-adapter.ts, loadMonsterDatasetEntries): this is
// the first collection to actually declare a monsters category, proving
// that infrastructure integrates exactly like every other category rather
// than needing its own route, Builder, or publisher path.
//
// It does not touch a route, the Builder, or the publisher. The entire
// collection is this file: a membership predicate and one category, handed
// to the same create5eToolsCollectionProvider srd51Provider/xphbProvider/
// xdmgProvider already use.
//
// MEMBERSHIP: `source === 'XMM'`, via the same isEntryFromSource helper
// every other 2024-and-later collection uses.
//
// CATEGORIES: 'monsters' only -- the Monster Manual's entire content, same
// posture as xdmg.ts's single-category 'items' list (a book declares only
// the categories it genuinely populates; see that file's own note on why
// forcing five artificial empty categories would be wrong). Unlike the six
// species/classes/backgrounds/feats/items/spells categories, 'monsters'
// cannot flow through create5eToolsCollectionProvider's default
// datasetKey-driven pipeline (preview5eToolsMonsters returns a bespoke
// shape, and its content is joined from two file families) -- so this
// category supplies `loadCandidates` instead of `datasetKey`, the escape
// hatch 5etools-collection.ts's own header describes. No provider factory
// change was needed to add it; the hook already existed.

import { create5eToolsCollectionProvider } from './5etools-collection'
import { isEntryFromSource, loadMonsterDatasetEntries } from './5etools-dataset'
import { toMonsterContentPublicationCandidates } from '../../content-pack-monsters-adapter'
import type { SourceCategoryLoadResult } from '../types'

async function loadMonsterCandidates(membership: (entry: any) => boolean): Promise<SourceCategoryLoadResult> {
  const rows = await loadMonsterDatasetEntries(membership)
  return toMonsterContentPublicationCandidates(rows)
}

export const xmmProvider = create5eToolsCollectionProvider({
  collectionKey: 'xmm',
  label: 'Monster Manual (2025)',
  membership: isEntryFromSource('XMM'),
  categories: [
    { key: 'monsters', label: 'Monsters', loadCandidates: loadMonsterCandidates }
  ]
})
