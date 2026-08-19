// The SRD 5.1 Source Collection Provider -- the first (and, per this
// step's own scope, only) implementation of SourceCollectionProvider.
// See .github/docs/architecture/content-source-architecture.md's §9 for
// why this is the collection to prove the provider abstraction against:
// its parsers already work, so this step is purely about the provider
// contract, not about any new game-content shape work.
//
// `isSrd51Entry`, `DATASETS`, and `CATEGORY_LABELS` are reused verbatim
// from 5etools-dataset.ts rather than re-derived here -- the membership
// predicate and the six-category order/labels are exactly what they were
// before this step; nothing about SRD 5.1's own selection rules changes.

import { create5eToolsCollectionProvider } from './5etools-collection'
import { CATEGORY_LABELS, DATASETS, isSrd51Entry } from './5etools-dataset'

export const srd51Provider = create5eToolsCollectionProvider({
  collectionKey: 'srd-5.1',
  label: 'SRD 5.1',
  membership: isSrd51Entry,
  categories: DATASETS.map((key) => ({ key, label: CATEGORY_LABELS[key], datasetKey: key }))
})
