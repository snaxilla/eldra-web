// Rules Engine Source Overlay.
// See .github/docs/architecture/rules-engine.md §16.8 ("Source activation
// and the dynamic overlay") and §16.18 (type contract delta) for the design
// this file implements.
//
// REVISION 3 -- COMMIT 2 introduced this file with only its two runtime-
// overlay types (ResolvedSourceInstance, SourceOverlay), deliberately
// without `buildSourceOverlay` ("Do not implement Source Overlay [builder]").
//
// REVISION 3 -- COMMIT 4 (this commit) adds that builder. §16.8 assigns it
// exactly one job: "the overlay is built by a dedicated pure function,
// buildSourceOverlay(registry, actorState) -> SourceOverlay." This module
// performs NO evaluation, NO @source: field resolution (§16.9 -- a later
// commit; this module only stores an item's raw field values on
// `itemFields` for that commit to read), NO modifier discovery, NO
// modifier attachment resolution (§16.10), NO stacking, and NO cache
// invalidation. It answers exactly one question: "which Source instances
// are active on this ActorState, and where did each one come from?"
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. Both V1 activation paths (§16.8) converge into one accumulating
//    builder. Path 1 (`ActorState.sources`) and Path 2 (collection items
//    via `CollectionDefinition.sourceRefField`) are resolved by the same
//    logic (resolveSourceRef below) so "does this sourceRef name a real
//    SourceDefinition" is answered identically regardless of which path
//    produced it -- there is no reason for the two paths to disagree about
//    what counts as a valid Source reference.
//
// 2. Diagnostics accumulate for BOTH paths, not just collection items.
//    rules-engine.md §16.11A's stage table describes overlay construction
//    as "the one accumulating stage" using a collection-item example, but
//    states no path-specific exception -- and there is no principled reason
//    a stale/dangling `ActorState.sources[].sourceRef` should be silently
//    dropped while the identical problem on a collection item is reported.
//    (This intentionally goes further than modifier-pipeline.ts's existing,
//    UNTOUCHED `resolveActiveSources`, which still silently skips an
//    unresolvable declared sourceRef -- that function is out of this
//    commit's scope per the NON-GOALS list, and continues to run
//    independently of this overlay until a later commit wires the pipeline
//    to consume SourceOverlay instead of ActorState.sources directly.)
//
// 3. Two diagnostic categories, matching the task's own two named examples:
//    "missing" (the value names a DefinitionId that does not exist in the
//    registry) and "malformed" (the value exists but is not a Source
//    Definition, or -- collection items only, since CollectionInstanceItem
//    is an open/untyped shape -- is not even a string). An ABSENT field
//    (undefined/null, or the collection declares no `sourceRefField` at
//    all) is not a diagnostic: it is the ordinary, expected shape of an
//    item that simply does not carry a Source (a mundane inventory item
//    like "rope"). Reserved as `RulesError.reason` strings
//    (`source-overlay-missing-target` / `source-overlay-malformed-source-ref`)
//    rather than `RulesError.code`: `RulesErrorCode` (types.ts) is the
//    closed union revision 3's type-contract commit (Commit 2) introduced,
//    and its own comment states it holds "the closed set of stable error
//    codes THIS REVISION introduces" -- but it does not include a code for
//    overlay-construction diagnostics, which were not anticipated until
//    this commit actually implemented the builder. Widening that closed
//    union is a type-contract change outside this commit's stated scope
//    ("Implement: app/lib/rules/source-overlay.ts"), so `.reason` (already
//    an open `string` field) is used instead -- flagged in the commit
//    Summary as a gap in the approved type contract, not silently patched.
//
// 4. Ordering is deterministic by construction, not by any array's
//    incidental JS iteration order. Declared instances are emitted in
//    `ActorState.sources`' own stored array order (already a plain array,
//    not a keyed structure with its own iteration-order concerns).
//    Collection-derived instances are emitted by iterating COLLECTIONS in
//    `registry.listByKind('collection')` order -- the registry's Map is
//    itself built from the package's own Definition list in the order that
//    list was authored (registry.ts), the same "authoring order is
//    deterministic" principle dependency-graph.ts and cycle-detection.ts
//    already rely on -- rather than `Object.keys(actorState.collections)`,
//    a Record whose key order is real but incidental, never a stated
//    architectural guarantee. Within one collection, items are emitted in
//    that collection's own stored array order. Declared instances precede
//    collection-derived instances overall, mirroring §16.8's own "Path 1...
//    Path 2" prose ordering -- the architecture states no single sentence
//    combining the two paths into one order, so this is the most directly
//    textually-grounded choice available, not an arbitrary pick.

import type {
  ActorState,
  CollectionInstanceItem,
  DefinitionId,
  RuleValue,
  RulesError,
  SourceDefinition,
  SourceDuration,
  SourceOrigin
} from './types'
import type { RulesRegistry } from './registry'

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MISSING_TARGET_REASON = 'source-overlay-missing-target'
const MALFORMED_SOURCE_REF_REASON = 'source-overlay-malformed-source-ref'

