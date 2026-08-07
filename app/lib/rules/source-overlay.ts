// Rules Engine Source Overlay -- types only.
// See .github/docs/architecture/rules-engine.md §16.8 ("Source activation
// and the dynamic overlay") and §16.18 (type contract delta) for the design
// this file's types come from.
//
// REVISION 3 -- COMMIT 2 (Type Contract Delta) scope note: this file exists
// ONLY to hold the two runtime-overlay types §16.18 assigns to it
// (ResolvedSourceInstance, SourceOverlay). It does NOT yet contain
// `buildSourceOverlay(registry, actorState) -> SourceOverlay`, the pure
// builder function §16.8 specifies -- that is explicitly out of scope for
// this commit ("Do not implement Source Overlay [builder]"; "No runtime
// builder"). Introducing the file now, with just its types, is deliberate:
// it is the file a later commit adds the builder to, so that commit is a
// pure addition to an already-reviewed file rather than a new file plus new
// behavior at once.
//
// Until that later commit lands, nothing constructs a SourceOverlay and
// nothing holds one -- EvaluationSession (evaluation-session.ts) is
// unchanged by this commit; §16.8's "held immutably on the session, built
// once at construction" is not yet true of the deployed code.

import type { DefinitionId, RuleValue, RulesError, SourceDefinition, SourceDuration, SourceOrigin } from './types'

// §16.8: one Source instance as the overlay resolves it -- the merge of its
// SourceInstance (actor state), its SourceDefinition (package), and, for a
// collection-item-derived instance, the item's own field values. `itemFields`
// is present only when `origin.kind === 'collection'` (§16.9's `@source:`
// item-field lookups read from here once that commit lands).
export type ResolvedSourceInstance = {
  instanceId: string
  definitionId: DefinitionId
  definition: SourceDefinition
  origin: SourceOrigin
  duration?: SourceDuration
  itemFields?: Record<string, RuleValue>
}

// §16.8: the dynamic overlay's full result. `diagnostics` carries per-
// instance problems the builder finds (e.g. an unresolvable `sourceRef` on
// a collection item) that are not attributable to any one evaluation target
// -- see rules-engine.md §16.11A's stage table, which classifies overlay
// construction as the one ACCUMULATING pipeline stage for exactly this
// reason.
export type SourceOverlay = {
  instances: readonly ResolvedSourceInstance[]
  diagnostics: readonly RulesError[]
}
