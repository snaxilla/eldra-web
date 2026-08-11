// Rules Engine Evaluator (core).
// See .github/docs/architecture/rules-engine.md §15.2 (evaluation),
// §14.3-§14.6 (type system, error behavior, function whitelist, dice), and
// §14.8 (cycles) for the design this implements.
//
// This module produces a RuleValue for a DefinitionId: lazily, recursively,
// memoized, pull-based, using an EvaluationSession for all runtime state.
// It does NOT execute Actions or Rolls, does NOT mutate Resources, does NOT
// schedule or batch-evaluate, and does NOT compute cache invalidation.
//
// A Value's result is its base (formula, or stored/default) with §16.4's
// fixed Modifier phase pipeline applied on top. Discovering, suppressing,
// gating, and ordering those Modifiers belongs entirely to
// modifier-pipeline.ts -- this module only applies the ordered sequence
// that module returns (see applyModifiers below, including the two phases
// applied under documented interpretations).
//
// REVISION 3 (§16.11A, ADR-022): resolveActiveModifiers can now return a
// RulesError instead of a sequence, meaning gating itself failed rather
// than resolved to "nothing applies." applyModifiers propagates that error
// exactly like any other.
//
// REVISION 3 -- COMMIT 6 (§16.9): `@source:` runtime resolution.
// evaluateReference now handles `namespace === 'source'` (see
// evaluateSourceReference below) instead of folding it into design
// decision 2's "not resolvable" fallback -- it is the seventh namespace's
// only member with an actual runtime binding to resolve against outside
// the registry-backed `value`/`collection` pair. That binding -- a
// `ResolvedSourceInstance` -- is threaded through the whole recursive
// descent (every `evaluate*` function below gains a `sourceBinding`
// parameter) rather than looked up fresh at each reference, because it is
// unambiguous and fixed for the ENTIRE evaluation of one Modifier's
// `value`/`condition`: exactly one Source instance activated that
// Modifier (§16.1's invariant), so there is exactly one binding for every
// `@source:` reference anywhere inside that expression tree, however
// deeply nested. Introduced at exactly the two places §16.9 says
// `@source:` is legal (modifierValue, and applyModifiers' condition
// callback) and nowhere else -- every other call path leaves it
// `undefined`, which IS this module's enforcement of §16.9's lexical
// scope: "the evaluator may defensively return RulesError if the binding
// is absent" (this task's own instruction) rather than duplicating
// Reference Validation's ahead-of-time AST-position check.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS AND GAPS FOUND (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. Per-Definition-kind evaluation, given no action/roll execution exists
//    yet:
//      - ValueDefinition (storage:'stored'): read ActorState.values[id];
//        fall back to `default`; fall back further to §14.4's "every value
//        has a type-appropriate zero." Modifiers then apply on top.
//      - ValueDefinition (storage:'derived'): evaluate `formula`'s AST to
//        get the base, then apply Modifiers. No formula present is a
//        malformed-package condition (nothing to derive from) ->
//        RulesError, not a zero-fallback.
//      - ResourceDefinition: evaluates `max` (its one Expression|RuleValue
//        field). §12.5's "expands into two Values... a resourceOf
//        back-link" is the LOADER's job (no loader exists -- explicit
//        non-goal elsewhere); there is no modeled "current" value to
//        evaluate separately without it. Flagged, not invented.
//      - RollSpec: evaluates `dice` (constructs a diceSpec -- §14.6 is
//        explicit this is NOT "roll execution," which requires a seed and
//        the not-yet-built Roll Engine).
//      - CollectionDefinition, ModifierDefinition (standalone),
//        SourceDefinition, ActionDefinition: none has a single scalar
//        RuleValueType a bare `evaluate(id)` could sensibly produce (the
//        same gap type-validation.ts already found and reported via
//        'unknown-return-type' for bare @collection:/@source-adjacent
//        references) -- evaluating one directly returns a RulesError
//        rather than inventing a representation. Collections ARE
//        evaluable through a CollectionExpressionNode (decision 3 below);
//        this only concerns evaluating one by bare DefinitionId.
//
// 2. Reference namespaces: only 'value' and 'collection' recurse through
//    `evaluate()` (the registry-backed namespaces, matching reference-
//    validation.ts's and type-validation.ts's own established boundary).
//    'sources', 'ctx', and 'choice' produce a RulesError rather than a
//    real lookup, even though ActorState.choices is a concretely populated
//    field that COULD be read. Two namespaces are exceptions: 'source'
//    (singular), as of revision 3 Commit 6 -- see evaluateSourceReference
//    and the file-header note above -- and 'world', as of World
//    Configuration Commit 1 (see decision 8 below).
//    Investigated and deliberately not wired up for the remaining three:
//    (a) EvaluationContext (types.ts) has no open field @ctx:x's arbitrary
//    named lookups could resolve against -- its shape is closed
//    (`purpose?/actors?/world?/tags?/seed?`); (b) ActorStateRef is typed
//    `Record<string, any>` specifically because types.ts's own comment
//    says it is an "opaque record pending that decision"; (c)
//    ActorState.choices is keyed by DefinitionId, but ChoiceSet itself is
//    unmodeled, so what a valid choice key even looks like is equally
//    undecided. Guessing any of these would risk silently computing a
//    wrong number a player would see -- worse than a clear, explained
//    error.
//
// 3. Collection expressions ARE evaluated (sum/count/any, fully;
//    max_of/min_of, fully) by resolving the source's actual runtime items
//    (CollectionDefinition.itemSchema + ActorState.collections) and
//    applying the predicate/aggregate per item, reusing the exact
//    text-literal-as-item-field-reference resolution rule type-
//    validation.ts already established (§8.8-§8.9 of expression-
//    language.md) -- now resolving to the item's actual stored value
//    rather than its declared type. `all`/`first`/`filter` are NOT
//    evaluated: `first`/`filter` because their result (an item / a
//    sub-collection) is not RuleValue-shaped, same as type-validation.ts's
//    finding; `all` because expression-language.md never resolves how its
//    predicate/aggregate combine (type-validation.ts already flagged this
//    exact ambiguity and declined to enforce an arity rule for it) -- an
//    evaluator is the wrong place to silently pick one reading when doing
//    so could produce a materially wrong number. All four still resolve
//    their `source` (registry.has checks etc. are Reference Validation's
//    job, already run) far enough to report a clear, specific RulesError
//    rather than a generic one.
//
// 4. `lookup(table:x, key)` is not evaluated -- Table remains entirely
//    unmodeled (same gap type-validation.ts already reported), so there is
//    no schema to resolve a result against. Returns a RulesError; `key` is
//    still evaluated first so any error inside it surfaces rather than
//    being masked.
//
// 5. Runtime cycle detection uses EvaluationSession's visit stack
//    (evaluation-session.ts), never the static detector
//    (cycle-detection.ts) -- a fresh Map/array per session, checked and
//    pushed to on every `evaluate()` call, exactly as that module's own
//    header documents it exists for. A detected cycle produces a
//    RulesError that is NEVER cached (design decision 6) and is otherwise
//    treated like any other evaluation error (propagates through `+`,
//    etc., per §14.4). In this commit's actual behavior, since no
//    Modifier Pipeline exists yet to introduce dynamic-overlay-only edges,
//    every cycle this guard can currently catch is one the static detector
//    would already have caught on the same package -- it functions today
//    as a correctness safety net over the same edges, not yet as a
//    detector of genuinely dynamic-only cycles (§14.8's actual target,
//    which only becomes possible once conditional Modifier activation
//    exists). The guard is wired correctly regardless; it just has nothing
//    dynamic to catch yet.
//
// 6. Memoization: cache hit -> return immediately, no re-evaluation, no
//    trace re-population. Cache miss -> evaluate -> cache -> return.
//    A cycle-detection RulesError is the one result NEVER cached: whether
//    reaching `id` right now is a cycle depends on the current call
//    path, not a fixed property of `id` -- caching it would permanently
//    poison a later, genuinely acyclic call to evaluate the same
//    Definition. Every other RulesError (unknown Definition, collection/
//    source with no scalar shape, missing formula, ...) IS cached: those
//    are fixed, repeatable properties of the Definition itself, exactly
//    like any other stable RuleValue (§14.4: an error value is a value).
//
// 7. Trace: only `{path, result, steps: []}` is written, and only when
//    `session.tracingEnabled` is true (§15.5: off by default, free until
//    requested). `TraceStep.op: ModifierPhase` (types.ts) is a Modifier-
//    Pipeline-phase concept this commit does not implement, so no
//    individual steps are recorded -- populating them would mean
//    inventing phase data that does not exist yet. This is deliberately
//    the minimum that supports later explainability (§27's `explain(path)`
//    has something to re-run against and a final result to show) without
//    attempting rich step-by-step rendering, per this task's own
//    instruction.
//
// 8. WORLD CONFIGURATION -- COMMIT 1 (world-configuration.md §F):
//    `@world:<kind>.<key>` now resolves against
//    `EvaluationContext.world`, a WorldConfigSnapshot. This closes the
//    ambiguity decision 2 previously recorded and refused to guess at --
//    whether a `@world:` path meant nested-object drilling or a flat key.
//    §F.2 answers "neither": it is a FIXED TWO-SEGMENT lookup,
//    `traits[kind][key]`, because §19's data model is `{kind, traits}` and
//    no other arity names a slot in it. The path grammar itself lives in
//    world-config.ts (`parseWorldTraitPath`), shared with
//    reference-validation.ts so validation and evaluation can never
//    disagree about what parses. Unlike `@source:`, no binding is threaded
//    through the recursive descent: the snapshot is session-wide and
//    frozen (§F.5), so it is read straight off `session.context` at the
//    one place it is needed. `@world` contributes NO dependency graph edge
//    (§F.9) -- a trait is a session constant, not a Definition node --
//    which is existing dependency-graph.ts behavior this commit leaves
//    untouched.

