// Roll Service.
// See .github/docs/architecture/rules-engine.md §17 (Action/Check/Roll
// Model) and §24.4 ("secret rolls... seed and result stored") for the
// framing this implements, though "Roll Service"/"RollEvent" are this
// commit's own names -- the architecture document never uses either term
// (grepped; confirmed absent). This is the first commit to introduce a
// concept the architecture doesn't already name, the same way
// evaluation-session.ts's own header once was for EvaluationSession.
//
// This module is the canonical runtime ENTRY POINT for executing a roll:
// everything that wants to roll dice calls `requestRoll`, not
// `executeRoll` (roll-engine.ts) directly. It owns orchestration only --
// RollSpec lookup, EvaluationSession wiring, roll execution, RollEvent
// creation -- and reuses the Roll Engine and Evaluator for everything else.
// It does NOT own 3D rendering, Chat, Timeline, Combat, or Character Sheet
// UI, and produces runtime events only: no HTML, no Vue, no rendering.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. `requestRoll` takes an already-built `RulesRegistry`/`DependencyGraph`
//    (RollRequest), not a manifest + definitions to build them from.
//    Registry/Graph construction is package-load-time work -- static,
//    expensive (dependency-graph.ts walks every Definition), and shared
//    across every roll a campaign ever makes against one package version.
//    Rebuilding them per roll would be wasteful and semantically wrong (a
//    roll request is not a package reload). Package loading/caching is
//    unbuilt, out-of-scope work (flagged as "Package Validation" in an
//    earlier phase) this module deliberately does not reach for.
//
// 2. `requestRoll` ALWAYS returns a `RollEvent`, never a bare `RulesError`
//    and never throws -- unlike `executeRoll` (roll-engine.ts), whose
//    `RollResult | RulesError` union is appropriate for an internal
//    building block but not for "the" entry point everything else calls.
//    A failed roll attempt (unknown RollSpec, missing seed, a bad
//    expression) is still an auditable event ("this actor tried to roll
//    this and it failed") -- exactly §28's "visible degradation": the
//    failure surfaces as a first-class RollEvent (`ok: false`), not an
//    exception a caller must separately catch or a shape it must
//    separately branch on to find out whether something happened.
//
// 3. RollSpec lookup happens here, BEFORE EvaluationSession construction,
//    even though `executeRoll` performs the identical check again
//    internally. This is not pure duplication: constructing an
//    EvaluationSession does real, non-trivial work in its constructor
//    (building the Source Overlay -- evaluation-session.ts design decision
//    7), which a request naming a nonexistent or wrong-kind RollSpec has no
//    reason to pay for. `executeRoll`'s own check remains as its own
//    correct defensive boundary for any OTHER caller that reaches it
//    directly (as it already is, e.g. from a test).
//
// 4. `RollEvent.eventId` is DERIVED, deterministically, from
//    `(actorId, rollSpecId, seed)` -- never `Math.random()`/a UUID library
//    and never `Date.now()`. This is what makes "deterministic RollEvents"
//    (this task's own testing requirement) literally true: the same
//    RollRequest produces a byte-identical RollEvent, not one that merely
//    contains an identical RollResult inside a differently-identified
//    wrapper. A real persisted audit log entry would need a genuine
//    wall-clock timestamp and a collision-proof id, but assigning either is
//    a PERSISTENCE-layer concern (when this event was written down, and
//    with what storage-assigned id) -- this module produces the event
//    itself, purely, the same way the Roll Engine treats seed generation as
//    the caller's concern rather than its own (roll-engine.ts design
//    decision 1). A persistence layer is free to stamp its own id/timestamp
//    when it stores a RollEvent; that is not this module's job.
//
// 5. A found gap, flagged and NOT fixed here: §24.3 states "every Value
//    Definition, Action, and Roll declares visibility" -- but RollSpec
//    (types.ts) has no `visibility` field, unlike ValueDefinition. §24.3
//    itself says "In V1 nothing enforces this," and this task's own scope
//    is the Roll Service's orchestration, not a RollSpec type-contract
//    change -- adding `visibility` now would be redesigning RollSpec for a
//    concern nothing in this commit exercises. RollEvent therefore carries
//    no visibility/redaction handling; that remains for whichever future
//    commit actually enforces §24.3.

