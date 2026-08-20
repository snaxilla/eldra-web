// The Player's Handbook (2024) Source Collection Provider -- the
// architectural acceptance test for
// .github/docs/architecture/content-source-architecture.md's provider
// abstraction (§12 Step 8: "One registry entry, one provider. If this step
// touches a route, the Builder, or the publisher, stop and fix the
// architecture instead.").
//
// It does not touch a route, the Builder, or the publisher. The entire
// collection is this file: a membership predicate and a category list,
// handed to the same create5eToolsCollectionProvider srd51Provider already
// uses. Dataset traversal, importer wiring, adapter invocation, preview
// shaping, publish orchestration, availability derivation, and both
// generic routes are all reused unchanged.
//
// MEMBERSHIP: `source === 'XPHB'`, exactly as the architecture doc's §5.3
// predicted. See isEntryFromSource in 5etools-dataset.ts for why this is
// keyed on `source` rather than `edition: 'one'` -- measured against the
// real dataset, `edition` is absent on XPHB feats, spells, and most items,
// so it identifies a ruleset revision rather than a book.
//
// CATEGORIES: the same six 5etools datasets SRD 5.1 uses, in the same
// order. XPHB genuinely populates all six (unlike a future XMM, which
// would be monsters-only) so no category list narrowing is needed here --
// and per this task's own NON-GOALS, provider-declared dynamic categories
// in the Builder remain Step 6 work, untouched.

import { create5eToolsCollectionProvider } from './5etools-collection'
import { CATEGORY_LABELS, DATASETS, isEntryFromSource } from './5etools-dataset'

export const xphbProvider = create5eToolsCollectionProvider({
  collectionKey: 'xphb',
  label: "Player's Handbook (2024)",
  membership: isEntryFromSource('XPHB'),
  categories: DATASETS.map((key) => ({ key, label: CATEGORY_LABELS[key], datasetKey: key }))
})