import type {
  CollectionExpressionNode,
  ConditionalExpressionNode,
  DiceExpressionNode,
  FunctionCallExpressionNode,
  ReferenceExpressionNode,
  RuleExpressionNode
} from './ast'
import type { EvaluationSession } from './evaluation-session'
import { applyStackingSelection, groupByPhase, resolveActiveModifiers } from './modifier-pipeline'
import type { ResolvedSourceInstance } from './source-overlay'
import type {
  CollectionInstanceItem,
  Definition,
  DefinitionId,
  DiceSpec,
  Expression,
  RuleValue,
  RulesError
} from './types'
import { lookupWorldTrait, parseWorldTraitPath } from './world-config'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Evaluates one Definition, lazily and recursively, memoizing through
// `session`. `session` owns the cache, the trace store, and the runtime
// visit stack (evaluation-session.ts) -- this function never holds state
// of its own across calls.
export function evaluate(definitionId: DefinitionId, session: EvaluationSession): RuleValue {
  if (session.hasCached(definitionId)) {
    return session.getCached(definitionId)!
  }

  if (session.isVisiting(definitionId)) {
    // Runtime-only cycle guard (design decisions 5 and 6) -- distinct from,
    // and never a replacement for, the static detector (cycle-detection.ts).
    return evaluationError(
      definitionId,
      `Runtime dependency cycle detected while evaluating '${definitionId}': ${[...session.getVisitPath(), definitionId].join(' -> ')}`
    )
  }

  session.pushVisit(definitionId)
  const result = computeDefinition(definitionId, session)
  session.popVisit()

  // A cycle error can propagate up through several intermediate frames
  // before returning to its originating call (e.g. a<-b<-a: the error is
  // constructed naming 'a' while unwinding through 'b's own frame first).
  // It must never be cached at ANY frame it passes through, not only the
  // one whose id happens to match the error's own -- caching it at an
  // intermediate id would permanently poison that id for a later,
  // genuinely acyclic call.
  if (!isCycleError(result)) {
    session.setCached(definitionId, result)
  }

  if (session.tracingEnabled) {
    session.setTrace(definitionId, { path: definitionId, result, steps: [] })
  }

  return result
}

// ROLL ENGINE (§17): RollSpec.successRule.threshold (types.ts) is typed
// `Expression | RuleValue` -- for the percentile roll-under family (§17.3:
// `atMost: @value:skill`) it is a real Expression, not a literal. The Roll
// Engine (roll-engine.ts) needs to evaluate that Expression against the
// same session/scope rules this module already applies internally to
// ResourceDefinition.max and ActionCost.amount (see computeDefinition's
// `case 'resource'` above) -- this is that exact same call, exposed, so the
// Roll Engine reuses this module's evaluation rather than reimplementing
// any part of it (an explicit non-goal of that task).
export function evaluateStandaloneExpression(
  expression: Expression,
  session: EvaluationSession,
  definitionId: DefinitionId
): RuleValue {
  return evaluateExpression(asRuleExpressionNode(expression), session, definitionId)
}

