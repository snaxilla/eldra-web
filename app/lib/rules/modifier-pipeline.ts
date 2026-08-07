// Rules Engine Modifier Pipeline.
// See .github/docs/architecture/rules-engine.md §16 (Modifier and Effect
// System) in full, plus §15.3 (ordering and stability) and §15.1 (the
// per-actor "dynamic overlay" this module computes) for the design this
// implements.
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
//    modifier syntax (§16.1's `mod:shield.defense`, and the Appendix
//    Package A `mod:armour.guard`) -- does not parse. **Partially resolved
//    by revision 3's type contract (Commit 2):** the canonical syntax is
//    now `@source:equipped` (§16.9), and `'source'` is the seventh member
//    of `ReferenceNamespace` (ast.ts) as of this commit. But the PARSER's
//    own namespace list (parser.ts's `REFERENCE_NAMESPACES`) is untouched
//    by this commit -- "Do not implement parser behavior yet" -- so
//    `@source:equipped` still fails to parse today. A condition using
//    `@source:` therefore still fails at parse time, before this module
//    ever sees it. Grammar support is a later commit.
//
// B. Standalone ModifierDefinitions have no attachment mechanism.
//    **Partially resolved by revision 3's type contract (Commit 2):**
//    `SourceDefinition.modifiers` (types.ts) is now
//    `Array<ModifierSpec | ModifierReference>` (§16.10), so the type system
//    can represent `{ "ref": "modifier:armour.guard" }` attachment. But
//    resolving a `ModifierReference` into the ModifierDefinition it names
//    is explicitly NOT implemented this commit ("Do not implement Modifier
//    attachment resolution") -- see isModifierReference below: this module
//    still discovers modifiers ONLY through inline `ModifierSpec` entries
//    in an active Source's `modifiers` array; `{ ref }` entries are
//    skipped, not resolved. Standalone ModifierDefinitions in the registry
//    are still never treated as active on their own.
//
// C. Collection-item-carried Sources are unreachable. **Partially resolved
//    by revision 3's type contract (Commit 2):**
//    `CollectionDefinition.sourceRefField` (§16.8) and `SourceInstance.origin`
//    now exist as types, but the Source Overlay builder that would actually
//    derive a collection-item Source instance (`source-overlay.ts`) is
//    explicitly NOT implemented this commit ("Do not implement Source
//    Overlay"). Only `ActorState.sources` is used here, exactly as before.
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
//    is NOT implemented this commit (no non-goal explicitly names it, but
//    "no new runtime capabilities beyond the new type system" covers it):
//    applySuppression below reads only `suppresses.sources`, exactly the
//    id-only behavior that existed before this commit. Tag matching is
//    deferred alongside the rest of the suppression/stacking runtime work.
//
// ---------------------------------------------------------------------------
// REVISION 3 -- COMMIT 1: condition-result / error-propagation correction
// ---------------------------------------------------------------------------
// rules-engine.md §16.11A (ADR-022) replaces this module's original
// condition-gating rule. The deployed rule this commit removed was: "a
// non-true condition result -- including a RulesError -- excludes the
// Modifier." That made three other architectural guarantees unreachable in
// practice (an absent `@source:` field erroring, a runtime cycle surfacing
// visibly, and §28's "visible degradation over silent corruption" generally):
// a RulesError produced by a condition was silently reinterpreted as "not
// true" and the Modifier just disappeared.
//
// The governing rule is now: **false eligibility excludes; evaluation
// failure propagates.**
//
// ---------------------------------------------------------------------------
// REVISION 3 -- COMMIT 2: Type Contract Delta (this commit)
// ---------------------------------------------------------------------------
// Mechanical fixups only, per §16.18's approved type contract:
//   - `ActiveModifier.modifier` is now typed `ModifierSpec` (was
//     `ModifierDefinition`) -- `SourceDefinition.modifiers` entries no
//     longer carry `id`/`kind` at all in their inline form (ambiguity B).
//   - Discovery filters out `ModifierReference` (`{ ref }`) entries via
//     isModifierReference -- see ambiguity B above for why they are
//     skipped, not resolved, this commit.
//   - `applySuppression` reads `definition.suppresses?.sources` (was
//     `definition.suppresses`, a bare array) -- see ambiguity E above.
//   - `resolveActiveModifiers` returns `ModifierResolution`, replacing
//     Commit 1's temporary `ActiveModifier[] | RulesError` union now that
//     §16.18's named type exists. Behavior is unchanged from Commit 1 --
//     only the return type's shape/name changed.
//   - The Commit-1 non-boolean-condition error now sets `code` (the real
//     `RulesError.code` field, §16.18) instead of overloading `reason`,
//     which Commit 1's own comment flagged as a placeholder "in the
//     meantime." `.provenance` is deliberately left unpopulated: attaching
//     it now, without `attachmentIndex` (unavailable until attachment
//     resolution exists -- ambiguity B), would mean shipping a partially-
//     complete provenance object and completing it awkwardly in a later
//     commit. It is populated once, in full, in the commit that implements
//     attachment resolution.

