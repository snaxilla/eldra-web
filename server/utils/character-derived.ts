// The Character Rules Projection -- rules-package-architecture.md §11.3.
//
// The Rules Engine returns one value per Definition ID. A sheet needs a
// coherent model. This module is the read-model over those calls: it
// composes Character Assembly, the actor bridge, and the World's active
// Rules Runtime, runs the evaluator, and returns what it computed grouped
// by Rule Category.
//
// ---------------------------------------------------------------------------
// DERIVED ON DEMAND, PERSISTED NOWHERE
// ---------------------------------------------------------------------------
// Every call rebuilds the ActorState from current content and re-evaluates
// from scratch. Nothing here writes to Directus, and there is no cache. That
// is ADR-003 ("derived values are never stored") applied literally: a
// persisted derived value is a cache with no invalidation strategy, and it
// is how a sheet silently drifts out of sync with the rules that produced
// it. Rebuilding is cheap; storing is dangerous.
//
// ---------------------------------------------------------------------------
// IT KNOWS NO GAME
// ---------------------------------------------------------------------------
// This module contains no ability name, no skill name, and no Definition ID.
// It asks the registry what Definitions exist, evaluates the ones that have
// a single evaluable value, and groups the results by the `category` each
// Definition declares. Everything specific to D&D lives in the package on
// disk; everything specific to 5etools lives in the Rules Facets. Swap the
// active package for a Call of Cthulhu one and this file returns Sanity and
// percentile skills without a line changing.
//
// That is why the projection is a FLAT LIST GROUPED BY CATEGORY rather than
// a `{ abilities, saves, skills }` shape: the moment it names those three,
// it has learned a game, and the next system needs a code change. Category
// is the agnostic vocabulary (§13.2: "Sheet regions address Rule
// Categories"), and choosing WHICH categories to render is the sheet's job.
//
// ---------------------------------------------------------------------------
// ONLY `kind: 'value'` IS EVALUATED
// ---------------------------------------------------------------------------
// Tables, Progressions, and ChoiceSets have no single evaluable RuleValue --
// asking the evaluator for one returns a RulesError by design (Step 2). They
// are skipped rather than evaluated-and-discarded, so an error in this
// projection always means something genuinely went wrong.

import { evaluate } from '../../app/lib/rules/evaluator'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import type { RuleCategory, RulesError, RuleValue } from '../../app/lib/rules/types'
import { assembleCharacter, type CharacterAssemblyBlueprint } from './character-assembly'
import { buildActorState, type PendingChoice } from './character-actor-bridge'
import { getWorldRuntime } from './world-runtime-service'

// Mirrors evaluator.ts's and modifier-pipeline.ts's own `isRulesError`
// exactly. Duplicated rather than imported for the reason those two already
// document: neither exports it, and the engine deliberately keeps this
// structural check local to each module rather than exporting a shared one.
// Adding an export to the engine to save six lines here would be an engine
// change this step has no mandate for.
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

// One evaluated Definition. `value` is whatever the engine returned;
// `error` is set instead when evaluation produced a RulesError, because a
// broken formula must be visible rather than rendered as a plausible zero
// (§28's "visible degradation").
export type DerivedValue = {
  id: string
  label?: string
  category: RuleCategory
  tags?: string[]
  value?: RuleValue
  error?: string
}

export type DerivedCharacter = {
  worldId: string
  characterId: string
  characterTitle: string
  packageId: string
  packageVersion: string
  // Grouped by the category each Definition declares. A category with no
  // Definitions simply has no key -- the sheet then renders no region for
  // it, which is the visible degradation §13.2 describes.
  byCategory: Partial<Record<RuleCategory, DerivedValue[]>>
  // Declared by a facet, answered by nobody yet (see the bridge's header).
  pendingChoices: PendingChoice[]
  // Facet-granted ids the active package does not declare (§8.2 rule 1).
  unresolvedGrants: string[]
}

export type DerivedCharacterResult =
  | { available: true; derived: DerivedCharacter }
  | { available: false; reason: 'character-not-found' }
  | { available: false; reason: 'no-catalogue-selection'; message: string }
  // The World has no Rules Package activated. Legal and common -- the
  // character still exists and the Sheet still renders its content; there
  // is simply nothing to derive (§10.2: "absence is a legal state").
  | { available: false; reason: 'rules-unconfigured'; message: string }
  // A package IS activated but failed to load or build. Deliberately
  // DISTINCT from unconfigured -- collapsing the two would turn a corrupt
  // package into "no rules configured" and hide the failure, which
  // world-runtime-service.ts names as the single most likely mistake here.
  | { available: false; reason: 'rules-broken'; message: string }

function describeBlueprint(blueprint: CharacterAssemblyBlueprint) {
  return {
    worldId: blueprint.worldId,
    characterId: blueprint.characterId,
    characterTitle: blueprint.characterTitle
  }
}

// The canonical entry point. Composes assembleCharacter -> getWorldRuntime
// -> buildActorState -> evaluate, in that order, and nothing else.
export async function getDerivedCharacter(
  worldId: string | number,
  characterId: string | number
): Promise<DerivedCharacterResult> {
  const assembly = await assembleCharacter(worldId, characterId)
  if (!assembly.available) {
    return assembly
  }

  const runtime = await getWorldRuntime(worldId)

  if (!runtime.configured) {
    return {
      available: false,
      reason: 'rules-unconfigured',
      message: 'This World has no Rules Package activated, so there is nothing to derive from this character\'s data.'
    }
  }

  if (!runtime.ok) {
    return {
      available: false,
      reason: 'rules-broken',
      message: `This World's active Rules Package failed to load (${runtime.stage}). Derived values are unavailable until it is repaired or a different version is activated.`
    }
  }

  const { registry, dependencyGraph, worldConfig, packageId, packageVersion } = runtime.runtime

  const bridged = buildActorState({
    blueprint: assembly.blueprint,
    packageId,
    packageVersion,
    stateSchemaVersion: runtime.runtime.manifest.stateSchemaVersion,
    knownDefinition: (id) => registry.has(id)
  })

  // ONE session for the whole projection, so the evaluator's own memo cache
  // does its job: `value:proficiency_bonus` is read by all six saves and all
  // eighteen skills, and is computed once.
  const session = new EvaluationSession(registry, dependencyGraph, bridged.actorState, {
    world: worldConfig.snapshot
  })

  const byCategory: Partial<Record<RuleCategory, DerivedValue[]>> = {}

  for (const definition of registry.listAll()) {
    if (definition.kind !== 'value') continue

    const category = definition.category
    if (!category) continue

    const result = evaluate(definition.id, session)
    const entry: DerivedValue = {
      id: definition.id,
      label: definition.label,
      category,
      tags: definition.tags
    }

    if (isRulesError(result)) {
      entry.error = result.message
    } else {
      entry.value = result
    }

    const group = byCategory[category]
    if (group) group.push(entry)
    else byCategory[category] = [entry]
  }

  return {
    available: true,
    derived: {
      ...describeBlueprint(assembly.blueprint),
      packageId,
      packageVersion,
      byCategory,
      pendingChoices: bridged.pendingChoices,
      unresolvedGrants: bridged.unresolvedGrants
    }
  }
}
