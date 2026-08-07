// Rules Engine Evaluation Session.
// See .github/docs/architecture/rules-engine.md §15.2 (evaluation), §15.4
// (memoization boundaries), §15.5 (traces), §15.6 (evaluation context),
// and §14.8 (cycles -- both the static and dynamic halves) for the design
// this implements.
//
// This is NOT the Evaluator. It performs NO arithmetic, NO evaluation, NO
// graph traversal, NO dependency scheduling, and NO cache-invalidation
// logic. It is the runtime state container a future Evaluator will be a
// pure consumer of: an immutable Registry/Graph reference, one fixed
// ActorState/EvaluationContext pairing, a memo cache, trace storage, a
// runtime visit stack, and a diagnostics accumulator. Every method here is
// mechanical storage -- get/set/push/pop -- with zero decision-making about
// *when* to call them. That decision belongs entirely to the Evaluator,
// which does not exist yet.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. Memo cache keying: DefinitionId only, not §15.4's full
//    `(actorStateVersion, contextHash)`. §15.4 describes a cache that
//    outlives any one evaluation and must distinguish reads made under
//    different states/contexts. This task's own RESPONSIBILITY list names
//    ActorState and EvaluationContext as singular, session-owned fields --
//    one fixed snapshot and one fixed context per EvaluationSession, not a
//    collection of them. Every value memoized inside one session is
//    therefore already implicitly "under this session's one context";
//    there is nothing for a second cache-key dimension to disambiguate
//    *within* a session. Cross-session/cross-context cache reuse (the
//    actual subject of §15.4's compound key) is real future work, but it
//    is cache-*invalidation*-adjacent infrastructure this task explicitly
//    excludes ("Do not compute cache invalidation"), not something to
//    half-build here by guessing at a hashing scheme.
//
// 2. `registry`/`graph` are plain `readonly` fields, not private-plus-
//    getter. Both RulesRegistry and DependencyGraph are themselves already
//    fully immutable once constructed (no mutating method exists on
//    either) -- so "immutable Registry reference" / "immutable Graph
//    reference" is fully satisfied by preventing *reassignment* of the
//    session's own field (what `readonly` does), with no additional
//    wrapping needed to prevent mutation *through* the reference, because
//    no such mutation path exists on either type.
//
// 3. `actorState`/`context` are also plain `readonly` fields, but
//    deliberately NOT frozen or defensively copied. Unlike Registry/Graph,
//    this task's IMPLEMENTATION section names immutability explicitly only
//    for the Registry and Graph references -- ActorState (types.ts) is an
//    ordinary mutable record shape with no immutability claim anywhere in
//    the architecture, and freezing it here would be inventing a guarantee
//    this task never asked for. The session guarantees it will not swap
//    out *which* ActorState/EvaluationContext it holds; it makes no claim
//    about their internal contents staying fixed.
//
// 4. Constructor is public, not a private-constructor-plus-static-factory
//    (unlike RulesRegistry.create / DependencyGraph.build). Those two use
//    that pattern because construction can fail and needs a Result type
//    (duplicate ids, unresolved dependencies). Wiring four already-valid,
//    already-constructed things together cannot fail -- there is no
//    precondition to check -- so the extra ceremony has no payoff here.
//
// 5. `tracingEnabled` is a plain mutable field, not fixed at construction.
//    §15.5: tracing is "off by default," and `explain(path)` "re-runs just
//    that subgraph with tracing on" -- described as a mode toggled around
//    a specific, targeted re-run, not a property fixed for a session's
//    whole lifetime. Toggling a stored flag is itself just state, not
//    evaluation.
//
// 6. The visit stack is an ordered array, not a bare Set, and
//    `isVisiting`/`pushVisit`/`popVisit` are the whole API -- there is no
//    method that detects or reacts to a cycle. §14.8: "Dynamic cycles...
//    are caught at runtime by a visit-set guard" -- the guard is the
//    Evaluator's logic (check `isVisiting(id)` before pushing, decide what
//    "error + trace naming the cycle" means), not this session's. Ordered,
//    rather than a plain Set, only so that the same "the cycle is the
//    stack suffix from the repeated id onward" technique already used by
//    the static detector (cycle-detection.ts) is available to the
//    Evaluator later without this session inventing a second
//    representation. This is explicitly runtime/dynamic cycle support ONLY
//    -- it does not replace, duplicate, or re-run the already-completed
//    static cycle detector (cycle-detection.ts), which operates once,
//    ahead of time, over the whole package's DependencyGraph; this stack
//    only ever reflects whichever single evaluation chain is currently
//    in progress for one read.
//
// 7. REVISION 3 -- COMMIT 4 (§16.8): `sourceOverlay` is a `readonly`
//    field, built by calling `buildSourceOverlay(registry, actorState)`
//    exactly once, here in the constructor -- never lazily, never
//    recomputed. This is precisely the one documented step §16.8 assigns
//    this class ("EvaluationSession's role widens by exactly one
//    documented step: it calls buildSourceOverlay once at construction. It
//    gains no other computation."), and mirrors design decision 2 above:
//    `SourceOverlay` (source-overlay.ts) is itself fully immutable once
//    built (its arrays are frozen), so a plain `readonly` field is
//    sufficient -- no wrapping needed to prevent mutation through the
//    reference. Nothing in this class yet CONSUMES the overlay (modifier
//    discovery, §source: resolution, and cache invalidation on an item-
//    field edit are all later commits, per this commit's own NON-GOALS);
//    it is stored so those commits have a session-owned artifact to read
//    rather than each recomputing their own.

