// Character Resource Action Consumption -- D&D 2024 Character Rules Phase
// 2A.2, RESOURCE ACTION CONSUMPTION FOUNDATION.
//
// ---------------------------------------------------------------------------
// SCOPE -- FOUNDATION ONLY, NOT A CLASS ACTION CATALOGUE
// ---------------------------------------------------------------------------
// This phase's own explicit instruction: "Do NOT implement every class
// feature action in this phase unless content is already structurally
// sufficient... establish the foundation so future package-authored actions
// can consume resources authoritatively." No Action Definition authored
// this phase declares a `costs` entry naming a Resource -- `ActionCost`
// (`{resource: DefinitionId, amount: Expression}`, app/lib/rules/types.ts
// §17) already existed, unconsumed, before this phase, exactly like
// `kind:'resource'`'s own `max` field did (see app/lib/rules/types.ts's own
// Phase 2A.2 header on ResourceDefinition). This module is the one place
// that consumes it -- proven by this file's own test against SYNTHETIC
// Action/Resource content (the same "prove the mechanism against synthetic
// data, keep real authored content honest and minimal" precedent
// character-progression-plan.test.ts already established for Progression),
// not by authoring a real Rage/Second-Wind-triggering Action this phase.
//
// ---------------------------------------------------------------------------
// AUTHORITY -- EVERY NUMBER IS SERVER-DERIVED, NOTHING IS CLIENT-SUPPLIED
// ---------------------------------------------------------------------------
// The caller supplies only `actionId` (which Action to invoke). This module:
//   1. resolves the Action Definition against the ACTIVE package's registry
//      (never trusts a client-supplied label/cost/resource shape);
//   2. for each of its `costs[]`, resolves `cost.resource` and confirms it
//      is a real `kind: 'resource'` Definition this character has actually
//      ACQUIRED (character-actor-bridge.ts's `acquiredResourceIds` --
//      spending a resource the character never had access to is rejected,
//      never silently allowed because the id happens to resolve);
//   3. evaluates `cost.amount` (an Expression) against this character's own
//      REAL ActorState/session -- the SAME evaluation every other Rules
//      Engine number in this codebase already goes through, never a
//      literal trusted from anywhere else;
//   4. checks CURRENT remaining (max - persisted expended) against that
//      amount BEFORE consuming anything;
//   5. if every cost is affordable, consumes ALL of them together and
//      persists; if ANY cost is unaffordable, consumes NONE -- an action
//      either fully pays for itself or does not execute at all, never a
//      partial deduction.
//
// ---------------------------------------------------------------------------
// ORDERING AND RACE -- CLOSED (CHARACTER MECHANICS PHASE A5, Checkpoint 1)
// ---------------------------------------------------------------------------
// Costs are checked against a fresh read first (step 2-4 above, against
// `getDerivedCharacter`'s own `derivedResult.derived.resources`) PURELY for
// a precise, per-resource error message -- that read is no longer
// authoritative, though as of the cache-coherency hotfix (see
// character-assembly.ts's own doc comment) it is no LESS fresh than the
// atomic write below, either. The actual mutation is one atomic,
// database-level, all-or-nothing statement
// (`expendCharacterResourcesAtomic`, server/utils/character-resource-atomic.ts)
// that re-checks every cost's sufficiency against the row's LIVE value at
// write time, closing the race this header previously documented as
// accepted: two genuinely simultaneous consumptions of a resource's last
// unit can no longer both succeed -- the database serializes them, and the
// second cleanly observes insufficiency rather than silently losing a
// decrement. `character-cast.ts`'s own spell-SLOT race remains open (slots
// are explicitly out of this Checkpoint's scope); this module's own
// resource race is the one this phase closes.
//
// ---------------------------------------------------------------------------
// NO DOUBLE-APPLICATION / FAILURE NEVER CONSUMES
// ---------------------------------------------------------------------------
// A rejected consumption (any cost unaffordable, an unresolved resource, an
// Action this character has no access to, or the atomic write itself
// rejecting the batch) performs ZERO persistence writes -- the atomic call
// is only ever reached after every cost's pre-check passes, and the SQL
// statement itself is all-or-nothing: either every cost in the batch is
// applied in one write, or none of them are.

