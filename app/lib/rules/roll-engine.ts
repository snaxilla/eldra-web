// Roll Engine.
// See .github/docs/architecture/rules-engine.md §17 (Action/Check/Roll
// Model), specifically §17.3 (Roll Spec -- one structure, all three
// families), §17.4 (randomness and determinism), and §14.6 (dice are
// values, not evaluation) for the design this implements.
//
// This module executes a RollSpec: it evaluates the Spec's `dice`
// Expression (via the existing evaluator -- this module owns none of
// parsing, validation, evaluation, or modifier discovery), rolls the
// resulting DiceSpec with a deterministic seeded RNG (rng.ts), applies the
// Spec's own selection/reroll rules, and interprets its own successRule.
// It does NOT execute Actions, does NOT know what a "Luck Roll" or
// "Initiative Roll" is, does NOT touch Combat/Networking/UI/3D Dice, and
// does NOT validate packages -- see the task's own NON-GOALS.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS AND GAPS FOUND (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. Seed comes from `session.context.seed` (§15.6: "rolls only"), not a
//    separate function parameter. Every worked roll example in the
//    architecture (§17.3, the observeCheck/overload examples) pairs
//    exactly ONE seed with exactly ONE roll, and §17.2's Action pipeline
//    performs exactly one roll per Action invocation -- there is no example
//    anywhere of two different rolls sharing one seed. Read together, the
//    intended granularity is "one EvaluationSession's context carries the
//    one seed for the one roll it is used for," which is exactly what
//    EvaluationContext.seed already models. A caller needing several
//    independent rolls (e.g. to-hit then damage) constructs several
//    sessions/contexts, each with its own server-generated seed (§17.4) --
//    seed *generation* is a server/game-layer concern this task explicitly
//    places out of scope (Action execution, Combat), not something this
//    module invents a second mechanism for. Missing/empty seed is a
//    RulesError, never a silent fallback to non-determinism.
//
// 2. Two genuine gaps found in the already-shipped evaluator while wiring
//    this up, both fixed in evaluator.ts (see that file's comments at the
//    fix sites) because without them "execute arbitrary RollSpecs" is
//    unachievable for 2 of the 3 named proof families:
//      - `diceSpec + number` was unhandled in evaluateBinary's `+` case,
//        so `"1d20 + @mod"` (the d20 roll-over AND advantage families'
//        own worked spelling, §17.3) evaluated straight to a RulesError
//        before this module ever saw a DiceSpec. Fixed: `+` between a
//        DiceSpec and a number now attaches/accumulates a flat
//        `modifier` key on the DiceSpec, the same way keepHighest/
//        keepLowest/explode/reroll already annotate one.
//      - `successRule.threshold` is typed `Expression | RuleValue`
//        (types.ts) -- the percentile roll-under family's own worked
//        example (`atMost: @value:skill`) needs the Expression form
//        evaluated. evaluator.ts had no public entrypoint for evaluating
//        an arbitrary Expression (only whole Definitions, via `evaluate`).
//        Fixed by exporting `evaluateStandaloneExpression`, a thin wrapper
//        around the exact same internal call `computeDefinition` already
//        makes for ResourceDefinition.max/ActionCost.amount -- no new
//        evaluation logic, just exposing what already existed.
//
// 3. `successRule.kind` is left open (types.ts's own comment: shown values
//    are not stated as a closed vocabulary). This module implements the
//    three named, unambiguous kinds -- `atLeast`, `atMost` (single value
//    vs. threshold), `countAtLeast` (count of kept dice >= threshold, the
//    dice-pool family's own mechanic -- feeds a future Action Engine's
//    `@ctx:successes`, per §17.1's outcome example) -- plus `manual`
//    (§17.3's table: "(none)" dice, "-" selection; this module skips
//    rolling entirely and returns an empty, unrolled RollResult, exactly
//    matching that row). Any OTHER kind still produces a fully-formed
//    RollResult (dice rolled, total computed) but leaves `success`/
//    `successCount` both undefined rather than guessing a meaning for an
//    unknown vocabulary member -- visible degradation (§28), not a wrong
//    number.
//
// 4. `degrees` (RollSpec.degrees, §17.3) is deliberately NOT evaluated
//    here. Every worked `degrees[].when` example references `@ctx:
//    successes` (§17.1's Action outcome example uses the same `@ctx:`
//    namespace), and evaluator.ts's own design decision 2 documents `@ctx:`
//    as intentionally unresolvable in the current runtime model (no
//    populated EvaluationContext shape to read it against yet). Building
//    that wiring is Action-Engine-shaped work (populating `@ctx:` from a
//    roll's own result, mid-pipeline) -- squarely the "Action execution"
//    this task explicitly excludes. RollResult exposes exactly the raw
//    ingredients (`total`, `success`, `successCount`) a future consumer
//    needs to evaluate `degrees` itself; this module does not attempt it.
//
// 5. `DiceSpec.keep`/`keepCount` (from `keepHighest`/`keepLowest` dice
//    construction, §14.5) ARE honored -- they are fully parameterized
//    (an explicit mode and count) and ignoring them would silently total
//    the wrong dice for e.g. a "4d6 drop lowest" RollSpec whose `dice`
//    field is `keepHighest(4d6, 3)`. Applied before RollSpec.selection
//    (§17.3), since it is baked into the DiceSpec itself and Selection is
//    a separate, later-stage concept in the Roll Spec's own model.
//
// 6. `DiceSpec.explode`/`.reroll` (from the `explode`/`reroll` dice
//    construction functions) are NOT honored -- evaluateCall (evaluator.ts)
//    annotates them as bare `true` flags with no threshold/count
//    parameter at all, and neither the architecture nor any worked example
//    states a default (explode on max face? reroll on 1?). Guessing either
//    would risk a silently wrong roll (§28's exact concern). A RollSpec
//    whose evaluated DiceSpec carries either flag produces a clear
//    RulesError instead.
//
// 7. `RollReroll.when` (types.ts) is typed as a bare `string`, not an
//    Expression -- deliberately, since it is not EEL grammar. The one
//    worked example (§16.5's capability matrix: `reroll: {when: "<= 1",
//    limit: 1}`) is a tiny comparison micro-grammar (`<op><number>`) this
//    module parses on its own, narrowly, rather than routing it through
//    the shared parser/evaluator (which has no rule for it -- it was never
//    meant to). An unparseable `when` is a RulesError. `limit` defaults to
//    1 when omitted -- the only worked example always supplies one, and
//    "reroll once" is the only default that can never risk an unbounded
//    loop (some `when` conditions, e.g. "<= 6" on a d6, would match every
//    possible face).