import type { DependencyGraph } from './dependency-graph'
import type { RulesRegistry } from './registry'
import { buildSourceOverlay, type SourceOverlay } from './source-overlay'
import type { ActorState, DefinitionId, EvaluationContext, RuleValue, RulesError, Trace } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EvaluationSessionOptions = {
  tracingEnabled?: boolean
}

// Owns every piece of runtime state one evaluation run needs (§15.2-§15.6)
// without performing any evaluation itself. See design decisions above for
// why each field is shaped the way it is.
export class EvaluationSession {
  readonly registry: RulesRegistry
  readonly graph: DependencyGraph
  readonly actorState: ActorState
  readonly context: EvaluationContext
  // §16.8 (revision 3, Commit 4) -- see design decision 7 above.
  readonly sourceOverlay: SourceOverlay

  // §15.5: "Off by default." Mutable -- see design decision 5.
  tracingEnabled: boolean

  private readonly cache = new Map<DefinitionId, RuleValue>()
  private readonly traces = new Map<DefinitionId, Trace>()
  private readonly visitStack: DefinitionId[] = []
  private readonly diagnostics: RulesError[] = []

  constructor(
    registry: RulesRegistry,
    graph: DependencyGraph,
    actorState: ActorState,
    context: EvaluationContext,
    options: EvaluationSessionOptions = {}
  ) {
    this.registry = registry
    this.graph = graph
    this.actorState = actorState
    this.context = context
    this.sourceOverlay = buildSourceOverlay(registry, actorState)
    this.tracingEnabled = options.tracingEnabled ?? false
  }

  // ---------------------------------------------------------------------
  // Memo cache (§15.2, §15.4) -- storage only. Deciding whether a cached
  // entry is still valid, and marking transitive dependents dirty on a
  // write, is cache-invalidation logic the Evaluator owns, not this class.
  // ---------------------------------------------------------------------

  hasCached(id: DefinitionId): boolean {
    return this.cache.has(id)
  }

  getCached(id: DefinitionId): RuleValue | undefined {
    return this.cache.get(id)
  }

  setCached(id: DefinitionId, value: RuleValue): void {
    this.cache.set(id, value)
  }

  // A mechanical single-entry removal primitive -- not cache invalidation
  // (which would mean computing *which* entries a change affects). The
  // Evaluator decides which ids to invalidate and calls this once per id.
  invalidateCached(id: DefinitionId): void {
    this.cache.delete(id)
  }

  // ---------------------------------------------------------------------
  // Trace storage (§15.5) -- storage only, keyed like Trace.path itself.
  // ---------------------------------------------------------------------

  getTrace(id: DefinitionId): Trace | undefined {
    return this.traces.get(id)
  }

  setTrace(id: DefinitionId, trace: Trace): void {
    this.traces.set(id, trace)
  }

  // ---------------------------------------------------------------------
  // Runtime visit stack (§14.8's dynamic-cycle guard support -- see design
  // decision 6). Purely mechanical: this class never inspects its own
  // stack to detect anything.
  // ---------------------------------------------------------------------

  isVisiting(id: DefinitionId): boolean {
    return this.visitStack.includes(id)
  }

  pushVisit(id: DefinitionId): void {
    this.visitStack.push(id)
  }

  popVisit(): DefinitionId | undefined {
    return this.visitStack.pop()
  }

  // The current in-progress evaluation chain, outermost first -- exactly
  // the recursion-stack slice cycle-detection.ts's static DFS already uses
  // to build a readable path, available here for the Evaluator to do the
  // same for a dynamic cycle.
  getVisitPath(): readonly DefinitionId[] {
    return Object.freeze([...this.visitStack])
  }

  // ---------------------------------------------------------------------
  // Diagnostics accumulator -- a running log of RulesErrors encountered
  // during this session's lifetime (e.g. a dynamic cycle, once the
  // Evaluator decides one occurred and constructs the error). Distinct
  // from a single Definition's cached error-shaped RuleValue: this is the
  // session-wide "everything that went wrong" list.
  // ---------------------------------------------------------------------

  addDiagnostic(error: RulesError): void {
    this.diagnostics.push(error)
  }

  getDiagnostics(): readonly RulesError[] {
    return Object.freeze([...this.diagnostics])
  }
}