// ---------------------------------------------------------------------------
// Per-Definition-kind computation (design decision 1)
// ---------------------------------------------------------------------------

function computeDefinition(definitionId: DefinitionId, session: EvaluationSession): RuleValue {
  const definition = session.registry.getById(definitionId)
  if (!definition) {
    // Existence is Reference Validation's job (already run); this is a
    // defensive fallback, not a re-implementation of that check.
    return evaluationError(definitionId, `Unknown Definition '${definitionId}'`)
  }

  switch (definition.kind) {
    case 'value':
      return computeValue(definitionId, definition, session)

    case 'resource':
      return isExpression(definition.max)
        ? evaluateExpression(asRuleExpressionNode(definition.max), session, definitionId)
        : definition.max

    case 'roll':
      return evaluateExpression(asRuleExpressionNode(definition.dice), session, definitionId)

    case 'collection':
    case 'modifier':
    case 'source':
    case 'action':
    case undefined:
      return evaluationError(
        definitionId,
        `'${definitionId}' (kind '${definition.kind ?? 'unknown'}') has no single evaluable RuleValue`
      )

    default: {
      const exhaustive: never = definition
      return exhaustive
    }
  }
}

function computeValue(
  definitionId: DefinitionId,
  definition: Extract<Definition, { kind: 'value' }>,
  session: EvaluationSession
): RuleValue {
  const base = computeBaseValue(definitionId, definition, session)
  const baseError = firstError(base)
  if (baseError) return baseError
  return applyModifiers(definitionId, base, session)
}

// §16.4 phase 1: "base -- establishes the starting value (formula or
// default)". This is that starting value, before any Modifier participates.
function computeBaseValue(
  definitionId: DefinitionId,
  definition: Extract<Definition, { kind: 'value' }>,
  session: EvaluationSession
): RuleValue {
  if (definition.storage === 'derived') {
    if (!definition.formula) {
      return evaluationError(definitionId, `Derived Value '${definitionId}' has no formula to evaluate`)
    }
    return evaluateExpression(asRuleExpressionNode(definition.formula), session, definitionId)
  }

  // storage === 'stored'
  const stored = session.actorState.values[definitionId]
  if (stored !== undefined) return stored
  if (definition.default !== undefined) return definition.default
  return typeAppropriateZero(definition.valueType)
}