import type { EvaluationSession } from './evaluation-session'
import { evaluate, evaluateStandaloneExpression } from './evaluator'
import { createSeededRng } from './rng'
import type { DefinitionId, DiceSpec, Expression, RuleValue, RulesError } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// One die substitution performed by RollSpec.reroll (design decision 7),
// in the order it happened -- audit trail for replay/dispute (§17.4) and
// for a future 3D Dice consumer to animate "this die was rerolled."
export type RollRerollEvent = {
  index: number // index into RollResult.rolls
  from: number
  to: number
}

// Deliberately loose enough for the consumers named in this task's own
// scope (Character Sheets, Combat, Chat, Timeline, 3D Dice, Replay) without
// this module implementing any of them: every field here is either a raw
// ingredient (rolls/kept/total) or an audit fact (seed/rerolls) a consumer
// composes into its own presentation, never a presentation itself.
export type RollResult = {
  rollSpecId: DefinitionId
  seed: string
  successRuleKind: string

  // §17.3's "manual" row: no dice, no selection. `true` means every other
  // field below is intentionally empty/absent -- this roll was never rolled.
  manual: boolean

  // The DiceSpec `dice` actually evaluated to (post `@value:` resolution),
  // absent only when `manual`.
  dice?: DiceSpec

  // Raw per-die results, final values (post-reroll substitution), in
  // original die order. Empty when `manual`.
  rolls: number[]
  // Audit trail of every reroll substitution that produced `rolls`' final
  // values (design decision 7). Empty when no reroll occurred.
  rerolls: RollRerollEvent[]
  // The subset of `rolls` selection kept (design decisions 3/5), in
  // original die order.
  kept: number[]
  // Indices into `rolls` that `kept` came from, in original die order.
  keptIndices: number[]

  // sum(kept) + DiceSpec.modifier (design decision 2). Absent when `manual`.
  total?: number
  // Populated only for `successRuleKind` 'atLeast'/'atMost' (design
  // decision 3).
  success?: boolean
  // Populated only for `successRuleKind` 'countAtLeast' (design decision 3).
  successCount?: number
}