// Builds the dynamic overlay (§16.8, §15.1) from a package's Registry and
// one Actor's stored state. Pure: no side effects, no caching, and calling
// it twice with the same (registry, actorState) always returns an equal
// result (see design decision 4 above for exactly what "equal" means
// here -- ordering is deterministic, not incidental).
export function buildSourceOverlay(registry: RulesRegistry, actorState: ActorState): SourceOverlay {
  const instances: ResolvedSourceInstance[] = []
  const diagnostics: RulesError[] = []

  collectDeclaredInstances(registry, actorState, instances, diagnostics)
  collectCollectionDerivedInstances(registry, actorState, instances, diagnostics)

  return {
    instances: Object.freeze(instances),
    diagnostics: Object.freeze(diagnostics)
  }
}

// ---------------------------------------------------------------------------
// Path 1 -- declared instances (§16.8)
// ---------------------------------------------------------------------------

function collectDeclaredInstances(
  registry: RulesRegistry,
  actorState: ActorState,
  instances: ResolvedSourceInstance[],
  diagnostics: RulesError[]
): void {
  for (const instance of actorState.sources) {
    const definition = resolveSourceDefinition(registry, instance.sourceRef, diagnostics, {
      definitionId: instance.sourceRef,
      describeSubject: `Source instance '${instance.instanceId}' in ActorState.sources`
    })
    if (!definition) continue

    instances.push({
      instanceId: instance.instanceId,
      definitionId: instance.sourceRef,
      definition,
      // §16.8: "absent in stored state = 'declared'" -- but a declared
      // instance's own `origin`, if one happens to be stored, is trusted
      // as-is rather than overwritten; only its absence is defaulted.
      origin: instance.origin ?? { kind: 'declared' },
      duration: instance.duration
    })
  }
}

// ---------------------------------------------------------------------------
// Path 2 -- collection-derived instances (§16.8)
// ---------------------------------------------------------------------------

function collectCollectionDerivedInstances(
  registry: RulesRegistry,
  actorState: ActorState,
  instances: ResolvedSourceInstance[],
  diagnostics: RulesError[]
): void {
  for (const definition of registry.listByKind('collection')) {
    if (definition.kind !== 'collection') continue // narrows for TS; listByKind itself already filters
    const sourceRefField = definition.sourceRefField
    if (!sourceRefField) continue // this collection does not carry Sources at all

    const items = actorState.collections[definition.id] ?? []
    for (const item of items) {
      collectOneItemInstance(registry, definition.id, sourceRefField, item, instances, diagnostics)
    }
  }
}

function collectOneItemInstance(
  registry: RulesRegistry,
  collectionId: DefinitionId,
  sourceRefField: string,
  item: CollectionInstanceItem,
  instances: ResolvedSourceInstance[],
  diagnostics: RulesError[]
): void {
  const raw: unknown = item[sourceRefField]

  // Absent (undefined/null) is the ordinary, expected shape of an item
  // that simply is not Source-carrying (§16.8: "Every item whose
  // sourceRefField resolves to a real SourceDefinition instantiates a
  // Source instance" -- one that resolves to nothing is not such an item,
  // silently). No diagnostic, no instance.
  if (raw === undefined || raw === null) return

  if (typeof raw !== 'string') {
    diagnostics.push({
      definitionId: collectionId,
      message:
        `Collection '${collectionId}' item '${item.instanceId}' has a non-text '${sourceRefField}' value ` +
        `(got '${typeof raw}'), expected a Source DefinitionId`,
      reason: MALFORMED_SOURCE_REF_REASON
    })
    return
  }

  const definition = resolveSourceDefinition(registry, raw, diagnostics, {
    definitionId: collectionId,
    describeSubject: `Collection '${collectionId}' item '${item.instanceId}' (field '${sourceRefField}')`
  })
  if (!definition) return

  const itemFields: Record<string, RuleValue> = {}
  for (const [key, value] of Object.entries(item)) {
    if (key === 'instanceId') continue // already surfaced as ResolvedSourceInstance.instanceId
    itemFields[key] = value as RuleValue
  }

  instances.push({
    instanceId: item.instanceId,
    definitionId: raw,
    definition,
    origin: { kind: 'collection', collectionId, itemInstanceId: item.instanceId },
    itemFields
  })
}

// ---------------------------------------------------------------------------
// Shared resolution (design decision 1 above)
// ---------------------------------------------------------------------------

type ResolveOptions = {
  definitionId: DefinitionId
  describeSubject: string
}

// Resolves `sourceRef` against the registry, accumulating one of the two
// diagnostic categories (design decision 3 above) on failure rather than
// throwing or aborting the whole overlay. Returns the resolved
// SourceDefinition on success, or undefined -- callers skip producing an
// instance in that case; they never invent a placeholder.
function resolveSourceDefinition(
  registry: RulesRegistry,
  sourceRef: DefinitionId,
  diagnostics: RulesError[],
  options: ResolveOptions
): SourceDefinition | undefined {
  const definition = registry.getById(sourceRef)

  if (!definition) {
    diagnostics.push({
      definitionId: options.definitionId,
      message: `${options.describeSubject} references '${sourceRef}', which does not exist in the registry`,
      reason: MISSING_TARGET_REASON
    })
    return undefined
  }

  if (definition.kind !== 'source') {
    diagnostics.push({
      definitionId: options.definitionId,
      message: `${options.describeSubject} references '${sourceRef}', which is a '${definition.kind}' Definition, not a Source`,
      reason: MALFORMED_SOURCE_REF_REASON
    })
    return undefined
  }

  return definition
}
