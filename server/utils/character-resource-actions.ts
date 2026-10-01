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
// ORDERING AND RACE LIMITATIONS -- HONESTLY REPORTED, NOT SOLVED HERE
// ---------------------------------------------------------------------------
// Costs are checked against a SINGLE fresh read (step 2-4 above happen
// against one `getDerivedCharacter`/`loadCharacterResources` pair), then
// written in one `saveCharacterResources` call -- there is no
// optimistic-concurrency token and no database-level transaction across the
// read and the write, the SAME documented, accepted limitation
// character-cast.ts's own "KNOWN, UN-SOLVED RACE: TWO CLIENTS, ONE LAST
// SLOT" section already names for spell slot expenditure. Two genuinely
// simultaneous consumptions of a resource's LAST unit can both pass the
// availability check before either writes, silently losing one decrement --
// documented here for the identical reason it is documented there, not
// fixed in this foundational pass.
//
// ---------------------------------------------------------------------------
// NO DOUBLE-APPLICATION / FAILURE NEVER CONSUMES
// ---------------------------------------------------------------------------
// A rejected consumption (any cost unaffordable, an unresolved resource, an
// Action this character has no access to) performs ZERO persistence writes
// -- `saveCharacterResources` is only ever reached after every cost in the
// batch is confirmed affordable.

import { getDerivedCharacter } from './character-derived'
import { assembleCharacter } from './character-assembly'
import { getWorldRuntime } from './world-runtime-service'
import { buildActorState } from './character-actor-bridge'
import { loadCharacterResources, saveCharacterResources } from './character-resources'
import { emptyCharacterResources, expendResource } from '../../app/lib/characters/resources'
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
    levelDefinitionId: registry.getBySemanticRole('level')?.id
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

  const storedResources = (await loadCharacterResources(characterId)) ?? emptyCharacterResources()

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
    const currentExpended = storedResources.expended[cost.resource] ?? 0
    const remaining = resource.max - currentExpended

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

  let nextExpended = storedResources.expended
  for (const entry of resolved) {
    nextExpended = expendResource(nextExpended, entry.resourceId, entry.max, entry.amount)
  }

  await saveCharacterResources(characterId, { expended: nextExpended })

  return {
    ok: true,
    consumed: resolved.map((entry) => ({
      resourceId: entry.resourceId,
      amount: entry.amount,
      remaining: entry.max - (nextExpended[entry.resourceId] ?? 0)
    }))
  }
}