// ---------------------------------------------------------------------------
// Modifier application (§16.4's fixed phase pipeline)
// ---------------------------------------------------------------------------
//
// Discovery/suppression/applicability/ordering all belong to
// modifier-pipeline.ts; this function only APPLIES the ordered sequence it
// returns. Two phases are applied under documented interpretations rather
// than unambiguous specification -- both reported in the commit Summary:
//
//   - `base`-phase MODIFIERS: §16.4 describes the base phase as "establishes
//     the starting value (formula or default)", i.e. as the slot the
//     formula/default itself occupies -- it never says what a Modifier
//     *declaring* phase 'base' does, yet ModifierPhase admits one. Applied
//     here as an override of the computed starting value, last in §15.3
//     order winning (the same shape `set`/`final` use, since every other
//     reading would have to invent one).
//
//   - `clamp`-phase modifiers: §16.4's revision-2 wording "min / max / floor
//     / ceiling" named four operations where there are two -- "floor"/
//     "ceiling" are synonyms for the lower/upper bound, not distinct
//     operations, and §16.12 (revision 3) corrected the wording. Evaluated
//     as of revision 3 Commit 8 (§16.12): greatest-applicable-lower-bound,
//     least-applicable-upper-bound, order-independent, `error` on an
//     impossible range -- see the design-decision comment directly above
//     the clamp block in applyModifiers below for the full algorithm.
//     ValueDefinition.constraints (min/max) is a separate, unambiguous
//     mechanism and remains out of §16's scope regardless (§13.3: applied
//     after the whole modifier pipeline, at read time).
//
// REVISION 3 -- COMMIT 7 (§16.11, Modifier Stacking): candidate VALUES are
// no longer evaluated here. `resolveActiveModifiers` now evaluates every
// applicable candidate's `.modifier.value` itself (§16.11 step 6, via the
// injected `evaluateValue` callback below) and populates
// `ActiveModifier.resolvedValue` -- this function reads that field
// directly. Two consequences: (1) `modifierValue` (the old per-entry
// evaluator this function used to call, once per phase-application) is
// gone -- its logic now lives in the `evaluateValue` callback passed into
// resolveActiveModifiers, called exactly once per candidate regardless of
// phase; (2) `applyStackingSelection` (modifier-pipeline.ts) runs between
// `groupByPhase` and phase application, filtering the `add`/`scale` groups
// down to their stacking survivors -- `base`/`set`/`clamp`/`final` pass
// through unchanged (see that function's own comment for why no selection
// step is needed for them).
function applyModifiers(definitionId: DefinitionId, base: RuleValue, session: EvaluationSession): RuleValue {
  // §16.9 (Commit 6) / §16.11 step 6 (Commit 7): both injected callbacks
  // resolve `@source:` the same way -- via the candidate's own
  // sourceInstanceId, looked up against session.sourceOverlay. Neither
  // callback needs `firstError`/error-checking of its own: whatever it
  // returns (including a RulesError) is handled uniformly by
  // resolveActiveModifiers itself (§16.11A's first-error-aborts rule,
  // extended to values by Commit 7).
  const resolution = resolveActiveModifiers(
    definitionId,
    session,
    (condition, modifier) =>
      evaluateExpression(
        asRuleExpressionNode(condition),
        session,
        modifier.sourceDefinitionId,
        undefined,
        findSourceInstance(session, modifier.sourceInstanceId)
      ),
    (value, modifier) =>
      isExpression(value)
        ? evaluateExpression(
            asRuleExpressionNode(value),
            session,
            modifier.sourceDefinitionId,
            undefined,
            findSourceInstance(session, modifier.sourceInstanceId)
          )
        : value
  )

  // REVISION 3 (rules-engine.md §16.11A, ADR-022; §16.18 Commit 2):
  // resolveActiveModifiers returns a ModifierResolution, not a bare array --
  // `ok: true, modifiers: []` is "nothing applies" (a legitimate success);
  // `ok: false` is a condition OR value failure (Commit 7 extended this to
  // values) that aborted resolution entirely. `resolution.error` must
  // propagate here exactly like any other error this function already
  // returns (§14.4: `1 + error` is `error`) -- never be read as "base is
  // unmodified."
  if (!resolution.ok) return resolution.error

  const active = resolution.modifiers
  if (active.length === 0) return base

  // §16.11 steps 7-8: phase grouping, then stacking selection (Commit 7) --
  // every phase's groups are filtered down to their policy-selected
  // survivors (`highest`/`lowest` only for `add`/`scale`; `exclusive` for
  // any phase, including `set`/`final`, per §16.13's own worked example --
  // see applyStackingSelection's comment). `clamp` passes through
  // unchanged HERE (§16.12: "declared modifierType stacking policies do
  // NOT apply to clamp groups") -- its own greatest-lower/least-upper
  // resolution happens separately, below, in the clamp block itself.
  const byPhase = applyStackingSelection(groupByPhase(active), session.registry)
  let running = base

  for (const entry of byPhase.get('base') ?? []) {
    running = entry.resolvedValue!
  }

  for (const entry of byPhase.get('set') ?? []) {
    running = entry.resolvedValue!
  }

  // §16.11: "stack -- every candidate applies, in §15.3 order." Summed
  // directly; per-type selection already happened in applyStackingSelection
  // above, so what remains here is exactly the survivor set for this
  // target's `add` group. Every survivor's `resolvedValue` is guaranteed
  // `number` (resolveActiveModifiers' stage 6 rejects any add/scale
  // candidate that isn't, aborting the whole resolution before stacking
  // ever runs) -- `running`'s own type is not guaranteed (a prior `base`/
  // `set` entry could have produced text), so that half of the check
  // remains.
  for (const entry of byPhase.get('add') ?? []) {
    const value = entry.resolvedValue as number
    if (typeof running !== 'number') {
      return evaluationError(definitionId, `'add' modifier requires numbers, got '${typeof running} + number'`)
    }
    running = running + value
  }

  for (const entry of byPhase.get('scale') ?? []) {
    const value = entry.resolvedValue as number
    if (typeof running !== 'number') {
      return evaluationError(definitionId, `'scale' modifier requires numbers, got '${typeof running} * number'`)
    }
    running = running * value
  }

  const clampModifiers = byPhase.get('clamp') ?? []
  if (clampModifiers.length > 0) {
    if (typeof running !== 'number') {
      return evaluationError(definitionId, `Cannot apply 'clamp': running value must be a number, got '${typeof running}'`)
    }

    // §16.12: "Collect every applicable min bound; the effective lower
    // bound is the greatest of them. Collect every applicable max bound;
    // the effective upper bound is the least of them." Declared
    // `modifierType` stacking policies do NOT apply to clamp groups
    // (applyStackingSelection, modifier-pipeline.ts, already leaves
    // `clamp` untouched) -- this greatest-lower/least-upper reduction IS
    // the clamp resolution, computed directly over every survivor
    // regardless of order.
    let lower: number | undefined
    let upper: number | undefined
    for (const entry of clampModifiers) {
      // `entry.phase === 'clamp'` (groupByPhase's own key) always implies
      // `entry.modifier.phase === 'clamp'` by construction (modifier-
      // pipeline.ts copies `phase: modifier.phase` when building the
      // candidate) -- narrowing on the modifier's OWN discriminant is what
      // gives TypeScript access to `.clamp`, since `ActiveModifier.phase`
      // and `ActiveModifier.modifier.phase` are structurally unrelated
      // fields as far as the type checker knows.
      if (entry.modifier.phase !== 'clamp') continue
      // Guaranteed numeric: stage 6 (resolveActiveModifiers) now enforces
      // "clamp is numeric-only" for candidate values, exactly like add/scale.
      const bound = entry.resolvedValue as number
      if (entry.modifier.clamp === 'min') {
        lower = lower === undefined ? bound : Math.max(lower, bound)
      } else {
        upper = upper === undefined ? bound : Math.min(upper, bound)
      }
    }

    // §16.12 step 3: "If both exist and lower > upper -> error. An
    // impossible range is an authoring mistake, and silently preferring
    // one bound would produce a plausible wrong number." `code` (not
    // `.reason`): `clamp-range-impossible` is one of the three codes
    // `RulesErrorCode` (types.ts) has carried since revision 3's own
    // type-contract commit, anticipating exactly this error.
    if (lower !== undefined && upper !== undefined && lower > upper) {
      return {
        definitionId,
        message: `Impossible clamp range on '${definitionId}': lower bound ${lower} exceeds upper bound ${upper}`,
        code: 'clamp-range-impossible'
      }
    }

    // §16.12 step 4: "Otherwise apply lower first, then upper." Applying
    // greatest-lower then least-upper makes the result independent of
    // §15.3 order (Math.max/Math.min are commutative/associative over the
    // already-reduced single lower/upper pair) -- ARCHITECTURE's own
    // "evaluation order must not affect the final result" requirement.
    if (lower !== undefined) running = Math.max(running, lower)
    if (upper !== undefined) running = Math.min(running, upper)
  }

  for (const entry of byPhase.get('final') ?? []) {
    running = entry.resolvedValue!
  }

  return running
}

// §16.9 (Commit 6): resolves an ActiveModifier's `sourceInstanceId` back
// to the `ResolvedSourceInstance` the Source Overlay (source-overlay.ts,
// Commit 4) already built it from. A linear scan, not a Map lookup: the
// overlay is a small, per-session, already-computed array (§15.7's own
// scale estimate is ~50 modifiers), and building an id-indexed Map here
// would be inventing a second runtime Source index alongside the overlay's
// own array -- exactly the "second runtime Source model" this commit's
// own scope forbids. Returns undefined (never throws) if the id is not
// found; a well-formed `ActiveModifier` always names a real overlay
// instance (it was itself discovered by scanning that same overlay in
// modifier-pipeline.ts), so this is a defensive fallback, not an expected
// path -- but the caller (evaluateSourceReference, via the `sourceBinding`
// this feeds) treats "no binding" as an ordinary RulesError regardless of
// why it is missing.
function findSourceInstance(session: EvaluationSession, instanceId: string): ResolvedSourceInstance | undefined {
  return session.sourceOverlay.instances.find((instance) => instance.instanceId === instanceId)
}

