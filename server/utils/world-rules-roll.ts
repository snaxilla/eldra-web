// World Roll Execution.
// See .github/docs/architecture/rules-package-infrastructure.md Q10 ("How
// should Character Sheets discover the active package?" -- this is the
// second of that two-step flow's endpoints, POST .../roll; the first, GET
// .../summary, already shipped in Infra 6/8) and this commit's own
// RESPONSIBILITY flow, verbatim:
//
//   getWorldRuntime() -> resolve requested RollSpec -> generate a
//   cryptographically secure seed -> requestRoll() -> return RollEvent
//
// This module is the execute path for Rules rolls: it composes
// getWorldRuntime (already-tested, unmodified), roll-TYPE resolution
// against the World's OWN already-resolved rollTypes list (world-config.ts's
// composeRollTypes, reused via runtime.worldConfig.rollTypes -- never
// recomputed here), and requestRoll (roll-service.ts, reused unmodified)
// into one call. It does NOT construct a Registry/DependencyGraph/
// EvaluationSession itself -- those already exist on RuntimeRulesPackage --
// and it does NOT interpret, reshape, or decorate a RollResult/RollEvent.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. Callers name a ROLL TYPE (e.g. "luck", "check"), never a RollSpec
//    DefinitionId directly -- this task's own INPUT section ("Do not
//    accept raw RollSpec IDs. The browser should request logical roll
//    types."). Resolution goes through `runtime.worldConfig.rollTypes` --
//    world-config.ts's ALREADY-RESOLVED, already-filtered list (enabled
//    only, World override applied) -- never `runtime.manifest.rollTypes`
//    (the raw declarations), which would let a caller execute a roll type
//    the World has disabled. A rollType absent from the resolved list --
//    because it was never declared, or because the World disabled it -- is
//    rejected identically as "unknown roll type": from a caller's
//    perspective, and per world-configuration.md's own "resolvedRollTypes
//    ... dropping enabled:false", a disabled roll type simply does not
//    exist for this World right now.
//
// 2. The seed is generated here, exactly once per request, via
//    node:crypto's `randomBytes` -- this task's own SEED GENERATION
//    section ("Do not use Math.random(). Use Node crypto."). It is never
//    accepted from the request body, even if a caller supplies one under
//    `context.seed` -- WorldRollInput's `context` field structurally
//    cannot carry a `seed` at all (only `purpose`/`tags`), so there is no
//    code path that could read a client-supplied seed even by accident.
//    This is the fix the architecture named directly: "the seed is
//    currently Math.random()-based... a real, production-ready call site
//    must eventually generate its seed server-side" (useCharacterSheetRolls.ts's
//    own header) -- this endpoint is that call site, for package-declared
//    roll types. useCharacterSheetRolls.ts's separate, pre-existing
//    ad-hoc-bonus-check path is untouched (NON-GOALS: "Do not modify
//    Character Sheet").
//
// 3. ActorState is a minimal, empty placeholder keyed by the caller's
//    actorId (or a fixed placeholder when absent/blank) -- this task's own
//    NON-GOALS exclude the actor bridge. Exactly the same posture
//    useCharacterSheetRolls.ts already established for its own ad-hoc
//    rolls ("nothing here is ever consulted... exists only because
//    EvaluationSession's constructor requires one"), except this endpoint
//    additionally supplies the World's real, resolved config snapshot
//    (`runtime.worldConfig.snapshot`) as `context.world` -- unlike the
//    Character Sheet's self-contained ad-hoc dice expressions, a
//    package-declared RollSpec can and does reference `@world:` (the
//    starter package's own `roll:check` reads `@world:campaign.difficulty`
//    for its success threshold) and `@value:` (actor values, which
//    resolve to their type's zero against an empty ActorState -- §14.4's
//    "no null, every value has a zero", not an error).
//
// 4. `requestRoll` (roll-service.ts) is called exactly once, unmodified,
//    and its RollEvent is returned VERBATIM by the route handler -- this
//    task's own OUTPUT section ("Do not reshape. Do not recompute totals.
//    Do not decorate."). This module never inspects `RollEvent.ok` to
//    decide anything: a roll ATTEMPT that fails INSIDE requestRoll (a bad
//    dice expression, a RollSpec that fails to evaluate) is already a
//    well-formed, auditable RollEvent (roll-service.ts design decision 2:
//    "still an auditable event... not an exception a caller must
//    separately catch"), not a request-level failure -- it flows back as
//    `{ ok: true, event }` here (this module's `ok` describes whether a
//    RollEvent was produced at all, not whether the roll succeeded) and
//    the route returns it with HTTP 200, exactly like GET /rules/summary
//    already returns 200 for a "configured but broken" World. Only
//    failures that happen BEFORE a RollEvent could exist at all
//    (unconfigured World, broken runtime, unresolvable roll type) are
//    request-level failures here.

