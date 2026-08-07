// Rules Engine Modifier Pipeline.
// See .github/docs/architecture/rules-engine.md §16 (Modifier and Effect
// System) in full, plus §15.3 (ordering and stability), §16.8 (the Source
// Overlay this module now consumes), and §16.10 (standalone modifier
// attachment) for the design this implements.
//
// This module answers exactly one question, the one this task's own
// IMPLEMENTATION section names: "what active Modifiers affect this
// Definition?" -- returning an ordered sequence. It performs NO evaluation
// of its own (a caller-supplied ConditionEvaluator handles the one place a
// condition Expression must be resolved), computes NO final values, and
// owns NO cache. Applying the returned sequence is the Evaluator's job.
//
// ---------------------------------------------------------------------------
// BLOCKING AMBIGUITIES FOUND (reported, NOT invented around -- see the
// commit Summary, which reproduces this list in full)
// ---------------------------------------------------------------------------
// A. `@source.equipped` -- the architecture's OWN canonical conditional-
//    modifier syntax -- did not parse. **Resolved by revision 3's language
//    support (Commit 3):** `@source:equipped` now parses. `@source:`
//    RUNTIME field resolution (actually reading a field off a
//    ResolvedSourceInstance during evaluation) is explicitly NOT
//    implemented this commit ("Do not implement @source runtime field
//    resolution") -- see the commit Summary's "Remaining @source work"
//    section. A condition using `@source:` still evaluates via the six
//    pre-revision-3 namespaces' existing machinery only.
//
// B. Standalone ModifierDefinitions had no attachment mechanism. **Resolved
//    by this commit (Commit 5).** `SourceDefinition.modifiers` entries of
//    shape `{ ref: DefinitionId }` are now resolved against the registry
//    into the `ModifierDefinition` they name -- see resolveModifierEntry
//    below. A resolved reference is treated identically to an inline
//    `ModifierSpec` from that point on (§16.10 decision 4: "a referenced
//    modifier behaves exactly as if inlined at that position"). An
//    unresolvable `{ ref }` (missing target, or a target that exists but
//    is not `kind: 'modifier'`) is Reference Validation's concern (§16.10
//    decision 7) -- skipped defensively here, not re-diagnosed, mirroring
//    this module's own pre-existing convention for an unresolvable
//    `sourceRef` (see resolveSourceInstances below).
//
// C. Collection-item-carried Sources were unreachable. **Resolved by
//    revision 3's Source Overlay (Commit 4) and wired in by this commit
//    (Commit 5).** This module now discovers active Sources exclusively
//    through `session.sourceOverlay.instances` (§16.8's `SourceOverlay`),
//    which already includes collection-derived instances alongside
//    declared ones. `ActorState.sources` is no longer read directly here --
//    the Source Overlay is the one canonical runtime Source model.
//
// D. Stacking policy has no declaration site. **Resolved at the type level
//    by revision 3's type contract (Commit 2):** `RulesPackageManifest`
//    (types.ts) now has `modifierTypes?: ModifierTypeDeclaration[]` (§16.3).
//    But nothing in this module (or anywhere else) reads it yet -- "Do not
//    implement Modifier stacking" -- so every modifierType is still treated
//    as unknown at runtime and `DEFAULT_STACKING`/'stack' (sum all) is
//    still the only policy this module's phase-application produces
//    (applied by evaluator.ts, not here). Wiring the declaration table up
//    to actual grouped selection is a later commit.
//
// E. Tag-predicate suppression is unreachable. **Partially resolved by
//    revision 3's type contract (Commit 2):** `SourceDefinition.tags` and
//    `SourceSuppression.tags` (§16.6) now exist as types. But tag matching
//    is NOT implemented this commit -- applySuppression below reads only
//    `.suppresses.sources`, exactly the id-only behavior that existed
//    before this commit. Tag matching is deferred alongside the rest of
//    the stacking runtime work.
//
// ---------------------------------------------------------------------------
// REVISION 3 -- COMMIT 1: condition-result / error-propagation correction
// ---------------------------------------------------------------------------
// rules-engine.md §16.11A (ADR-022) replaces this module's original
// condition-gating rule. The governing rule is now: **false eligibility
// excludes; evaluation failure propagates.**
//
// ---------------------------------------------------------------------------
// REVISION 3 -- COMMIT 2: Type Contract Delta
// ---------------------------------------------------------------------------
// `resolveActiveModifiers` returns `ModifierResolution` (§16.18); a
// non-boolean condition result produces a `RulesError` with `code`.
//
// ---------------------------------------------------------------------------
// REVISION 3 -- COMMIT 5: Modifier Attachment Resolution (this commit)
// ---------------------------------------------------------------------------
// §16.8 + §16.10 wired together. Three changes:
//
//   1. Source discovery now reads `session.sourceOverlay.instances`
//      exclusively (ambiguity C above) -- the standalone
//      `resolveActiveSources`/`ActiveSource` pair this module previously
//      defined is removed entirely, replaced by `resolveSourceInstances`
//      operating on `ResolvedSourceInstance` (source-overlay.ts). There is
//      now exactly one place in the whole engine that decides "which
//      Source instances are active": the overlay. This module no longer
//      duplicates that decision.
//
//   2. `{ ref: DefinitionId }` entries in `SourceDefinition.modifiers` are
//      now resolved against the registry (ambiguity B above), via
//      resolveModifierEntry. Inline `ModifierSpec` entries and resolved
//      `ModifierDefinition` entries are pushed into the SAME candidate
//      list through the SAME code path -- after resolution there is no
//      remaining distinction between "this modifier was written inline"
//      and "this modifier was attached by reference" (§16.10 decision 4).
//
//   3. `ActiveModifier` gains two fields §16.18 named but Commit 2
//      deliberately left unpopulated pending this commit:
//      `attachmentIndex` (the entry's position within
//      `SourceDefinition.modifiers`, §15.3) and `origin` (the owning
//      Source instance's `SourceOrigin`, §16.8). Both now have a real
//      producer. `resolvedValue` (§16.18's third named addition) remains
//      unpopulated -- it belongs to stacking's candidate-value evaluation,
//      an explicit non-goal of this commit.
//
// `@source:` runtime field resolution is still NOT implemented ("Do not
// implement @source runtime field resolution") -- this commit produces the
// provenance (`origin`, `sourceInstanceId`, `attachmentIndex`) a future
// commit's `@source:` lookup will need, but nothing yet reads it through
// the expression language. Stacking, clamp, and package validation remain
// untouched, per this commit's own NON-GOALS.

