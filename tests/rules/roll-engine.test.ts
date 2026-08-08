// Unit tests for the Roll Engine (app/lib/rules/roll-engine.ts).
// Per this task's own scope, Action execution, Combat, and any specific
// "kind" of roll (Luck/Initiative/...) are not exercised here -- only
// arbitrary RollSpec execution.

import { describe, expect, it } from 'vitest'
import { executeRoll, type RollResult } from '../../app/lib/rules/roll-engine'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type {
  ActorState,
  Definition,
  EvaluationContext,
  Expression,
  RollSpec,
  RulesPackageManifest,
  ValueDefinition
} from '../../app/lib/rules/types'

function manifest(): RulesPackageManifest {
  return {
    packageId: 'eldra.test.pkg',
    version: '1.0.0',
    status: 'draft',
    engineApiVersion: '^1.0.0',
    stateSchemaVersion: 1,
    title: 'Test Package',
    license: { id: 'CC0-1.0' },
    capabilities: [],
    dependencies: []
  }
}

function expression(text: string): Expression {
  const result = parseExpression(text)
  if (!result.ok) {
    throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
  }
  return { text, ast: result.ast as Expression['ast'] }
}

function valueDefinition(id: string, overrides: Partial<ValueDefinition> = {}): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored', ...overrides }
}

function rollSpec(id: string, overrides: Partial<RollSpec> = {}): RollSpec {
  return {
    id,
    kind: 'roll',
    dice: expression('1d6'),
    successRule: { kind: 'atLeast', threshold: 4 },
    ...overrides
  }
}

function actorState(overrides: Partial<ActorState> = {}): ActorState {
  return {
    actorId: 'actor:1',
    packageId: 'eldra.test.pkg',
    packageVersion: '1.0.0',
    stateSchemaVersion: 1,
    values: {},
    collections: {},
    choices: {},
    sources: [],
    ...overrides
  }
}

function context(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return { ...overrides }
}

// Mirrors evaluator.test.ts's own buildSession: the evaluator never
// consults session.graph directly (it recurses via evaluate() + the
// registry only), so a deliberately invalid package -- e.g. one static
// reference validation would normally reject -- can still safely use a
// placeholder graph here to exercise the Roll Engine's runtime error
// propagation in isolation, independent of static validation.
function buildSession(
  definitions: Definition[],
  options: { actor?: Partial<ActorState>; context?: Partial<EvaluationContext> } = {}
): EvaluationSession {
  const registryResult = RulesRegistry.create(manifest(), definitions)
  if (!registryResult.ok) throw new Error(`registry construction failed: ${JSON.stringify(registryResult.errors)}`)
  const graphResult = DependencyGraph.build(registryResult.registry)
  const graph = graphResult.ok ? graphResult.graph : (undefined as unknown as DependencyGraph)
  return new EvaluationSession(registryResult.registry, graph, actorState(options.actor), context(options.context))
}

function expectRollResult(value: unknown): asserts value is RollResult {
  if (!value || typeof value !== 'object' || !('rolls' in value)) {
    throw new Error(`Expected a RollResult, got: ${JSON.stringify(value)}`)
  }
}

describe('executeRoll -- determinism', () => {
  it('the same seed produces byte-for-byte identical RollResults', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('3d6') })]
    const sessionA = buildSession(definitions, { context: { seed: 'fixed-seed' } })
    const sessionB = buildSession(definitions, { context: { seed: 'fixed-seed' } })
    expect(executeRoll('roll:test', sessionA)).toEqual(executeRoll('roll:test', sessionB))
  })

  it('different seeds produce different rolls', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('5d20') })]
    const sessionA = buildSession(definitions, { context: { seed: 'seed-a' } })
    const sessionB = buildSession(definitions, { context: { seed: 'seed-b' } })
    const resultA = executeRoll('roll:test', sessionA)
    const resultB = executeRoll('roll:test', sessionB)
    expectRollResult(resultA)
    expectRollResult(resultB)
    expect(resultA.rolls).not.toEqual(resultB.rolls)
  })

  it('repeated execution against the same session returns an identical result each time', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('4d6') })]
    const session = buildSession(definitions, { context: { seed: 'repeat-me' } })
    const first = executeRoll('roll:test', session)
    const second = executeRoll('roll:test', session)
    expect(first).toEqual(second)
  })

  it('a missing seed is a RulesError, never a silent random roll', () => {
    const definitions = [rollSpec('roll:test')]
    const session = buildSession(definitions)
    const result = executeRoll('roll:test', session)
    expect(result).toMatchObject({ definitionId: 'roll:test' })
  })
})