// ---------------------------------------------------------------------------
// Expression AST evaluation
// ---------------------------------------------------------------------------

function evaluateExpression(
  node: RuleExpressionNode,
  session: EvaluationSession,
  definitionId: DefinitionId,
  itemScope?: CollectionInstanceItem,
  sourceBinding?: ResolvedSourceInstance
): RuleValue {
  switch (node.kind) {
    case 'literal': {
      const key = node.value
      if (node.valueType === 'text' && itemScope && typeof key === 'string' && key in itemScope) {
        return itemScope[key] as RuleValue
      }
      return node.value
    }

    case 'reference':
      return evaluateReference(node, session, definitionId, sourceBinding)

    case 'unary': {
      if (node.operator !== '-') {
        return evaluationError(definitionId, `Unknown unary operator '${node.operator}'`)
      }
      const operand = evaluateExpression(node.operand, session, definitionId, itemScope, sourceBinding)
      const error = firstError(operand)
      if (error) return error
      if (typeof operand !== 'number') {
        return evaluationError(definitionId, `Unary '-' requires a number, got '${typeof operand}'`)
      }
      return -operand
    }

    case 'binary':
      return evaluateBinary(node.operator, node.left, node.right, session, definitionId, itemScope, sourceBinding)

    case 'conditional':
      return evaluateConditional(node, session, definitionId, itemScope, sourceBinding)

    case 'call':
      return evaluateCall(node, session, definitionId, itemScope, sourceBinding)

    case 'collection':
      return evaluateCollection(node, session, definitionId, sourceBinding)

    case 'lookup': {
      // Table is unmodeled (design decision 4). `key` is still evaluated so
      // an internal error inside it surfaces rather than being masked.
      const keyError = firstError(evaluateExpression(node.key, session, definitionId, itemScope, sourceBinding))
      if (keyError) return keyError
      return evaluationError(definitionId, `Cannot evaluate lookup(${node.table}, ...) -- Table is not modeled`)
    }

    case 'dice':
      return evaluateDice(node, session, definitionId, itemScope, sourceBinding)

    case 'unresolved':
      // §14.12: "type-checks as error and evaluates to error."
      return evaluationError(definitionId, `Unresolved expression: ${node.reason}`)

    default: {
      const exhaustive: never = node
      return exhaustive
    }
  }
}

// §16.9 (Commit 6): `namespace === 'source'` now resolves against
// `sourceBinding` (evaluateSourceReference below) instead of falling into
// design decision 2's "not resolvable" case -- the one namespace besides
// `value`/`collection` with a real runtime lookup.
function evaluateReference(
  node: ReferenceExpressionNode,
  session: EvaluationSession,
  definitionId: DefinitionId,
  sourceBinding: ResolvedSourceInstance | undefined
): RuleValue {
  if (node.namespace === 'source') {
    return evaluateSourceReference(node, definitionId, sourceBinding)
  }

  if (node.namespace === 'world') {
    return evaluateWorldReference(node, session, definitionId)
  }

  if (node.namespace === 'value' || node.namespace === 'collection') {
    const id = node.path === undefined ? node.namespace : `${node.namespace}:${node.path}`
    return evaluate(id, session)
  }

  // sources / ctx / choice -- see design decision 2.
  const path = node.path ? `:${node.path}` : ''
  return evaluationError(
    definitionId,
    `Cannot evaluate '@${node.namespace}${path}' -- '${node.namespace}' references are not resolvable in the current runtime model`
  )
}

// world-configuration.md §F: `@world:<kind>.<key>` resolves against the
// WorldConfigSnapshot on EvaluationContext -- a fixed two-level lookup,
// `traits[kind][key]`. This replaces design decision 2's blanket "not
// resolvable" answer for `world`, which existed because the path's
// meaning (nested drilling vs. flat key) was, in this file's own words,
// "a real, currently-undecided ambiguity." §F.2 decides it: neither --
// exactly two segments, resolved at a fixed depth.
//
// This function READS an already-resolved snapshot and nothing else. It
// never applies a declared default, never records a Binding Gap, and never
// consults the manifest: §19.3's "changes produce binding gaps, not
// runtime failures" is satisfied during RESOLUTION (world-configuration.md
// commit 3), before any snapshot reaches a session. By the time a value is
// read here, a trait is either present or genuinely absent -- and absent
// is an error, never a type-appropriate zero. §16.9's `@source:` branch
// above makes the identical call for the identical reason: a misspelled
// field must fail visibly rather than silently resolve to something falsy
// that quietly changes a number a player sees.
//
// Check order follows §F.6's three cases exactly: unconfigured world
// first (a runtime state), then path arity (an authoring error Reference
// Validation already reports ahead of time -- this is the defensive
// fallback for AST that did not come through it), then presence.
function evaluateWorldReference(
  node: ReferenceExpressionNode,
  session: EvaluationSession,
  definitionId: DefinitionId
): RuleValue {
  const reference = `@world${node.path === undefined ? '' : `:${node.path}`}`
  const snapshot = session.context.world

  // world-configuration.md §3.3: an unconfigured world is a LEGAL state,
  // not a broken one -- no package is active and the Rules Engine is not
  // in its request path. It is only reaching a `@world:` reference at all
  // that is the error, and this is exactly the behavior that shipped
  // before this commit, preserved unchanged for unconfigured worlds.
  if (snapshot === undefined) {
    return evaluationError(
      definitionId,
      `Cannot evaluate '${reference}' -- this world has no active World Configuration`
    )
  }

  const traitPath = parseWorldTraitPath(node.path)
  if (!traitPath) {
    return evaluationError(
      definitionId,
      `Cannot evaluate '${reference}' -- a @world reference must have exactly two path segments, '@world:<kind>.<key>'`
    )
  }

  const value = lookupWorldTrait(snapshot, traitPath.kind, traitPath.key)
  if (value === undefined) {
    return evaluationError(
      definitionId,
      `'${reference}' is not present in this world's resolved World Configuration`
    )
  }

  // §F.4 restricts traits to the scalar subset, and WorldConfigSnapshot's
  // type says so -- but a snapshot will eventually arrive as deserialized
  // JSON, where that claim is unenforceable. Returning a non-scalar would
  // put a value outside the RuleValue domain into an evaluation. Refuse
  // visibly instead; validating a world's supplied values against their
  // declared types is World Config Validation's job (commit 3), and
  // silently coercing here would mask exactly what it must report.
  if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
    return evaluationError(
      definitionId,
      `'${reference}' resolved to a non-scalar World Configuration trait -- only number, text, and boolean traits are supported`
    )
  }

  return value
}