import type { DependencyGraph } from './dependency-graph'
import { EvaluationSession } from './evaluation-session'
import { executeRoll, type RollResult } from './roll-engine'
import type { RulesRegistry } from './registry'
import type { ActorState, DefinitionId, EvaluationContext, RulesError } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Everything `requestRoll` needs to wire one EvaluationSession and execute
// one roll (design decision 1). `registry`/`graph` are the loaded package's
// static artifacts; `actorState`/`context` are this request's own runtime
// state -- exactly the four EvaluationSession already requires, named
// explicitly here rather than requiring a caller to construct a session
// itself (that construction is this module's job, per its own stated
// "EvaluationSession wiring" responsibility).
export type RollRequest = {
  rollSpecId: DefinitionId
  registry: RulesRegistry
  graph: DependencyGraph
  actorState: ActorState
  context: EvaluationContext
}

type RollEventBase = {
  eventId: string
  rollSpecId: DefinitionId
  actorId: string
}

// Deliberately loose enough for the consumers this task names (Character
// Sheet, 3D Dice, Chat, Timeline, Replay) without this module implementing
// any of them -- see RollResult's own comment (roll-engine.ts) for the same
// discipline, which this type extends rather than replaces (design
// decision 2: RollEvent wraps a RollResult, it does not reshape one).
export type RollEvent =
  | (RollEventBase & { ok: true; seed: string; result: RollResult })
  | (RollEventBase & { ok: false; error: RulesError })

// The canonical runtime entry point (this module's own header). Never
// throws; always returns a RollEvent (design decision 2).
export function requestRoll(request: RollRequest): RollEvent {
  const { rollSpecId, registry, graph, actorState, context } = request
  const actorId = actorState.actorId

  // Responsibility 1: RollSpec lookup (design decision 3 -- before session
  // construction).
  const definition = registry.getById(rollSpecId)
  if (!definition) {
    return failureEvent(actorId, rollSpecId, context.seed, {
      definitionId: rollSpecId,
      message: `No Roll Spec '${rollSpecId}' exists in the registry`
    })
  }
  if (definition.kind !== 'roll') {
    return failureEvent(actorId, rollSpecId, context.seed, {
      definitionId: rollSpecId,
      message: `'${rollSpecId}' (kind '${definition.kind}') is not a Roll Spec`
    })
  }

  // Responsibility 2: EvaluationSession wiring.
  const session = new EvaluationSession(registry, graph, actorState, context)

  // Responsibility 3: Roll execution (roll-engine.ts, reused unchanged).
  const outcome = executeRoll(rollSpecId, session)
  if (isRulesError(outcome)) {
    return failureEvent(actorId, rollSpecId, context.seed, outcome)
  }

  // Responsibility 4: RollEvent creation.
  return {
    eventId: deriveEventId(actorId, rollSpecId, outcome.seed),
    rollSpecId,
    actorId,
    ok: true,
    seed: outcome.seed,
    result: outcome
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function failureEvent(actorId: string, rollSpecId: DefinitionId, seed: string | undefined, error: RulesError): RollEvent {
  return {
    eventId: deriveEventId(actorId, rollSpecId, seed ?? ''),
    rollSpecId,
    actorId,
    ok: false,
    error
  }
}

// Design decision 4: no randomness, no wall-clock. The request's own
// identity (which actor, which Roll Spec, which seed) IS a stable key --
// reusing it avoids inventing a second identity concept purely to have
// something to call an "id".
function deriveEventId(actorId: string, rollSpecId: DefinitionId, seed: string): string {
  return `roll-event:${actorId}:${rollSpecId}:${seed}`
}

function isRulesError(value: RollResult | RulesError): value is RulesError {
  return 'message' in value && !('rolls' in value)
}