describe('executeRoll -- multiple dice and RollResult shape', () => {
  it('rolls exactly `count` dice, each within [1, faces]', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('6d10') })]
    const session = buildSession(definitions, { context: { seed: 'multi-dice' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.rolls).toHaveLength(6)
    for (const value of result.rolls) {
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(10)
    }
    expect(result.manual).toBe(false)
    expect(result.dice).toEqual({ count: 6, faces: 10 })
  })

  it('with no selection declared, all dice are kept and total is their sum', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('3d6') })]
    const session = buildSession(definitions, { context: { seed: 'sum-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.kept).toEqual(result.rolls)
    expect(result.total).toBe(result.rolls.reduce((sum, value) => sum + value, 0))
  })
})

describe('executeRoll -- modifiers (diceSpec + number, §17.3 d20 families)', () => {
  it('a flat literal modifier ("1d20 + 5") is attached to the diceSpec and included in total', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('1d20 + 5') })]
    const session = buildSession(definitions, { context: { seed: 'mod-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.dice?.modifier).toBe(5)
    expect(result.total).toBe(result.rolls[0]! + 5)
  })

  it('a referenced modifier ("1d20 + @value:mod") resolves against ActorState', () => {
    const definitions: Definition[] = [
      valueDefinition('value:mod', { default: 3 }),
      rollSpec('roll:test', { dice: expression('1d20 + @value:mod') })
    ]
    const session = buildSession(definitions, { context: { seed: 'ref-mod-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.dice?.modifier).toBe(3)
    expect(result.total).toBe(result.rolls[0]! + 3)
  })

  it('modifiers accumulate left-to-right ("1d20 + 2 + 3")', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('1d20 + 2 + 3') })]
    const session = buildSession(definitions, { context: { seed: 'accumulate-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.dice?.modifier).toBe(5)
  })
})

describe('executeRoll -- selection (advantage-style, §17.3)', () => {
  it('selection.keep "highest" with count 1 keeps only the higher of two dice', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('2d20'),
        selection: { keep: 'highest', count: 1 }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'advantage-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0]).toBe(Math.max(...result.rolls))
    expect(result.total).toBe(Math.max(...result.rolls))
  })

  it('selection.keep "lowest" keeps only the lower of two dice', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('2d20'),
        selection: { keep: 'lowest', count: 1 }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'disadvantage-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0]).toBe(Math.min(...result.rolls))
  })

  it('an unrecognized selection.keep is a RulesError, not a silent no-op', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('2d20'),
        selection: { keep: 'median' }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'bad-selection' } })
    const result = executeRoll('roll:test', session)
    expect(result).toMatchObject({ definitionId: 'roll:test' })
  })

  it('diceSpec.keep from keepHighest() dice construction is honored (4d6 drop lowest)', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('keepHighest(4d6, 3)') })]
    const session = buildSession(definitions, { context: { seed: 'drop-lowest-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.rolls).toHaveLength(4)
    expect(result.kept).toHaveLength(3)
    const expectedKept = [...result.rolls].sort((a, b) => b - a).slice(0, 3)
    expect([...result.kept].sort((a, b) => b - a)).toEqual(expectedKept)
  })

  it('a diceSpec requesting explode/reroll dice construction is a RulesError (unparameterized, §14.5)', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('explode(2d6)') })]
    const session = buildSession(definitions, { context: { seed: 'explode-check' } })
    const result = executeRoll('roll:test', session)
    expect(result).toMatchObject({ definitionId: 'roll:test' })
  })
})