// Executes the RollSpec named by `rollSpecId` against `session`, using
// `session.context.seed` (design decision 1). Mirrors `evaluate`'s own
// signature shape (DefinitionId + EvaluationSession, nothing else) -- the
// Roll Engine's contract, per this task, is that a RollSpec plus a session
// (which already carries the seed, §15.6) is everything needed.
export function executeRoll(rollSpecId: DefinitionId, session: EvaluationSession): RollResult | RulesError {
  const definition = session.registry.getById(rollSpecId)
  if (!definition || definition.kind !== 'roll') {
    return rollError(rollSpecId, `'${rollSpecId}' is not a Roll Spec`)
  }

  const seed = session.context.seed
  if (!seed) {
    return rollError(
      rollSpecId,
      `Cannot execute Roll Spec '${rollSpecId}' -- EvaluationContext has no seed (§17.4 requires an explicit seed for every roll)`
    )
  }

  const successRuleKind = definition.successRule.kind

  // §17.3's "manual" row: "(none)" dice, "-" selection -- skip rolling
  // entirely rather than evaluating a placeholder `dice` Expression a
  // manual RollSpec was only forced to declare because the type requires
  // one (design decision 4's sibling note: RollSpec.dice has no optional
  // form in types.ts, so authors of manual specs must still supply
  // something there; this module never reads it).
  if (successRuleKind === 'manual') {
    return {
      rollSpecId,
      seed,
      successRuleKind,
      manual: true,
      rolls: [],
      rerolls: [],
      kept: [],
      keptIndices: []
    }
  }

  const diceValue = evaluate(rollSpecId, session)
  if (isRulesError(diceValue)) return diceValue
  if (!isDiceSpec(diceValue)) {
    return rollError(rollSpecId, `Roll Spec '${rollSpecId}'s dice expression did not evaluate to a diceSpec (got '${typeof diceValue}')`)
  }

  const { count, faces } = diceValue
  if (!Number.isInteger(count) || count <= 0) {
    return rollError(rollSpecId, `Roll Spec '${rollSpecId}'s diceSpec.count must be a positive integer, got '${count}'`)
  }
  if (!Number.isInteger(faces) || faces <= 0) {
    return rollError(rollSpecId, `Roll Spec '${rollSpecId}'s diceSpec.faces must be a positive integer, got '${faces}'`)
  }
  if (diceValue.explode || diceValue.reroll) {
    return rollError(
      rollSpecId,
      `Roll Spec '${rollSpecId}' requests 'explode'/'reroll' dice construction, which the Roll Engine does not support yet (design decision 6 -- neither carries a threshold to act on)`
    )
  }

  const rng = createSeededRng(seed)
  const rolls: number[] = []
  for (let i = 0; i < count; i++) rolls.push(rollOneDie(rng, faces))

  const rerolls: RollRerollEvent[] = []
  const rerollSpec = definition.reroll
  if (rerollSpec) {
    const parsedWhen = parseComparison(rerollSpec.when)
    if (!parsedWhen) {
      return rollError(
        rollSpecId,
        `Roll Spec '${rollSpecId}'s reroll.when '${rerollSpec.when}' is not a recognized comparison (expected e.g. '<= 1')`
      )
    }
    const limit = rerollSpec.limit ?? 1
    for (let i = 0; i < rolls.length; i++) {
      let used = 0
      while (used < limit && matchesComparison(rolls[i]!, parsedWhen)) {
        const from = rolls[i]!
        const to = rollOneDie(rng, faces)
        rolls[i] = to
        rerolls.push({ index: i, from, to })
        used++
      }
    }
  }

  // Design decision 5: DiceSpec.keep/keepCount first (baked into the dice
  // construction itself), then RollSpec.selection on top of what remains.
  let indices = rolls.map((_, i) => i)
  if (diceValue.keep === 'highest' || diceValue.keep === 'lowest') {
    const keepCount = typeof diceValue.keepCount === 'number' ? diceValue.keepCount : indices.length
    indices = selectIndices(rolls, indices, diceValue.keep, keepCount)
  }

  const selection = definition.selection
  if (selection && selection.keep !== 'all') {
    if (selection.keep !== 'highest' && selection.keep !== 'lowest') {
      return rollError(rollSpecId, `Roll Spec '${rollSpecId}'s selection.keep '${selection.keep}' is not recognized ('all' | 'highest' | 'lowest')`)
    }
    const keepCount = selection.count ?? 1
    indices = selectIndices(rolls, indices, selection.keep, keepCount)
  }

  indices = [...indices].sort((a, b) => a - b)
  const kept = indices.map((i) => rolls[i]!)
  const modifier = typeof diceValue.modifier === 'number' ? diceValue.modifier : 0
  const total = kept.reduce((sum, value) => sum + value, 0) + modifier

  const result: RollResult = {
    rollSpecId,
    seed,
    successRuleKind,
    manual: false,
    dice: diceValue,
    rolls,
    rerolls,
    kept,
    keptIndices: indices,
    total
  }

  if (successRuleKind === 'atLeast' || successRuleKind === 'atMost' || successRuleKind === 'countAtLeast') {
    if (definition.successRule.threshold === undefined) {
      return rollError(rollSpecId, `Roll Spec '${rollSpecId}'s successRule.kind '${successRuleKind}' requires a threshold, but none was declared`)
    }
    const threshold = resolveThreshold(definition.successRule.threshold, rollSpecId, session)
    if (isRulesError(threshold)) return threshold
    if (typeof threshold !== 'number') {
      return rollError(rollSpecId, `Roll Spec '${rollSpecId}'s successRule.threshold did not evaluate to a number (got '${typeof threshold}')`)
    }
    if (successRuleKind === 'countAtLeast') {
      result.successCount = kept.filter((value) => value >= threshold).length
    } else {
      result.success = successRuleKind === 'atLeast' ? total >= threshold : total <= threshold
    }
  }
  // Unrecognized kind: `success`/`successCount` stay undefined (design
  // decision 3) -- `successRuleKind` on the result still tells the caller
  // what was requested.

  return result
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function rollOneDie(rng: ReturnType<typeof createSeededRng>, faces: number): number {
  return rng.nextInt(faces) + 1
}

function selectIndices(rolls: number[], indices: number[], mode: 'highest' | 'lowest', count: number): number[] {
  const ranked = [...indices].sort((a, b) => (mode === 'highest' ? rolls[b]! - rolls[a]! : rolls[a]! - rolls[b]!))
  return ranked.slice(0, Math.max(0, Math.min(count, ranked.length)))
}

type Comparison = { op: '<' | '<=' | '>' | '>=' | '='; threshold: number }

// Design decision 7: `when` is a bare string, not EEL -- a tiny, local,
// single-purpose grammar this module owns entirely.
function parseComparison(when: string): Comparison | undefined {
  const match = /^\s*(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(when)
  if (!match) return undefined
  return { op: match[1] as Comparison['op'], threshold: Number(match[2]) }
}

function matchesComparison(value: number, comparison: Comparison): boolean {
  switch (comparison.op) {
    case '<':
      return value < comparison.threshold
    case '<=':
      return value <= comparison.threshold
    case '>':
      return value > comparison.threshold
    case '>=':
      return value >= comparison.threshold
    case '=':
      return value === comparison.threshold
  }
}

function resolveThreshold(threshold: Expression | RuleValue, rollSpecId: DefinitionId, session: EvaluationSession): RuleValue {
  if (isExpression(threshold)) return evaluateStandaloneExpression(threshold, session, rollSpecId)
  return threshold
}

function isExpression(value: unknown): value is Expression {
  return typeof value === 'object' && value !== null && 'text' in value && 'ast' in value
}

function isDiceSpec(value: unknown): value is DiceSpec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'count' in value && 'faces' in value
}

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

function rollError(definitionId: DefinitionId, message: string): RulesError {
  return { definitionId, message }
}