import { getDerivedCharacter } from './character-derived'
import { assembleCharacter } from './character-assembly'
import { getWorldRuntime } from './world-runtime-service'
import { buildActorState } from './character-actor-bridge'
import { expendCharacterResourcesAtomic } from './character-resource-atomic'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { evaluate, evaluateStandaloneExpression } from '../../app/lib/rules/evaluator'
import type { Expression, RuleValue } from '../../app/lib/rules/types'

export type ConsumeActionCostFailureReason =
  | 'character-not-found'
  | 'no-catalogue-selection'
  | 'rules-unconfigured'
  | 'rules-broken'
  | 'unknown-action'
  | 'unresolved-cost-resource'
  | 'resource-not-acquired'
  | 'insufficient-resource'
  // CHARACTER MECHANICS PHASE A5 -- the atomic batch write
  // (character-resource-atomic.ts) is the SOLE authority for whether the
  // consumption actually succeeds; this covers a misconfigured/unreachable
  // persistence layer, or a genuine last-moment race the pre-check below
  // (a best-effort, non-authoritative read for a precise error message)
  // could not see.
  | 'resource-persistence-failure'
  // PRODUCTION CACHE-COHERENCY HOTFIX -- relayed verbatim from
  // `getDerivedCharacter`'s own identical reason (character-assembly.ts's
  // `readCharacterResourcesAtomic` doc comment): the `resources` block's
  // authoritative Postgres read itself failed, before any cost was even
  // resolved. Distinct from `resource-persistence-failure` above, which is
  // specifically the atomic WRITE failing.
  | 'resource-persistence-unavailable'

export type ConsumeActionCostResult =
  | { ok: true; consumed: { resourceId: string; amount: number; remaining: number }[] }
  | { ok: false; reason: ConsumeActionCostFailureReason; message: string }

function isExpression(value: unknown): value is Expression {
  return typeof value === 'object' && value !== null && 'text' in value && 'ast' in value
}

function numeric(value: RuleValue): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

// Re-composes the same canonical assembleCharacter -> getWorldRuntime ->
// buildActorState -> EvaluationSession chain character-derived.ts's own
// header documents, strictly for evaluating a Cost's own `amount`
// Expression against this character's real state -- this module has no
// mandate to refactor that composition into a shared export (a genuine,
// separate improvement; see this file's own FOUNDATION ONLY header for why
// this phase's scope stops short of it). Returns `null` on any failure
// already reported by `getDerivedCharacter` above, since the caller already
// surfaces that failure through its own, richer error path.
async function buildEvaluationSession(worldId: string | number, characterId: string | number) {
  const assembly = await assembleCharacter(worldId, characterId)
  if (!assembly.available) return null

  const runtime = await getWorldRuntime(worldId)
  if (!runtime.configured || !runtime.ok) return null

  const { registry, dependencyGraph, worldConfig, packageId, packageVersion } = runtime.runtime
  const bridged = buildActorState({
    blueprint: assembly.blueprint,
    packageId,
    packageVersion,
    stateSchemaVersion: runtime.runtime.manifest.stateSchemaVersion,
    knownDefinition: (id) => registry.has(id),
    rulesChoices: assembly.blueprint.rulesChoices,
    levelDefinitionId: registry.getBySemanticRole('level')?.id,
    // LANGUAGE CORPUS + POLICY PHASE -- see character-derived.ts's own
    // identical threading for why this exists.
    universalFacet: runtime.runtime.manifest.universalCreation ?? null
  })

  return {
    registry,
    session: new EvaluationSession(registry, dependencyGraph, bridged.actorState, { world: worldConfig.snapshot })
  }
}