import type { EvaluationSession } from './evaluation-session'
import type {
  DefinitionId,
  Expression,
  ModifierPhase,
  ModifierReference,
  ModifierSpec,
  RuleValue,
  RulesError,
  RulesErrorCode,
  SourceDefinition,
  SourceInstance
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// One active, applicable Modifier plus the provenance §16.5 requires
// ("Source | Source instance ID (always recorded)") and §15.3 orders by.
// `sourceDefinitionId`/`sourceInstanceId` are carried separately because
// §15.3's ordering key needs both, and §27's traces name the instance.
//
// `modifier: ModifierSpec` (revision 3, Commit 2) -- was `ModifierDefinition`.
// Every entry this module discovers comes from a Source's inline `modifiers`
// array (ambiguity B above), which is `ModifierSpec`-shaped, never
// `ModifierDefinition`-shaped (that identity-bearing form only appears
// standalone in the registry, unreachable here until attachment resolution
// exists). §16.18 additionally names `attachmentIndex`/`origin`/
// `resolvedValue` fields for this type -- not added here: each requires
// runtime work this commit does not implement (attachment resolution,
// the Source Overlay, and stacking's candidate-value evaluation,
// respectively) and adding the fields without a producer would be dead
// weight, not a type-contract requirement.
export type ActiveModifier = {
  modifier: ModifierSpec
  phase: ModifierPhase
  modifierType?: string
  sourceDefinitionId: DefinitionId
  sourceInstanceId: string
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
// evaluated successfully but did not yield a boolean. Commit 1 (before
// `RulesError.code` existed) carried this same string in `.reason` as a
// documented placeholder; this commit moves it to the real field now that
// types.ts has one (types.ts's `RulesErrorCode`).
export const MODIFIER_CONDITION_NOT_BOOLEAN: RulesErrorCode = 'modifier-condition-not-boolean'

// Returns every active Modifier targeting `targetId`, ordered by
// (§16.4 phase, then §15.3's `(explicitOrder, sourceDefinitionId,
// sourceInstanceId)`). Discovery -> suppression -> target match ->
// applicability -> ordering. Computes no values.
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
  const active = resolveActiveSources(session)
  const surviving = applySuppression(active)

  const candidates: ActiveModifier[] = []
  for (const { instance, definition } of surviving) {
    for (const entry of definition.modifiers) {
      // §16.10 (ambiguity B above): `{ ref }` attachment entries are not
      // yet resolved -- skipped, not treated as active, until a later
      // commit implements attachment resolution.
      if (isModifierReference(entry)) continue
      const modifier = entry
      if (modifier.target !== targetId) continue
      candidates.push({
        modifier,
        phase: modifier.phase,
        modifierType: modifier.modifierType,
        sourceDefinitionId: definition.id,
        sourceInstanceId: instance.instanceId
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
      // enrichment is deliberately still not attached here -- see the
      // "REVISION 3 -- COMMIT 2" file-header note on why `.provenance` is
      // populated once, in full, by the attachment-resolution commit
      // rather than partially here.
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

// §16.10 (revision 3, Commit 2): distinguishes an attachment reference from
// an inline spec in `SourceDefinition.modifiers`. `ModifierReference`'s
// only field is `ref`; `ModifierSpec` never has one, so a structural check
// is exact -- no discriminant tag needed either way.
function isModifierReference(entry: ModifierSpec | ModifierReference): entry is ModifierReference {
  return 'ref' in entry
}

// ---------------------------------------------------------------------------
// Active Source discovery
// ---------------------------------------------------------------------------

type ActiveSource = {
  instance: SourceInstance
  definition: SourceDefinition
}

// §16.1: "A Source is active or not; its modifiers apply or not." A
// SourceInstance's presence in ActorState.sources IS its activation --
// §16.7 is explicit that duration "decrements only on explicit user action.
// No automatic expiry", so this module never inspects `duration` to decide
// activation (doing so would be exactly the invented activation semantics
// this task forbids). Removal is likewise state, not inference: §16.5's
// "Removal | Remove the Source instance from actor state".
function resolveActiveSources(session: EvaluationSession): ActiveSource[] {
  const active: ActiveSource[] = []
  for (const instance of session.actorState.sources) {
    const definition = session.registry.getById(instance.sourceRef)
    // An unresolvable sourceRef is Reference Validation's concern (already
    // run before evaluation); skipped defensively rather than re-diagnosed.
    if (definition && definition.kind === 'source') {
      active.push({ instance, definition })
    }
  }
  return active
}

// §16.6: "a Source may suppress other Sources by ID or tag predicate.
// Suppression resolves BEFORE any modifier application, in one pass, and is
// NOT transitive in V1 (A suppresses B; B's suppression of C still
// applies)."
//
// Non-transitivity falls directly out of computing the suppressed set from
// the FULL original active list in one pass: B is still consulted as a
// suppressor even after A has suppressed it, so C still goes away.
// §16.6 (revision 3, Commit 2): `definition.suppresses` is now the
// structured `SourceSuppression` shape (`{ sources?, tags? }`), not a bare
// `string[]`. Only `.sources` is read here -- `.tags` is a real, typed
// field as of this commit but tag matching itself is unimplemented
// (ambiguity E above), so behavior is unchanged from before this commit:
// id-only suppression.
function applySuppression(active: ActiveSource[]): ActiveSource[] {
  const suppressedRefs = new Set<DefinitionId>()
  for (const { definition } of active) {
    for (const entry of definition.suppresses?.sources ?? []) {
      // An entry that matches no active Source's ref is simply inert.
      suppressedRefs.add(entry)
    }
  }

  if (suppressedRefs.size === 0) return active
  return active.filter(({ instance }) => !suppressedRefs.has(instance.sourceRef))
}

// ---------------------------------------------------------------------------
// Ordering (§16.4 phase order, then §15.3 within a phase)
// ---------------------------------------------------------------------------

// §15.3: "Within a phase, modifiers are ordered by `(explicitOrder,
// sourceDefinitionId, sourceInstanceId)` -- never array or insertion order,
// which is not stable across loads."
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

  return 0
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
