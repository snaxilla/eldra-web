// Unit tests for the Roll Service (app/lib/rules/roll-service.ts) -- the
// canonical `requestRoll` entry point. Per this task's own scope, UI,
// networking, 3D Dice, Character Sheet integration, and Action execution
// are not exercised here.

import { describe, expect, it } from 'vitest'
import { requestRoll, type RollRequest } from '../../app/lib/rules/roll-service'
import { executeRoll } from '../../app/lib/rules/roll-engine'
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
    dice: expression('2d6'),
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

// Mirrors evaluator.test.ts/roll-engine.test.ts's own buildSession: a
// deliberately invalid package (e.g. a dangling reference) can still
// safely fall back to a placeholder graph, since neither the evaluator nor
// the Roll Engine ever reads session.graph directly -- this keeps runtime
// error-propagation tests independent of static validation.
function buildRequest(
  definitions: Definition[],
  rollSpecId: string,
  options: { actor?: Partial<ActorState>; context?: Partial<EvaluationContext> } = {}
): RollRequest {
  const registryResult = RulesRegistry.create(manifest(), definitions)
  if (!registryResult.ok) throw new Error(`registry construction failed: ${JSON.stringify(registryResult.errors)}`)
  const graphResult = DependencyGraph.build(registryResult.registry)
  const graph = graphResult.ok ? graphResult.graph : (undefined as unknown as DependencyGraph)
  return {
    rollSpecId,
    registry: registryResult.registry,
    graph,
    actorState: actorState(options.actor),
    context: context(options.context)
  }
}

describe('requestRoll -- successful request', () => {
  it('returns ok:true with a RollResult and event metadata', () => {
    const request = buildRequest([rollSpec('roll:test')], 'roll:test', { context: { seed: 'success-check' } })
    const event = requestRoll(request)
    expect(event.ok).toBe(true)
    if (!event.ok) throw new Error('expected success')
    expect(event.rollSpecId).toBe('roll:test')
    expect(event.actorId).toBe('actor:1')
    expect(event.seed).toBe('success-check')
    expect(event.result.rolls).toHaveLength(2)
    expect(typeof event.eventId).toBe('string')
    expect(event.eventId.length).toBeGreaterThan(0)
  })
})

describe('requestRoll -- RollResult passthrough', () => {
  it('event.result is exactly what executeRoll produces for an equivalent session, unmodified', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('3d8 + 2') })]
    const request = buildRequest(definitions, 'roll:test', { context: { seed: 'passthrough-check' } })

    const directSession = new EvaluationSession(request.registry, request.graph, request.actorState, request.context)
    const directResult = executeRoll('roll:test', directSession)

    const event = requestRoll(request)
    expect(event.ok).toBe(true)
    if (!event.ok) throw new Error('expected success')
    expect(event.result).toEqual(directResult)
  })
})

describe('requestRoll -- missing RollSpec', () => {
  it('an unknown rollSpecId returns ok:false with a RulesError, not a throw', () => {
    const request = buildRequest([rollSpec('roll:other')], 'roll:doesNotExist', { context: { seed: 'missing-check' } })
    const event = requestRoll(request)
    expect(event.ok).toBe(false)
    if (event.ok) throw new Error('expected failure')
    expect(event.error).toMatchObject({ definitionId: 'roll:doesNotExist' })
    expect(event.error.message).toContain('No Roll Spec')
  })

  it('a definitionId that resolves but is not a Roll Spec returns ok:false', () => {
    const request = buildRequest([valueDefinition('value:notARoll')], 'value:notARoll', { context: { seed: 'wrong-kind' } })
    const event = requestRoll(request)
    expect(event.ok).toBe(false)
    if (event.ok) throw new Error('expected failure')
    expect(event.error.message).toContain('not a Roll Spec')
  })

  it('a missing seed propagates as ok:false rather than rolling non-deterministically', () => {
    const request = buildRequest([rollSpec('roll:test')], 'roll:test')
    const event = requestRoll(request)
    expect(event.ok).toBe(false)
  })
})

describe('requestRoll -- repeated execution', () => {
  it('calling requestRoll twice with the same request returns identical events', () => {
    const request = buildRequest([rollSpec('roll:test', { dice: expression('4d6') })], 'roll:test', {
      context: { seed: 'repeat-check' }
    })
    const first = requestRoll(request)
    const second = requestRoll(request)
    expect(first).toEqual(second)
  })
})

describe('requestRoll -- deterministic RollEvents', () => {
  it('two independently-built requests with identical inputs produce byte-identical RollEvents, including eventId', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('5d10 + 3') })]
    const requestA = buildRequest(definitions, 'roll:test', { context: { seed: 'determinism-check' } })
    const requestB = buildRequest(definitions, 'roll:test', { context: { seed: 'determinism-check' } })
    expect(requestRoll(requestA)).toEqual(requestRoll(requestB))
  })

  it('a different seed produces a different eventId as well as a different result', () => {
    const definitions = [rollSpec('roll:test', { dice: expression('5d10 + 3') })]
    const requestA = buildRequest(definitions, 'roll:test', { context: { seed: 'seed-x' } })
    const requestB = buildRequest(definitions, 'roll:test', { context: { seed: 'seed-y' } })
    const eventA = requestRoll(requestA)
    const eventB = requestRoll(requestB)
    expect(eventA.eventId).not.toBe(eventB.eventId)
  })

  it('a different actor produces a different eventId even with the same seed and Roll Spec', () => {
    const definitions = [rollSpec('roll:test')]
    const requestA = buildRequest(definitions, 'roll:test', { actor: { actorId: 'actor:a' }, context: { seed: 'same-seed' } })
    const requestB = buildRequest(definitions, 'roll:test', { actor: { actorId: 'actor:b' }, context: { seed: 'same-seed' } })
    expect(requestRoll(requestA).eventId).not.toBe(requestRoll(requestB).eventId)
  })
})
