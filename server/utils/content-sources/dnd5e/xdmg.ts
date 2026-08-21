// The Dungeon Master's Guide (2024) Source Collection Provider -- the
// architecture's second acceptance test after XPHB (see xphb.ts's own
// header and .github/docs/architecture/content-source-architecture.md
// §12 Step 8). Same claim as XPHB: this file is the entire collection --
// a membership predicate and a category list, handed to the same
// create5eToolsCollectionProvider srd51Provider and xphbProvider already
// use. It does not touch a route, the Builder, or the publisher.
//
// MEMBERSHIP: `source === 'XDMG'`, via the same isEntryFromSource helper
// XPHB uses (source-code, not `edition` -- see 5etools-dataset.ts's own
// note on why `edition` cannot identify a book).
//
// CATEGORIES -- measured against the real dataset (DATA_ROOT), not
// assumed: XDMG populates exactly ONE of the six 5etools-backed
// categories this provider set currently models.
//
//   species      0 entries -- not applicable (XDMG introduces no species)
//   classes      0 entries -- not applicable (XDMG introduces no classes)
//   backgrounds  0 entries -- not applicable (XDMG introduces no backgrounds)
//   feats        0 entries -- not applicable (XDMG introduces no feats)
//   items        593 entries -- parses correctly, unchanged 5etools-items
//                importer, same as SRD 5.1/XPHB (magic items are the
//                Dungeon Master's Guide's actual content: rods, wands,
//                artifacts, etc.)
//   spells       0 entries -- not applicable (XDMG introduces no spells)
//
// This is expected, not a gap: the 2024 Dungeon Master's Guide is DM-facing
// (magic items, treasure, world-building/campaign rules, variant rules) --
// none of the other five categories are "this book's content" the way they
// are for a Player's Handbook. The categories a book doesn't populate are
// never declared here (this task's own IMPLEMENT section: "Do NOT force
// artificial empty categories") -- an XMM-shaped, monsters-only provider
// is the same idea already anticipated by §12 Step 8's own text. A future
// book that legitimately adds e.g. new feats would simply list 'feats'
// among its categories, same as this one lists 'items'.
//
// Non-goal, deliberately not modeled here: XDMG's actual DM-facing rules
// content (traps, hazards, variant rules, campaign-building tables) has no
// category in this provider set at all -- no importer/adapter exists for
// it, and inventing one is out of scope for this acceptance test (this
// task's own NON-GOALS).

import { create5eToolsCollectionProvider } from './5etools-collection'
import { CATEGORY_LABELS, isEntryFromSource } from './5etools-dataset'

const XDMG_CATEGORIES = ['items'] as const

export const xdmgProvider = create5eToolsCollectionProvider({
  collectionKey: 'xdmg',
  label: "Dungeon Master's Guide (2024)",
  membership: isEntryFromSource('XDMG'),
  categories: XDMG_CATEGORIES.map((key) => ({ key, label: CATEGORY_LABELS[key], datasetKey: key }))
})
