// Content Rules -- the Rules Facet lookup seam.
//
// One entry point, dispatching on the Rules Vocabulary a Content Pack
// declares (`targets.vocabulary`, added in Step 1). This is the exact
// counterpart of app/lib/content-presentation/index.ts's systemKey dispatch,
// and it exists for the same reason: adding a second vocabulary is one line
// here and no change anywhere else.
//
// Vocabulary rather than systemKey is the key on purpose (§9.1): a 2014 and
// a 2024 package are both `dnd5e` and share almost no Definition IDs, so
// systemKey is too coarse to select a facet corpus. An unknown vocabulary
// resolves to no facets rather than throwing -- content targeting a
// vocabulary Eldra has no corpus for still presents, it simply grants
// nothing (§9.3's "every row degrades visibly and none throws").

import { DND5E_2024_RULES_FACETS } from './dnd5e-2024'
import type { RulesFacet, RulesFacetCorpus } from './types'

export type {
  RulesFacet,
  RulesFacetChoice,
  RulesFacetCollectionFields,
  RulesFacetCorpus,
  RulesFacetGrant,
  RulesFacetLiteral
} from './types'

const CORPORA: Record<string, RulesFacetCorpus> = {
  'dnd5e.2024': DND5E_2024_RULES_FACETS
}

// The facet for one content entry, or null when none is authored -- which is
// the common case and a legal one (§8.2 rule 4).
export function findRulesFacet(
  vocabulary: string | undefined,
  entityType: string,
  slug: string
): RulesFacet | null {
  if (!vocabulary) return null

  const corpus = CORPORA[vocabulary]
  if (!corpus) return null

  return corpus[entityType]?.[slug] ?? null
}

export function hasRulesFacetCorpus(vocabulary: string | undefined): boolean {
  return Boolean(vocabulary && CORPORA[vocabulary])
}

// Package Sync Phase 1 -- the whole corpus for one vocabulary, not a single
// entry's lookup. Needed so a compilation fingerprint (server/utils/
// content-sources/compilation-fingerprint.ts) can hash "the entire authored
// RulesFacet corpus this Content Source compiles against" to detect the
// exact staleness case that broke Phase 1B: a facet gained a `progression`
// reference with no change to the underlying 5etools source file. Read-only
// -- returns the same corpus object findRulesFacet already reads from,
// never a copy, so hashing it reflects the exact code currently loaded.
export function getRulesFacetCorpus(vocabulary: string | undefined): RulesFacetCorpus | null {
  if (!vocabulary) return null
  return CORPORA[vocabulary] ?? null
}