// §16.9: `@source:` binds to the one Source instance through which the
// enclosing Modifier was activated (§16.1's invariant) -- `sourceBinding`
// IS that instance, already resolved by the caller (modifierValue /
// applyModifiers' condition callback). This function performs runtime
// LOOKUP only, exactly as this commit's own RESPONSIBILITY states -- it
// never derives, activates, or invents a Source instance; that is the
// Source Overlay's job (source-overlay.ts, Commit 4), already done before
// this function is ever called.
function evaluateSourceReference(
  node: ReferenceExpressionNode,
  definitionId: DefinitionId,
  sourceBinding: ResolvedSourceInstance | undefined
): RuleValue {
  // Lexical scope (§16.9): `@source:` is legal only inside a ModifierSpec's
  // `value`/`condition`. Reference Validation owns enforcing that ahead of
  // time; this is the evaluator's OWN defensive fallback for the case
  // where no binding was threaded in -- never re-implementing that check,
  // just refusing to silently invent a value when there is nothing to
  // read (task's own "the evaluator may defensively return RulesError if
  // the binding is absent").
  if (!sourceBinding) {
    const path = node.path ? `:${node.path}` : ''
    return evaluationError(
      definitionId,
      `Cannot evaluate '@source${path}' -- no active Source instance is bound here (@source: is only valid inside a Modifier's value or condition expression)`
    )
  }

  // §8.2's own grammar requires a path (`@source` bare is a parser-level
  // syntax error, parser.ts's arity check, Commit 3) -- this branch is
  // therefore unreachable through the parser and exists only as a
  // defensive fallback for a hand-built or deserialized AST node (the same
  // caveat reference-validation.ts's KNOWN_NAMESPACES comment already
  // makes about non-parser AST producers).
  if (node.path === undefined) {
    return evaluationError(definitionId, "Cannot evaluate '@source' -- a path is required")
  }

  switch (node.path) {
    case 'instanceId':
      return sourceBinding.instanceId
    case 'definitionId':
      return sourceBinding.definitionId
    case 'duration.kind':
      return sourceBinding.duration?.kind ?? ''
    case 'duration.remaining':
      return sourceBinding.duration?.remaining ?? 0
    case 'duration':
    case 'origin':
      // Engine-reserved (§16.9) but not themselves readable scalars --
      // only duration's two sub-paths are. Reserved names win even if a
      // (malformed, package-validation's job to reject) item schema
      // happened to declare a same-named field, so this check runs before
      // any itemFields lookup below.
      return evaluationError(
        definitionId,
        `'@source:${node.path}' is not a readable field -- ${node.path === 'duration' ? "use 'duration.kind' or 'duration.remaining'" : "'origin' is engine-internal provenance, not an expression-readable field"}`
      )
    default: {
      // §16.9: "@source:<itemField> | declared by the item schema | only
      // for collection-item instances." Absent -> error, never a
      // type-appropriate zero (§16.9's own deliberate exception to §14.4's
      // general rule) -- a misspelled field must fail visibly, not
      // silently disable the Modifier by resolving to a falsy default.
      const itemFields = sourceBinding.itemFields
      if (itemFields && node.path in itemFields) {
        return itemFields[node.path]!
      }
      return evaluationError(
        definitionId,
        `'@source:${node.path}' is not a field of Source instance '${sourceBinding.instanceId}' ('${sourceBinding.definitionId}')`
      )
    }
  }
}

function evaluateBinary(
  operator: string,
  leftNode: RuleExpressionNode,
  rightNode: RuleExpressionNode,
  session: EvaluationSession,
  definitionId: DefinitionId,
  itemScope: CollectionInstanceItem | undefined,
  sourceBinding: ResolvedSourceInstance | undefined
): RuleValue {
  const left = evaluateExpression(leftNode, session, definitionId, itemScope, sourceBinding)
  const right = evaluateExpression(rightNode, session, definitionId, itemScope, sourceBinding)
  const error = firstError(left, right)
  if (error) return error

  if (operator === '+') {
    if (typeof left === 'number' && typeof right === 'number') return left + right
    if (typeof left === 'string' && typeof right === 'string') return left + right
    // ROLL ENGINE gap, found and fixed while implementing roll-engine.ts:
    // §17.3's own worked table shows the d20 roll-over and d20-advantage
    // families spelled as `1d20 + @mod` / dice expressions with a flat
    // numeric modifier added directly to a dice literal. §14.6 requires
    // this to stay "a value, not evaluation" -- construct a DiceSpec, never
    // roll -- so `+` between a diceSpec and a number cannot mean numeric
    // addition (there is no number yet to add to); it must mean "attach a
    // flat modifier to the dice construction," the same pattern
    // `keepHighest`/`keepLowest`/`explode`/`reroll` already use to annotate
    // a DiceSpec with extra flat keys (evaluateCall below). Without this,
    // two of the three proof families in §17.3 could never evaluate their
    // `dice` field to anything but a RulesError, which would make "execute
    // arbitrary RollSpecs" (the Roll Engine's stated objective)
    // unachievable for them. Modifiers accumulate (`1d20 + 2 + @mod`),
    // matching left-associative `+` chaining elsewhere in this evaluator.
    if (isDiceSpec(left) && typeof right === 'number') {
      const existing = typeof left.modifier === 'number' ? left.modifier : 0
      return { ...left, modifier: existing + right }
    }
    if (typeof left === 'number' && isDiceSpec(right)) {
      const existing = typeof right.modifier === 'number' ? right.modifier : 0
      return { ...right, modifier: existing + left }
    }
    return evaluationError(definitionId, `'+' requires Number+Number, Text+Text, or diceSpec+Number, got '${typeof left}+${typeof right}'`)
  }

  if (operator === '-' || operator === '*' || operator === '/') {
    if (typeof left !== 'number' || typeof right !== 'number') {
      return evaluationError(definitionId, `'${operator}' requires two numbers, got '${typeof left} ${operator} ${typeof right}'`)
    }
    if (operator === '-') return left - right
    if (operator === '*') return left * right
    return right === 0 ? evaluationError(definitionId, 'Division by zero') : left / right
  }

  if (operator === '=') return left === right
  if (operator === '!=') return left !== right

  if (operator === '<' || operator === '<=' || operator === '>' || operator === '>=') {
    if (typeof left !== 'number' || typeof right !== 'number') {
      return evaluationError(definitionId, `'${operator}' requires two numbers, got '${typeof left} ${operator} ${typeof right}'`)
    }
    if (operator === '<') return left < right
    if (operator === '<=') return left <= right
    if (operator === '>') return left > right
    return left >= right
  }

  return evaluationError(definitionId, `Unknown binary operator '${operator}'`)
}

