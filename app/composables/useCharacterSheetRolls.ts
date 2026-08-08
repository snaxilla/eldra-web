// Wires the Character Sheet's simple d20 roll interactions (ability
// checks, saving throws, skill checks) through the Rules Engine's Roll
// Service (app/lib/rules/roll-service.ts) instead of handing a dice
// notation string straight to the 3D dice box. See
// .github/docs/architecture/rules-engine.md §17 and this task's own ROLL
// FLOW: Character Sheet -> requestRoll -> Roll Service -> Roll Engine ->
// RollResult -> existing-style display (no 3D Dice yet, per this task's
// own NON-GOALS).
//
// Scope: this composable only builds and executes a generic "1d20 + flat
// bonus" RollSpec. The bonus itself is still computed entirely by the
// Character Sheet's own existing math (ability modifiers, proficiency,
// etc, all untouched) -- this file never reads or interprets 5e rules. It
// deliberately does not name "ability check"/"saving throw"/"skill check"
// as roll TYPES the engine itself understands (that would violate this
// task's explicit "do not hardcode roll types" constraint, and the
// Roll Engine/Service's own prior commits already establish this
// discipline) -- those are just caller-supplied labels attached to an
// otherwise anonymous RollSpec. "World Configuration will eventually
// define default roll types" (architecture framing); the engine only ever
// executes RollSpecs.
//
// No RulesPackage/ActorState bridge exists yet for the D&D 5e character
// sheet system (a large, separate future migration, explicitly out of
// this task's scope) -- so this builds the smallest possible one-off
// Registry/Graph/ActorState per roll, entirely in memory, never touching
// Directus or any other persistence.
//
// Explicit `vue` import, unlike this codebase's other composables
// (useSidebar.ts/useTheme.ts, which rely on Nuxt's auto-import of `ref`/
// `useState`): this file must also run correctly under the project's
// existing plain-Vitest unit test setup (vitest.config.ts has no Nuxt
// auto-import transform), which this task's own TESTING section requires
// exercising directly. Explicit imports work identically inside Nuxt's
// build, so this loses nothing there.
//
// Seed generation here is client-side (`Math.random()`-based) purely to
// prove the Character Sheet -> Roll Service wiring end to end, per this
// task's own scope ("Nothing more"). §15.8 of the architecture states the
// server is "authoritative... for all randomness" -- a real,
// production-ready call site must eventually generate its seed
// server-side (Networking work this task's NON-GOALS explicitly exclude).
// Flagged here, not solved here. The Rules Engine itself (rng.ts,
// roll-engine.ts, roll-service.ts) still uses zero Math.random() --
// nothing about that invariant changes.

import { ref } from 'vue'
import { DependencyGraph } from '../lib/rules/dependency-graph'
import { parseExpression } from '../lib/rules/parser'
import { RulesRegistry } from '../lib/rules/registry'
import { requestRoll, type RollEvent } from '../lib/rules/roll-service'
import type { ActorState, DefinitionId, Expression, RollSpec, RulesPackageManifest } from '../lib/rules/types'

const ROLL_SPEC_ID: DefinitionId = 'roll:character-sheet.d20-check'

// A fixed, minimal ActorState -- this roll never reads `@value:`/
// `@collection:`/`@source:` (the dice expression is a self-contained
// literal, e.g. "1d20+5"), so nothing here is ever consulted. It exists
// only because EvaluationSession's constructor requires one.
const ACTOR_STATE: ActorState = {
  actorId: 'character-sheet',
  packageId: 'eldra.character-sheet.ad-hoc',
  packageVersion: '1.0.0',
  stateSchemaVersion: 1,
  values: {},
  collections: {},
  choices: {},
  sources: []
}

function manifest(): RulesPackageManifest {
  return {
    packageId: 'eldra.character-sheet.ad-hoc',
    version: '1.0.0',
    status: 'draft',
    engineApiVersion: '^1.0.0',
    stateSchemaVersion: 1,
    title: 'Character Sheet ad hoc rolls',
    license: { id: 'CC0-1.0' },
    capabilities: [],
    dependencies: []
  }
}