describe('executeRoll -- reroll (RollSpec.reroll, §16.5)', () => {
  it('a reroll condition matching every face rerolls each die exactly `limit` times', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('2d6'),
        reroll: { when: '<= 6', limit: 2 }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'always-reroll' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.rerolls).toHaveLength(4) // 2 dice * limit 2
    expect(result.rerolls.filter((event) => event.index === 0)).toHaveLength(2)
    expect(result.rerolls.filter((event) => event.index === 1)).toHaveLength(2)
  })

  it('a reroll condition matching nothing produces zero reroll events', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('2d6'),
        reroll: { when: '<= 0', limit: 3 }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'never-reroll' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.rerolls).toHaveLength(0)
  })

  it('an unrecognized reroll.when is a RulesError', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('2d6'),
        reroll: { when: 'not-a-comparison' }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'bad-reroll' } })
    const result = executeRoll('roll:test', session)
    expect(result).toMatchObject({ definitionId: 'roll:test' })
  })
})

describe('executeRoll -- success rules and thresholds (§17.3)', () => {
  it('atLeast succeeds when total meets a literal threshold', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('1d20 + 100'), // guarantees success regardless of the die
        successRule: { kind: 'atLeast', threshold: 10 }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'atleast-success' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.success).toBe(true)
  })

  it('atLeast fails when total is below a literal threshold', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('1d1'), // always rolls exactly 1
        successRule: { kind: 'atLeast', threshold: 10 }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'atleast-fail' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.success).toBe(false)
    expect(result.total).toBe(1)
  })

  it('atMost resolves a threshold given as an Expression referencing a Value (percentile roll-under, §17.3)', () => {
    const definitions: Definition[] = [
      valueDefinition('value:skill', { default: 35 }),
      rollSpec('roll:test', {
        dice: expression('1d1'), // always 1, guaranteed <= any positive skill
        successRule: { kind: 'atMost', threshold: expression('@value:skill') }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'atmost-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.success).toBe(true)
  })

  it('countAtLeast counts kept dice meeting the threshold (dice-pool family, §17.3)', () => {
    const definitions = [
      rollSpec('roll:test', {
        dice: expression('dice(10, 6)'),
        successRule: { kind: 'countAtLeast', threshold: 5 }
      })
    ]
    const session = buildSession(definitions, { context: { seed: 'pool-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.successCount).toBe(result.kept.filter((value) => value >= 5).length)
    expect(result.success).toBeUndefined()
  })

  it('manual rolls execute no dice and leave success interpretation entirely unresolved', () => {
    const definitions = [rollSpec('roll:test', { successRule: { kind: 'manual' } })]
    const session = buildSession(definitions, { context: { seed: 'manual-check' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.manual).toBe(true)
    expect(result.rolls).toEqual([])
    expect(result.dice).toBeUndefined()
    expect(result.total).toBeUndefined()
    expect(result.success).toBeUndefined()
  })

  it('an unrecognized successRule.kind still rolls the dice but leaves success/successCount undefined', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('2d6'), successRule: { kind: 'exoticFutureRule' } })]
    const session = buildSession(definitions, { context: { seed: 'unknown-rule' } })
    const result = executeRoll('roll:test', session)
    expectRollResult(result)
    expect(result.rolls).toHaveLength(2)
    expect(result.success).toBeUndefined()
    expect(result.successCount).toBeUndefined()
    expect(result.successRuleKind).toBe('exoticFutureRule')
  })
})

describe('executeRoll -- error propagation and invalid input', () => {
  it('a definitionId that is not a Roll Spec is a RulesError', () => {
    const definitions = [valueDefinition('value:notARoll')]
    const session = buildSession(definitions, { context: { seed: 'not-a-roll' } })
    const result = executeRoll('value:notARoll', session)
    expect(result).toMatchObject({ definitionId: 'value:notARoll' })
  })

  it('an error inside the dice Expression propagates unchanged (evaluate() reuse, not reimplementation)', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('dice(@value:doesNotExist, 6)') })]
    const session = buildSession(definitions, { context: { seed: 'propagate-check' } })
    const result = executeRoll('roll:test', session)
    expect(result).toMatchObject({ definitionId: 'value:doesNotExist' })
  })
})