function evaluateConditional(
  node: ConditionalExpressionNode,
  session: EvaluationSession,
  definitionId: DefinitionId,
  itemScope: CollectionInstanceItem | undefined,
  sourceBinding: ResolvedSourceInstance | undefined
): RuleValue {
  const condition = evaluateExpression(node.condition, session, definitionId, itemScope, sourceBinding)
  const error = firstError(condition)
  if (error) return error
  if (typeof condition !== 'boolean') {
    return evaluationError(definitionId, `if(...) condition must be boolean, got '${typeof condition}'`)
  }
  // Lazy: only the selected branch is ever evaluated.
  return evaluateExpression(condition ? node.whenTrue : node.whenFalse, session, definitionId, itemScope, sourceBinding)
}

function evaluateDice(
  node: DiceExpressionNode,
  session: EvaluationSession,
  definitionId: DefinitionId,
  itemScope: CollectionInstanceItem | undefined,
  sourceBinding: ResolvedSourceInstance | undefined
): RuleValue {
  const count = evaluateExpression(node.count, session, definitionId, itemScope, sourceBinding)
  const faces = evaluateExpression(node.faces, session, definitionId, itemScope, sourceBinding)
  const error = firstError(count, faces)
  if (error) return error
  if (typeof count !== 'number' || typeof faces !== 'number') {
    return evaluationError(definitionId, `dice(count, faces) requires two numbers, got '${typeof count}, ${typeof faces}'`)
  }
  // §14.6: constructs a diceSpec; never rolled here.
  return { count, faces }
}

// ---------------------------------------------------------------------------
// Function whitelist (§14.5) -- mirrors type-validation.ts's signature
// table, now computing values instead of checking types.
// ---------------------------------------------------------------------------

function evaluateCall(
  node: FunctionCallExpressionNode,
  session: EvaluationSession,
  definitionId: DefinitionId,
  itemScope: CollectionInstanceItem | undefined,
  sourceBinding: ResolvedSourceInstance | undefined
): RuleValue {
  const name = node.name

  // Short-circuiting logic -- evaluated one argument at a time so a later
  // argument is never touched once the result is already determined.
  if (name === 'and') {
    for (const arg of node.args) {
      const value = evaluateExpression(arg, session, definitionId, itemScope, sourceBinding)
      const error = firstError(value)
      if (error) return error
      if (typeof value !== 'boolean') return evaluationError(definitionId, `'and' requires boolean arguments, got '${typeof value}'`)
      if (!value) return false
    }
    return true
  }

  if (name === 'or') {
    for (const arg of node.args) {
      const value = evaluateExpression(arg, session, definitionId, itemScope, sourceBinding)
      const error = firstError(value)
      if (error) return error
      if (typeof value !== 'boolean') return evaluationError(definitionId, `'or' requires boolean arguments, got '${typeof value}'`)
      if (value) return true
    }
    return false
  }

  const args = node.args.map((arg) => evaluateExpression(arg, session, definitionId, itemScope, sourceBinding))
  const error = firstError(...args)
  if (error) return error

  switch (name) {
    case 'floor':
      return requireNumber(args[0], definitionId, name, 1, Math.floor)
    case 'ceil':
      return requireNumber(args[0], definitionId, name, 1, Math.ceil)
    case 'round':
      return requireNumber(args[0], definitionId, name, 1, Math.round)
    case 'abs':
      return requireNumber(args[0], definitionId, name, 1, Math.abs)
    case 'sqrt':
      return requireNumber(args[0], definitionId, name, 1, Math.sqrt)
    case 'sign':
      return requireNumber(args[0], definitionId, name, 1, Math.sign)

    case 'pow': {
      const [base, exponent] = args
      if (typeof base !== 'number' || typeof exponent !== 'number') {
        return evaluationError(definitionId, `'pow' requires two numbers, got '${args.map((a) => typeof a).join(', ')}'`)
      }
      return Math.pow(base, exponent)
    }

    case 'clamp': {
      const [value, min, max] = args
      if (typeof value !== 'number' || typeof min !== 'number' || typeof max !== 'number') {
        return evaluationError(definitionId, `'clamp' requires three numbers, got '${args.map((a) => typeof a).join(', ')}'`)
      }
      return Math.min(Math.max(value, min), max)
    }

    case 'min':
    case 'max': {
      if (args.length === 0 || !args.every((a) => typeof a === 'number')) {
        return evaluationError(definitionId, `'${name}' requires at least one number argument`)
      }
      const numbers = args as number[]
      return name === 'min' ? Math.min(...numbers) : Math.max(...numbers)
    }

    case 'not': {
      const [value] = args
      if (typeof value !== 'boolean') return evaluationError(definitionId, `'not' requires a boolean, got '${typeof value}'`)
      return !value
    }

    case 'concat': {
      if (!args.every((a) => typeof a === 'string')) {
        return evaluationError(definitionId, "'concat' requires text arguments")
      }
      return (args as string[]).join('')
    }

    case 'lower': {
      const [value] = args
      if (typeof value !== 'string') return evaluationError(definitionId, `'lower' requires text, got '${typeof value}'`)
      return value.toLowerCase()
    }

    case 'upper': {
      const [value] = args
      if (typeof value !== 'string') return evaluationError(definitionId, `'upper' requires text, got '${typeof value}'`)
      return value.toUpperCase()
    }

    case 'toNumber': {
      const [value] = args
      if (typeof value === 'number') return value
      if (typeof value === 'boolean') return value ? 1 : 0
      if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : evaluationError(definitionId, `'toNumber' cannot convert '${value}' to a number`)
      }
      return evaluationError(definitionId, `'toNumber' cannot convert this argument to a number`)
    }

    case 'toText': {
      const [value] = args
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      if (typeof value === 'string') return value
      return evaluationError(definitionId, `'toText' cannot convert this argument to text`)
    }

    case 'keepHighest':
    case 'keepLowest': {
      const [dice, count] = args
      if (!isDiceSpec(dice) || typeof count !== 'number') {
        return evaluationError(definitionId, `'${name}' requires (diceSpec, number)`)
      }
      return { ...dice, keep: name === 'keepHighest' ? 'highest' : 'lowest', keepCount: count }
    }

    case 'explode':
    case 'reroll': {
      const [dice] = args
      if (!isDiceSpec(dice)) {
        return evaluationError(definitionId, `'${name}' requires a diceSpec as its first argument`)
      }
      return { ...dice, [name]: true }
    }

    default:
      return evaluationError(definitionId, `'${name}' is not part of the approved function whitelist (rules-engine.md §14.5)`)
  }
}