import { randomBytes } from 'node:crypto'
import { getWorldRuntime, type WorldRuntimeFailure } from './world-runtime-service'
import { requestRoll, type RollEvent } from '../../app/lib/rules/roll-service'
import type { ActorState } from '../../app/lib/rules/types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type WorldRollInput = {
  rollType: string
  actorId?: string | null
  // The only client-suppliable EvaluationContext fields -- see design
  // decision 2 for why `seed`/`world` can never come from a caller: this
  // type has no field for either.
  context?: {
    purpose?: string
    tags?: string[]
  }
}

export type WorldRollRequestFailure =
  | { stage: 'unconfigured' }
  | WorldRuntimeFailure
  | { stage: 'unknown-roll-type'; rollType: string }

export type WorldRollRequestResult =
  | { ok: false; failure: WorldRollRequestFailure }
  | { ok: true; event: RollEvent }

// See design decision 3.
const PLACEHOLDER_ACTOR_ID = 'anonymous'

function buildActorState(actorId: string): ActorState {
  return {
    actorId,
    packageId: 'eldra.world-roll.ad-hoc',
    packageVersion: '1.0.0',
    stateSchemaVersion: 1,
    values: {},
    collections: {},
    choices: {},
    sources: []
  }
}

// The canonical entry point for executing a Rules roll against a World's
// active package. Composes getWorldRuntime -> roll-type resolution ->
// requestRoll, in that order, and nothing else. Never throws for an
// expected failure; every branch a composed call can report is surfaced as
// a WorldRollRequestResult.
export async function requestWorldRoll(worldId: string | number, input: WorldRollInput): Promise<WorldRollRequestResult> {
  const runtime = await getWorldRuntime(worldId)

  if (!runtime.configured) {
    return { ok: false, failure: { stage: 'unconfigured' } }
  }
  if (!runtime.ok) {
    const { configured: _configured, ok: _ok, ...failure } = runtime
    return { ok: false, failure }
  }

  // Design decision 1: resolve against the ALREADY-RESOLVED, filtered
  // list -- never the raw manifest declarations.
  const resolvedRollType = runtime.runtime.worldConfig.rollTypes.find((entry) => entry.id === input.rollType)
  if (!resolvedRollType) {
    return { ok: false, failure: { stage: 'unknown-roll-type', rollType: input.rollType } }
  }

  const actorId = input.actorId?.trim() || PLACEHOLDER_ACTOR_ID
  const seed = randomBytes(16).toString('hex')

  const event = requestRoll({
    rollSpecId: resolvedRollType.rollSpec,
    registry: runtime.runtime.registry,
    graph: runtime.runtime.dependencyGraph,
    actorState: buildActorState(actorId),
    context: {
      purpose: input.context?.purpose,
      tags: input.context?.tags,
      world: runtime.runtime.worldConfig.snapshot,
      seed
    }
  })

  return { ok: true, event }
}