// The foundation's one entry point. `actionId` names an Action Definition
// the active package declares -- this module never accepts a cost, a
// resource id, or an amount directly from a caller; everything beyond
// "which Action" is re-derived from the package and this character's own
// state.
export async function consumeActionResourceCosts(
  worldId: string | number,
  characterId: string | number,
  actionId: string
): Promise<ConsumeActionCostResult> {
  const derivedResult = await getDerivedCharacter(worldId, characterId)
  if (!derivedResult.available) {
    if (derivedResult.reason === 'character-not-found') {
      return { ok: false, reason: 'character-not-found', message: 'Character not found in this world' }
    }
    return { ok: false, reason: derivedResult.reason, message: derivedResult.message }
  }

  const evaluation = await buildEvaluationSession(worldId, characterId)
  if (!evaluation) {
    return { ok: false, reason: 'rules-broken', message: 'This World\'s active Rules Package could not be evaluated.' }
  }
  const { registry, session } = evaluation

  const action = registry.getById(actionId)
  if (!action || action.kind !== 'action') {
    return { ok: false, reason: 'unknown-action', message: `'${actionId}' is not a known Action in this World's active Rules Package` }
  }

  const acquiredResourceIds = new Set(derivedResult.derived.resources.map((resource) => resource.id))
  const resourceById = new Map(derivedResult.derived.resources.map((resource) => [resource.id, resource]))

  // PRODUCTION CACHE-COHERENCY HOTFIX -- this used to re-read the stored
  // `resources` block a second time here (`loadCharacterResources`, via
  // Directus REST), purely for this pre-check. That second read is no
  // longer needed at all: `derivedResult.derived.resources` above already
  // carries each resource's own `expended`/`remaining`, and -- since
  // `getDerivedCharacter` -> `assembleCharacter` now reads the `resources`
  // block through the SAME atomic, Directus-independent path the write
  // below uses (character-assembly.ts's own doc comment) -- it is already
  // exactly as authoritative as a fresh read would be. Removing the
  // redundant call closes the one remaining place this file could have
  // seen a Directus-cache-stale value, by deleting the read entirely rather
  // than swapping it for another database round trip.
  //
  // Resolve every cost's authoritative amount and current availability
  // BEFORE consuming anything (step 2-4 of this file's own AUTHORITY
  // header) -- an all-or-nothing batch, never a partial deduction.
  const resolved: { resourceId: string; amount: number; max: number }[] = []

  for (const cost of action.costs ?? []) {
    const resourceDefinition = registry.getById(cost.resource)
    if (!resourceDefinition || resourceDefinition.kind !== 'resource') {
      return {
        ok: false,
        reason: 'unresolved-cost-resource',
        message: `'${cost.resource}' is not a known Resource in this World's active Rules Package`
      }
    }

    if (!acquiredResourceIds.has(cost.resource)) {
      return {
        ok: false,
        reason: 'resource-not-acquired',
        message: `This character has not acquired '${cost.resource}'`
      }
    }

    const amount = numeric(
      isExpression(cost.amount) ? evaluateStandaloneExpression(cost.amount, session, cost.resource) : evaluate(cost.resource, session)
    )

    const resource = resourceById.get(cost.resource)!
    const remaining = resource.remaining

    if (remaining < amount) {
      return {
        ok: false,
        reason: 'insufficient-resource',
        message: `'${cost.resource}' has ${remaining} remaining, but this action costs ${amount}`
      }
    }

    resolved.push({ resourceId: cost.resource, amount, max: resource.max })
  }

  if (!resolved.length) {
    return { ok: true, consumed: [] }
  }

  // CHARACTER MECHANICS PHASE A5 -- the actual mutation is now one atomic,
  // database-level, all-or-nothing statement (character-resource-atomic.ts)
  // instead of a JS-computed read-modify-write -- the pre-check above
  // (against `derivedResult.derived.resources`, read once at the top of
  // this function) stays only a best-effort source for a precise
  // per-resource error message; the atomic call below is the SOLE authority
  // for whether this consumption actually happens.
  const atomicResult = await expendCharacterResourcesAtomic({
    worldId,
    characterId,
    costs: resolved.map((entry) => ({ resourceId: entry.resourceId, amount: entry.amount, max: entry.max }))
  })

  if (!atomicResult.ok) {
    if (atomicResult.reason === 'insufficient-resource') {
      return { ok: false, reason: 'insufficient-resource', message: atomicResult.message }
    }
    return { ok: false, reason: 'resource-persistence-failure', message: atomicResult.message }
  }

  const nextExpended = atomicResult.expended

  return {
    ok: true,
    consumed: resolved.map((entry) => ({
      resourceId: entry.resourceId,
      amount: entry.amount,
      remaining: entry.max - (nextExpended[entry.resourceId] ?? 0)
    }))
  }
}
