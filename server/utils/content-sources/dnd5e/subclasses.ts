// Character Progression Phase 1C -- the Subclass category's own
// `loadCandidates` (the escape hatch 5etools-collection.ts's own header
// describes, the same mechanism xmm.ts already uses for monsters). Needed
// because subclasses require a DIFFERENT membership predicate than every
// other category in the same collection (`classSource`, not `source` --
// see isSubclassFromClassSource's own header for the real dataset
// asymmetry this corrects for) -- the default datasetKey-driven pipeline
// always reuses the PROVIDER's own single `membership` closure, which
// would silently match zero subclasses if reused here unchanged.
//
// `attachRulesFacets` is called explicitly (exported from
// 5etools-collection.ts for exactly this) because the `loadCandidates`
// escape hatch bypasses the default pipeline's own automatic call to it --
// without this, subclass candidates would publish with no RulesFacet ever
// attached, silently losing the one piece of infrastructure this phase
// explicitly requires subclasses be able to carry.
//
// Generic across any class-source book: `sourceCode` is a parameter, never
// hardcoded here. `xphb.ts` is the only current caller and supplies
// 'XPHB', for the identical reason it already hardcodes 'XPHB' in its own
// `membership: isEntryFromSource('XPHB')` -- the provider itself is
// XPHB-specific by design, not this function.

import { loadDatasetEntries, isSubclassFromClassSource } from './5etools-dataset'
import { toContentPublicationCandidates } from '../../content-pack-5etools-adapter'
import { attachRulesFacets } from './5etools-collection'
import { preview5eToolsSubclasses } from '../../../../app/lib/importers/5etools-subclasses'
import type { SourceCategoryLoadResult } from '../types'

export function loadSubclassCandidatesFor(sourceCode: string, vocabulary: string | undefined) {
  // The `membership` parameter (the PROVIDER's own, e.g. `isEntryFromSource('XPHB')`,
  // supplied by 5etools-collection.ts's `loadCategory`) is intentionally
  // unused -- see this file's own header for why subclasses need a
  // DIFFERENT predicate (`isSubclassFromClassSource`), not the provider's.
  return async function loadSubclassCandidates(_membership: (entry: any) => boolean): Promise<SourceCategoryLoadResult> {
    const rows = await loadDatasetEntries('subclasses', isSubclassFromClassSource(sourceCode))
    const preview = preview5eToolsSubclasses(rows)
    const candidates = attachRulesFacets(toContentPublicationCandidates(preview), vocabulary)
    return { candidates, warnings: preview.warnings }
  }
}