function diceExpression(bonus: number): Expression {
  // Always spelled as "1d20+<N>", including negative N (e.g. "1d20+-2"):
  // evaluateBinary's diceSpec+number support (evaluator.ts, added for the
  // Roll Engine) only covers '+', not '-' -- "1d20-2" would parse as
  // binary('-', dice, 2), which is unsupported and errors. A leading '+'
  // followed by a signed number literal instead becomes
  // binary('+', dice, unary('-', 2)), which resolves to a number before
  // reaching diceSpec+number, taking the already-supported path.
  const text = `1d20+${bonus}`
  const result = parseExpression(text)
  if (!result.ok) {
    throw new Error(`Character Sheet roll produced an unparseable expression '${text}': ${JSON.stringify(result.diagnostics)}`)
  }
  return { text, ast: result.ast as Expression['ast'] }
}

function anonymousD20RollSpec(bonus: number): RollSpec {
  return {
    id: ROLL_SPEC_ID,
    kind: 'roll',
    dice: diceExpression(bonus),
    // 'manual' (§17.3) means "no dice at all" -- roll-engine.ts skips
    // rolling entirely for it (design decision 4 there). This sheet
    // integration wants the dice rolled but has no pass/fail threshold to
    // interpret, so an unrecognized kind is the correct choice: the Roll
    // Engine still rolls and computes `total`, and simply leaves
    // `success`/`successCount` undefined rather than guessing a meaning
    // (same module, design decision 3).
    successRule: { kind: 'none' }
  }
}

function freshSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function failureEvent(message: string): RollEvent {
  return {
    eventId: `roll-event:character-sheet:${freshSeed()}`,
    rollSpecId: ROLL_SPEC_ID,
    actorId: ACTOR_STATE.actorId,
    ok: false,
    error: { definitionId: ROLL_SPEC_ID, message }
  }
}

export function useCharacterSheetRolls() {
  // Local component state (CLAUDE.md's own convention: `useState` is for
  // cross-component/SSR-shared state; this is neither -- it is one sheet
  // instance's own transient "what did the last roll produce" readout).
  // `lastRollLabel` is tracked alongside `lastRollEvent` because RollEvent
  // (roll-service.ts) intentionally carries no human label -- that is a
  // presentation concern the Roll Service itself deliberately stays
  // agnostic to; the caller (this composable) is the right place to pair
  // one back up for display.
  const lastRollEvent = ref<RollEvent | null>(null)
  const lastRollLabel = ref('')

  // `seedOverride` exists for determinism testing (this task's own
  // "deterministic repeated results with identical seed" requirement) --
  // real call sites never pass it, and get a fresh seed every roll, which
  // is the correct behavior for repeated clicks producing different
  // results.
  function rollD20Check(bonus: number, label: string, seedOverride?: string): RollEvent {
    lastRollLabel.value = label

    if (!Number.isFinite(bonus)) {
      const event = failureEvent(`Cannot roll '${label}' -- its bonus is not a valid number`)
      lastRollEvent.value = event
      return event
    }

    const rollSpec = anonymousD20RollSpec(bonus)

    const registryResult = RulesRegistry.create(manifest(), [rollSpec])
    if (!registryResult.ok) {
      const event = failureEvent(`Could not build a Roll Spec for '${label}': ${JSON.stringify(registryResult.errors)}`)
      lastRollEvent.value = event
      return event
    }

    const graphResult = DependencyGraph.build(registryResult.registry)
    if (!graphResult.ok) {
      const event = failureEvent(`Could not build a Roll Spec for '${label}': ${JSON.stringify(graphResult.errors)}`)
      lastRollEvent.value = event
      return event
    }

    const event = requestRoll({
      rollSpecId: ROLL_SPEC_ID,
      registry: registryResult.registry,
      graph: graphResult.graph,
      actorState: ACTOR_STATE,
      context: { seed: seedOverride ?? freshSeed(), purpose: label }
    })

    lastRollEvent.value = event
    return event
  }

  return { lastRollEvent, lastRollLabel, rollD20Check }
}