function requireNumber(
  value: RuleValue | undefined,
  definitionId: DefinitionId,
  name: string,
  arity: number,
  fn: (n: number) => number
): RuleValue {
  if (typeof value !== 'number') {
    return evaluationError(definitionId, `'${name}' requires ${arity} number argument${arity === 1 ? '' : 's'}, got '${typeof value}'`)
  }
  return fn(value)
}

// ---------------------------------------------------------------------------
// Collection expressions (design decision 3)
// ---------------------------------------------------------------------------

function evaluateCollection(
  node: CollectionExpressionNode,
  session: EvaluationSession,
  definitionId: DefinitionId,
  sourceBinding: ResolvedSourceInstance | undefined
): RuleValue {
  const items = resolveCollectionItems(node.source, session)
  if (isRulesError(items)) return items

  const filtered: CollectionInstanceItem[] = []
  for (const item of items) {
    if (!node.predicate) {
      filtered.push(item)
      continue
    }
    const predicateResult = evaluateExpression(node.predicate, session, definitionId, item, sourceBinding)
    const error = firstError(predicateResult)
    if (error) return error
    if (isTruthy(predicateResult)) filtered.push(item)
  }

  switch (node.operation) {
    case 'count':
      return filtered.length

    case 'any':
      return filtered.length > 0

    case 'sum':
    case 'max_of':
    case 'min_of': {
      if (!node.aggregate) {
        return evaluationError(definitionId, `'${node.operation}' requires an aggregate expression`)
      }
      const values: number[] = []
      for (const item of filtered) {
        const value = evaluateExpression(node.aggregate, session, definitionId, item, sourceBinding)
        const error = firstError(value)
        if (error) return error
        if (typeof value !== 'number') {
          return evaluationError(definitionId, `'${node.operation}' aggregate must evaluate to a number, got '${typeof value}'`)
        }
        values.push(value)
      }
      if (node.operation === 'sum') return values.reduce((total, value) => total + value, 0)
      if (values.length === 0) return 0
      return node.operation === 'max_of' ? Math.max(...values) : Math.min(...values)
    }

    case 'all':
    case 'first':
    case 'filter':
      // Deliberately not evaluated -- see design decision 3.
      return evaluationError(
        definitionId,
        `'${node.operation}' evaluation is not yet supported (unresolved language semantics or non-scalar result -- see evaluator.ts)`
      )

    default: {
      const exhaustive: never = node.operation
      return exhaustive
    }
  }
}

// Resolves `source` (a CollectionExpressionNode's source) to concrete
// runtime items, itself schema-resolvable ONLY when source is a literal
// @collection:x reference (mirrors type-validation.ts's own
// resolveItemScope boundary). @sources and any other source shape return a
// RulesError rather than guessing at item structure.
function resolveCollectionItems(
  source: RuleExpressionNode,
  session: EvaluationSession
): CollectionInstanceItem[] | RulesError {
  if (source.kind !== 'reference' || source.namespace !== 'collection' || source.path === undefined) {
    return evaluationError(
      'collection-source',
      'Collection expressions are only evaluable over a direct @collection:x reference in this commit'
    )
  }
  const id = `collection:${source.path}`
  return session.actorState.collections[id] ?? []
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExpression(value: unknown): value is Expression {
  return typeof value === 'object' && value !== null && 'text' in value && 'ast' in value
}

// Expression.ast is still typed as the loose ExpressionNode placeholder
// (types.ts), not the canonical RuleExpressionNode (ast.ts) -- the same
// already-flagged, still-unresolved wiring gap dependency-graph.ts's own
// header documents. One narrow cast at the boundary, as there.
function asRuleExpressionNode(expression: Expression): RuleExpressionNode {
  return expression.ast as RuleExpressionNode
}

// `unknown`, not `RuleValue`, so this also accepts intermediate shapes like
// `CollectionInstanceItem[] | RulesError` (resolveCollectionItems' own
// return type) without a widening cast at every call site -- purely a
// structural runtime check either way.
function isRulesError(value: unknown): value is RulesError {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'definitionId' in value &&
    'message' in value &&
    !('count' in value && 'faces' in value)
  )
}

function isDiceSpec(value: RuleValue | undefined): value is DiceSpec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'count' in value && 'faces' in value
}

function isTruthy(value: RuleValue): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  return true
}

function firstError(...values: RuleValue[]): RulesError | undefined {
  return values.find(isRulesError) as RulesError | undefined
}

function evaluationError(definitionId: DefinitionId, message: string): RulesError {
  return { definitionId, message }
}

// Matches a cycle error by shape alone (never by comparing definitionId to
// the current frame) -- see the caller's comment for why.
function isCycleError(value: RuleValue): boolean {
  return isRulesError(value) && value.message.startsWith('Runtime dependency cycle detected')
}

// §14.4: "There is no null. Every value has a type-appropriate zero (0,
// "", false, empty list)." 'enum'/'ref' have no described zero -- treated
// as text, the closest declared shape (both are string-valued at the
// RuleValue level per types.ts's own RuleValue comment).
function typeAppropriateZero(valueType: string): RuleValue {
  if (valueType === 'number') return 0
  if (valueType === 'boolean') return false
  return ''
}
