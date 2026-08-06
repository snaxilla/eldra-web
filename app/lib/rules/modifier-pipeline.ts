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
//    Package A `mod:armour.guard`) -- does not parse. `@source` (singular,
//    dot-accessed) is not one of the six closed ReferenceNamespaces
//    (ast.ts), and expression-language.md §8.2/§9 already flagged adding it
//    as a REQUIRED-BUT-NOT-MADE ast.ts change. Conditions using the six
//    implemented namespaces (e.g. `@value:x > 0`) evaluate correctly; a
//    condition using `@source.*` fails at parse time, long before this
//    module sees it. This blocks the canonical "equipped item grants a
//    bonus" pattern end to end.
//
// B. Standalone ModifierDefinitions have no attachment mechanism. §16.1 is
//    explicit that "Modifiers are attached to Sources... A Source is active
//    or not; its modifiers apply or not" -- and SourceDefinition.modifiers
//    (types.ts) is an inline `ModifierDefinition[]`, with no field anywhere
//    that references a standalone modifier by DefinitionId. Yet Appendix
//    Package A authors `mod:armour.guard` as a top-level Definition with
//    its own id and a `@source.equipped` condition, never listing it inside
//    any SourceDefinition. How such a modifier becomes active is therefore
//    unspecified. This module discovers modifiers ONLY through active
//    SourceInstances (the unambiguous path); standalone ModifierDefinitions
//    in the registry are never treated as active on their own.
//
// C. Collection-item-carried Sources are unreachable. §27.1's trace shows a
//    modifier whose provenance is an inventory *item instance*
//    (`sourceId: "inv:ci_01H..."`, modifierType "equipment"), and Package
//    A's itemSchema carries `{key: "sourceRef", valueType: "ref", refKind:
//    "definition"}` -- so collection items evidently carry Sources. But
//    gating them on whether the item is equipped is precisely what
//    `@source.equipped` was for (ambiguity A), and nothing specifies
//    whether an item's `sourceRef` is active unconditionally or only under
//    such a condition. Only ActorState.sources is used here.
//
// D. Stacking policy has no declaration site. §16.3 shows a package-level
//    `modifierTypes` table ([{id, stacking}]), but RulesPackageManifest
//    (types.ts) has no `modifierTypes` field, and the already-declared
//    `ModifierStacking` union ('stack'|'highest'|'lowest'|'exclusive') is
//    referenced by nothing in the entire codebase. Every modifierType is
//    therefore "unknown" today, and §16.3 specifies exactly what that
//    means: "Unknown types default to `stack`". That default is applied --
//    which is specified behavior, not invention -- but 'highest'/'lowest'/
//    'exclusive' are consequently unreachable until a declaration site
//    exists. Adding one is a manifest/public-API change this task does not
//    authorize.
//
// E. Tag-predicate suppression is unreachable. §16.6/§16.5 allow a Source
//    to suppress others "by ID or tag predicate", but neither
//    SourceDefinition nor SourceInstance (types.ts) has a `tags` field --
//    only ValueDefinition and EvaluationContext do -- and types.ts's own
//    comment already notes the predicate shape "is not specified in the
//    architecture". Suppression by Source DefinitionId is implemented;
//    tag predicates are not.

import type { EvaluationSession } from './evaluation-session'
import type {
  DefinitionId,
  Expression,
  ModifierDefinition,
  ModifierPhase,
  RuleValue,
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
export type ActiveModifier = {
  modifier: ModifierDefinition
  phase: ModifierPhase
  modifierType?: string
  sourceDefinitionId: DefinitionId
  sourceInstanceId: string
}

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

// Returns every active Modifier targeting `targetId`, ordered by
// (§16.4 phase, then §15.3's `(explicitOrder, sourceDefinitionId,
// sourceInstanceId)`). Discovery -> suppression -> target match ->
// applicability -> ordering. Computes no values.
export function resolveActiveModifiers(
  targetId: DefinitionId,
  session: EvaluationSession,
  evaluateCondition: ConditionEvaluator
): ActiveModifier[] {
  const active = resolveActiveSources(session)
  const surviving = applySuppression(active)

  const candidates: ActiveModifier[] = []
  for (const { instance, definition } of surviving) {
    for (const modifier of definition.modifiers) {
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
  // guarantee.
  const ordered = candidates.sort(compareActiveModifiers)

  const applicable: ActiveModifier[] = []
  for (const candidate of ordered) {
    if (!candidate.modifier.condition) {
      applicable.push(candidate)
      continue
    }
    const result = evaluateCondition(candidate.modifier.condition, candidate.sourceDefinitionId)
    if (result === true) applicable.push(candidate)
    // A non-boolean or error condition result excludes the modifier. §14.4
    // ("errors propagate... visible degradation over silent corruption")
    // governs values, not gating: a modifier whose condition could not be
    // established as true is simply not applied, rather than corrupting an
    // otherwise-good target value with an error.
  }

  return applicable
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
function applySuppression(active: ActiveSource[]): ActiveSource[] {
  const suppressedRefs = new Set<DefinitionId>()
  for (const { definition } of active) {
    for (const entry of definition.suppresses ?? []) {
      // Only Source-DefinitionId entries are honored; tag predicates are
      // unreachable (ambiguity E above). An entry that matches no active
      // Source's ref is simply inert.
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