import type { EvaluationSession } from './evaluation-session'
import type { RulesRegistry } from './registry'
import type { ResolvedSourceInstance } from './source-overlay'
import type {
  DefinitionId,
  Expression,
  ModifierPhase,
  ModifierReference,
  ModifierSpec,
  RuleValue,
  RulesError,
  RulesErrorCode,
  SourceOrigin
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// One active, applicable Modifier plus the provenance §16.5 requires
// ("Source | Source instance ID (always recorded)") and §15.3 orders by.
// `sourceDefinitionId`/`sourceInstanceId` are carried separately because
// §15.3's ordering key needs both, and §27's traces name the instance.
//
// `modifier: ModifierSpec` -- both an inline entry and a resolved
// `{ ref }` entry (which resolves to `ModifierDefinition`, itself a
// structural `ModifierSpec` plus identity) fit this field identically;
// after resolution, this module makes no further distinction between the
// two authoring forms (§16.10 decision 4, Commit 5).
//
// `attachmentIndex`/`origin` (Commit 5, §16.18): the entry's position
// within its owning Source's `modifiers` array, and that Source instance's
// activation provenance. Both exist to support a later `@source:`
// resolution commit, traces, and diagnostics -- neither is read by
// anything in this module today. `resolvedValue` (§16.18's third named
// addition) is still absent: it belongs to stacking's candidate-value
// evaluation, out of this commit's scope.
export type ActiveModifier = {
  modifier: ModifierSpec
  phase: ModifierPhase
  modifierType?: string
  sourceDefinitionId: DefinitionId
  sourceInstanceId: string
  attachmentIndex: number
  origin: SourceOrigin
}

// §16.18 (revision 3, Commit 2): replaces Commit 1's temporary
// `ActiveModifier[] | RulesError` union now that the architecture's own
// named type exists. An empty `modifiers` array remains a legitimate,
// distinct success ("nothing applies"); `ok: false` is the only failure
// signal -- see resolveActiveModifiers below and rules-engine.md §16.11A.
export type ModifierResolution =
  | { ok: true; modifiers: readonly ActiveModifier[] }
  | { ok: false; error: RulesError }

// Resolves one condition Expression to a value. Injected rather than
// imported so this module never depends on the Evaluator (which depends on
// it) -- and so "the pipeline does not own evaluation" is enforced
// structurally, not just by convention.
export type ConditionEvaluator = (condition: Expression, ownerId: DefinitionId) => RuleValue

// §16.4's fixed phase order. "Fixed phase order is a deliberate
// constraint" -- never sorted, never merged, never made configurable.
export const MODIFIER_PHASES: readonly ModifierPhase[] = ['base', 'set', 'add', 'scale', 'clamp', 'final']

const PHASE_INDEX: ReadonlyMap<ModifierPhase, number> = new Map(
  MODIFIER_PHASES.map((phase, index) => [phase, index])
)

// §16.3: "Unknown types default to `stack`." With no declaration site for
// the modifierTypes policy table (ambiguity D above), every type is
// unknown, so this is the only policy currently reachable.
export const DEFAULT_STACKING = 'stack'

// §16.11A/§16.18: the stable `RulesError.code` for a condition that
// evaluated successfully but did not yield a boolean.
export const MODIFIER_CONDITION_NOT_BOOLEAN: RulesErrorCode = 'modifier-condition-not-boolean'

// Returns every active Modifier targeting `targetId`, ordered by
// (§16.4 phase, then §15.3's `(explicitOrder, sourceDefinitionId,
// sourceInstanceId, attachmentIndex)`). Discovery -> suppression -> target
// match -> attachment resolution -> ordering -> applicability. Computes no
// values.
//
// REVISION 3 (§16.11A, ADR-022; §16.18 Commit 2): the return type is a
// `ModifierResolution`, not a bare array. A condition failure -- a
// non-boolean result, or an existing RulesError (including a runtime
// cycle) -- aborts resolution entirely, and that is signalled by
// `{ ok: false, error }`. An empty `modifiers` array under `ok: true`
// remains a legitimate, distinct outcome: "every Modifier was either
// absent, suppressed, target-mismatched, or its condition was boolean
// `false`" -- ordinary eligibility, not failure. Callers MUST check `ok`
// before reading `modifiers`.
export function resolveActiveModifiers(
  targetId: DefinitionId,
  session: EvaluationSession,
  evaluateCondition: ConditionEvaluator
): ModifierResolution {
  const active = resolveSourceInstances(session)
  const surviving = applySuppression(active)

  const candidates: ActiveModifier[] = []
  for (const resolvedSource of surviving) {
    const entries = resolvedSource.definition.modifiers
    for (let attachmentIndex = 0; attachmentIndex < entries.length; attachmentIndex++) {
      const modifier = resolveModifierEntry(entries[attachmentIndex]!, session.registry)
      // An unresolvable `{ ref }` is Reference Validation's concern
      // (§16.10 decision 7) -- skipped defensively, not re-diagnosed here.
      // See ambiguity B above.
      if (!modifier) continue
      if (modifier.target !== targetId) continue

      candidates.push({
        modifier,
        phase: modifier.phase,
        modifierType: modifier.modifierType,
        sourceDefinitionId: resolvedSource.definitionId,
        sourceInstanceId: resolvedSource.instanceId,
        attachmentIndex,
        origin: resolvedSource.origin
      })
    }
  }

  // Applicability (§16.5's "Scope | Source activation + `condition`").
  // Ordered BEFORE conditions are evaluated so that condition evaluation
  // itself happens in a deterministic sequence -- conditions can read other
  // Values, and a stable evaluation order is what §15.3 exists to
  // guarantee. It is also what makes "which error is reported first"
  // reproducible (§16.11A decision 5).
  const ordered = candidates.sort(compareActiveModifiers)

  const applicable: ActiveModifier[] = []
  for (const candidate of ordered) {
    if (!candidate.modifier.condition) {
      applicable.push(candidate)
      continue
    }

    const result = evaluateCondition(candidate.modifier.condition, candidate.sourceDefinitionId)

    if (result === true) {
      applicable.push(candidate)
      continue
    }

    if (result === false) {
      // Ordinary eligibility, not a failure (§16.11A: "false eligibility
      // excludes"). The package author gave a well-formed "no". No error,
      // no diagnostic -- silently excluded, exactly as before this commit.
      continue
    }

    if (isRulesError(result)) {
      // §16.11A decision 4 / ADR-022: propagate the ORIGINAL error
      // unchanged. Never converted to `false`, never re-labelled -- a
      // runtime cycle keeps its own message and path (§16.13 example 8).
      // First error aborts resolution of this target entirely (§16.11A
      // decision 1): no further candidates are evaluated. Full provenance
      // enrichment onto the ERROR ITSELF (RulesError.provenance,
      // types.ts) is still deliberately not attached -- see the "Do not
      // yet expose it through the language" scope note above; the
      // provenance now attached to each `ActiveModifier` is available for
      // that enrichment once a later commit chooses to add it.
      return { ok: false, error: result }
    }

    // Non-boolean, non-error: an authoring mistake, not an eligibility
    // answer. EEL has no truthiness (expression-language.md §7.1) -- this
    // MUST error rather than silently exclude, per §16.11A. First error
    // aborts resolution of this target; no further candidates evaluated.
    return {
      ok: false,
      error: {
        definitionId: candidate.sourceDefinitionId,
        message:
          `Modifier condition on Source '${candidate.sourceDefinitionId}' (targeting '${targetId}') ` +
          `must evaluate to boolean, got '${typeof result}'`,
        code: MODIFIER_CONDITION_NOT_BOOLEAN
      }
    }
  }

  return { ok: true, modifiers: applicable }
}

// Mirrors evaluator.ts's own `isRulesError` exactly. Duplicated rather than
// imported: evaluator.ts imports `resolveActiveModifiers` from this module,
// so importing the other way would create a cycle. Both copies must be kept
// in sync until a shared discriminant (e.g. a `kind: 'error'` tag on
// RulesError) would let this collapse to one check.
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

// §16.10 (Commit 5): resolves one `SourceDefinition.modifiers` entry --
// inline or referenced -- to the `ModifierSpec` it names. An inline entry
// resolves to itself (already exactly a `ModifierSpec`); a `{ ref }` entry
// is looked up in the registry and must name an existing `kind: 'modifier'`
// Definition, whose `ModifierDefinition` shape structurally satisfies
// `ModifierSpec` too (it is `ModifierSpec & { id; kind }`) -- the return
// type is `ModifierSpec`, not `ModifierDefinition`, precisely so both
// branches share one type without a cast. Returns undefined for an
// unresolvable reference (missing target, or a target that exists but is
// the wrong kind) -- callers skip it rather than treat it as active,
// exactly matching this module's existing convention for an unresolvable
// Source `sourceRef` (resolveSourceInstances below).
function resolveModifierEntry(entry: ModifierSpec | ModifierReference, registry: RulesRegistry): ModifierSpec | undefined {
  if (!isModifierReference(entry)) return entry

  const target = registry.getById(entry.ref)
  if (!target || target.kind !== 'modifier') return undefined
  return target
}

// `ModifierReference`'s only field is `ref`; `ModifierSpec` never has one,
// so a structural check is exact -- no discriminant tag needed either way.
function isModifierReference(entry: ModifierSpec | ModifierReference): entry is ModifierReference {
  return 'ref' in entry
}

// ---------------------------------------------------------------------------
// Active Source discovery (Commit 5: the Source Overlay is now the sole
// source of runtime Source discovery -- see ambiguity C above)
// ---------------------------------------------------------------------------

// §16.8: `session.sourceOverlay` (built once, at session construction, by
// `buildSourceOverlay` -- source-overlay.ts) already IS "which Source
// instances are active," for both declared and collection-derived
// instances alike. This module reads it, once, per resolution call. It no
// longer walks `ActorState.sources` directly and no longer re-derives
// activation itself -- doing so would recreate exactly the two-canonical-
// models problem §16.8's own "Ownership" section was written to prevent.
function resolveSourceInstances(session: EvaluationSession): readonly ResolvedSourceInstance[] {
  return session.sourceOverlay.instances
}

// §16.6: "a Source may suppress other Sources by ID or tag predicate.
// Suppression resolves BEFORE any modifier application, in one pass, and is
// NOT transitive in V1 (A suppresses B; B's suppression of C still
// applies)."
//
// Non-transitivity falls directly out of computing the suppressed set from
// the FULL original active list in one pass: B is still consulted as a
// suppressor even after A has suppressed it, so C still goes away.
//
// Operates on `ResolvedSourceInstance` (Commit 5) -- `.definitionId` is the
// resolved instance's Source DefinitionId, the same value `.sourceRef`
// named on the pre-overlay `SourceInstance` shape this function used to
// read directly.
function applySuppression(active: readonly ResolvedSourceInstance[]): ResolvedSourceInstance[] {
  const suppressedRefs = new Set<DefinitionId>()
  for (const resolved of active) {
    for (const entry of resolved.definition.suppresses?.sources ?? []) {
      // An entry that matches no active Source's ref is simply inert.
      suppressedRefs.add(entry)
    }
  }

  if (suppressedRefs.size === 0) return [...active]
  return active.filter((resolved) => !suppressedRefs.has(resolved.definitionId))
}

// ---------------------------------------------------------------------------
// Ordering (§16.4 phase order, then §15.3 within a phase)
// ---------------------------------------------------------------------------

// §15.3: "Within a phase, modifiers are ordered by `(explicitOrder,
// sourceDefinitionId, sourceInstanceId, attachmentIndex)` -- never array or
// insertion order, which is not stable across loads." `attachmentIndex`
// (Commit 5) is the fourth, totalizing component §15.3 names: without it,
// two modifiers attached to the SAME Source instance with the same
// `explicitOrder` would tie on all three prior components, leaving their
// relative order undefined -- which matters for `exclusive` stacking
// (§16.11, a later commit) even though nothing reads that outcome yet.
function compareActiveModifiers(a: ActiveModifier, b: ActiveModifier): number {
  const phaseDelta = (PHASE_INDEX.get(a.phase) ?? MODIFIER_PHASES.length) - (PHASE_INDEX.get(b.phase) ?? MODIFIER_PHASES.length)
  if (phaseDelta !== 0) return phaseDelta

  const orderDelta = (a.modifier.order ?? 0) - (b.modifier.order ?? 0)
  if (orderDelta !== 0) return orderDelta

  if (a.sourceDefinitionId !== b.sourceDefinitionId) {
    return a.sourceDefinitionId < b.sourceDefinitionId ? -1 : 1
  }

  if (a.sourceInstanceId !== b.sourceInstanceId) {
    return a.sourceInstanceId < b.sourceInstanceId ? -1 : 1
  }

  return a.attachmentIndex - b.attachmentIndex
}

// Groups an already-ordered sequence by phase, preserving both §16.4's
// fixed phase order and §15.3's within-phase order. A convenience for the
// Evaluator's phase-by-phase application loop -- still no value computation.
export function groupByPhase(modifiers: readonly ActiveModifier[]): Map<ModifierPhase, ActiveModifier[]> {
  const grouped = new Map<ModifierPhase, ActiveModifier[]>()
  for (const phase of MODIFIER_PHASES) grouped.set(phase, [])
  for (const modifier of modifiers) {
    const group = grouped.get(modifier.phase)
    if (group) group.push(modifier)
  }
  return grouped
}
