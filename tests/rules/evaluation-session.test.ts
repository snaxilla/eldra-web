// Unit tests for the Rules Engine Evaluation Session
// (app/lib/rules/evaluation-session.ts). These assert on the public API
// (EvaluationSession's constructor and instance methods) only. Per this
// task's own scope, nothing here evaluates anything -- these tests exercise
// pure state storage.

import { describe, expect, it } from 'vitest'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { RulesRegistry } from '../../app/lib/rules/registry'
import type { ActorState, EvaluationContext, RulesPackageManifest, ValueDefinition } from '../../app/lib/rules/types'

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

function valueDefinition(id: string): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored' }
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

function buildRegistryAndGraph() {
  const registryResult = RulesRegistry.create(manifest(), [valueDefinition('value:might')])
  if (!registryResult.ok) throw new Error('registry construction failed')
  const graphResult = DependencyGraph.build(registryResult.registry)
  if (!graphResult.ok) throw new Error('graph construction failed')
  return { registry: registryResult.registry, graph: graphResult.graph }
}

function buildSession(options?: { tracingEnabled?: boolean }): {
  session: EvaluationSession
  registry: RulesRegistry
  graph: DependencyGraph
  actor: ActorState
  ctx: EvaluationContext
} {
  const { registry, graph } = buildRegistryAndGraph()
  const actor = actorState()
  const ctx = context({ purpose: 'attack' })
  const session = new EvaluationSession(registry, graph, actor, ctx, options)
  return { session, registry, graph, actor, ctx }
}

describe('construction', () => {
  it('stores the registry, graph, actorState, and context passed to it', () => {
    const { session, registry, graph, actor, ctx } = buildSession()
    expect(session.registry).toBe(registry)
    expect(session.graph).toBe(graph)
    expect(session.actorState).toBe(actor)
    expect(session.context).toBe(ctx)
  })

  it('defaults tracingEnabled to false', () => {
    const { session } = buildSession()
    expect(session.tracingEnabled).toBe(false)
  })

  it('accepts an explicit tracingEnabled option', () => {
    const { session } = buildSession({ tracingEnabled: true })
    expect(session.tracingEnabled).toBe(true)
  })

  it('starts with an empty cache, no traces, an empty visit stack, and no diagnostics', () => {
    const { session } = buildSession()
    expect(session.hasCached('value:might')).toBe(false)
    expect(session.getTrace('value:might')).toBeUndefined()
    expect(session.getVisitPath()).toEqual([])
    expect(session.getDiagnostics()).toEqual([])
  })
})

describe('cache reads', () => {
  it('hasCached returns false and getCached returns undefined for an unset id', () => {
    const { session } = buildSession()
    expect(session.hasCached('value:might')).toBe(false)
    expect(session.getCached('value:might')).toBeUndefined()
  })
})

describe('cache writes', () => {
  it('setCached makes the value visible to hasCached and getCached', () => {
    const { session } = buildSession()
    session.setCached('value:might', 3)
    expect(session.hasCached('value:might')).toBe(true)
    expect(session.getCached('value:might')).toBe(3)
  })

  it('setCached overwrites a previous value for the same id', () => {
    const { session } = buildSession()
    session.setCached('value:might', 3)
    session.setCached('value:might', 5)
    expect(session.getCached('value:might')).toBe(5)
  })

  it('an error-shaped RuleValue can be cached like any other value', () => {
    const { session } = buildSession()
    const error = { definitionId: 'value:might', message: 'boom' }
    session.setCached('value:might', error)
    expect(session.getCached('value:might')).toEqual(error)
  })

  it('invalidateCached removes a previously cached value', () => {
    const { session } = buildSession()
    session.setCached('value:might', 3)
    session.invalidateCached('value:might')
    expect(session.hasCached('value:might')).toBe(false)
    expect(session.getCached('value:might')).toBeUndefined()
  })

  it('invalidateCached on an id that was never cached is a harmless no-op', () => {
    const { session } = buildSession()
    expect(() => session.invalidateCached('value:doesNotExist')).not.toThrow()
  })
})

describe('visit stack', () => {
  it('isVisiting is false for an id that has never been pushed', () => {
    const { session } = buildSession()
    expect(session.isVisiting('value:might')).toBe(false)
  })

  it('pushVisit makes isVisiting true for that id', () => {
    const { session } = buildSession()
    session.pushVisit('value:might')
    expect(session.isVisiting('value:might')).toBe(true)
  })

  it('popVisit removes the most recently pushed id and returns it', () => {
    const { session } = buildSession()
    session.pushVisit('value:might')
    expect(session.popVisit()).toBe('value:might')
    expect(session.isVisiting('value:might')).toBe(false)
  })

  it('popVisit on an empty stack returns undefined', () => {
    const { session } = buildSession()
    expect(session.popVisit()).toBeUndefined()
  })
})

describe('nested visits', () => {
  it('tracks a full chain of in-progress evaluations in push order', () => {
    const { session } = buildSession()
    session.pushVisit('value:a')
    session.pushVisit('value:b')
    session.pushVisit('value:c')
    expect(session.getVisitPath()).toEqual(['value:a', 'value:b', 'value:c'])
  })

  it('isVisiting is true for any id currently on the stack, not just the most recent', () => {
    const { session } = buildSession()
    session.pushVisit('value:a')
    session.pushVisit('value:b')
    expect(session.isVisiting('value:a')).toBe(true)
    expect(session.isVisiting('value:b')).toBe(true)
  })

  it('popping unwinds the stack in LIFO order', () => {
    const { session } = buildSession()
    session.pushVisit('value:a')
    session.pushVisit('value:b')
    session.pushVisit('value:c')
    expect(session.popVisit()).toBe('value:c')
    expect(session.popVisit()).toBe('value:b')
    expect(session.getVisitPath()).toEqual(['value:a'])
    expect(session.isVisiting('value:b')).toBe(false)
    expect(session.isVisiting('value:a')).toBe(true)
  })

  it('re-pushing an id already on the stack is not itself rejected -- detecting that is the Evaluator\'s job', () => {
    const { session } = buildSession()
    session.pushVisit('value:a')
    session.pushVisit('value:a')
    expect(session.getVisitPath()).toEqual(['value:a', 'value:a'])
  })
})

describe('trace storage', () => {
  it('getTrace returns undefined before any trace is set', () => {
    const { session } = buildSession()
    expect(session.getTrace('value:might')).toBeUndefined()
  })

  it('setTrace makes the trace visible to getTrace', () => {
    const { session } = buildSession()
    const trace = { path: 'value:might', result: 3, steps: [] }
    session.setTrace('value:might', trace)
    expect(session.getTrace('value:might')).toEqual(trace)
  })

  it('setTrace overwrites a previous trace for the same id', () => {
    const { session } = buildSession()
    session.setTrace('value:might', { path: 'value:might', result: 1, steps: [] })
    session.setTrace('value:might', { path: 'value:might', result: 2, steps: [] })
    expect(session.getTrace('value:might')?.result).toBe(2)
  })
})

describe('immutable Registry reference', () => {
  it('the session always returns the exact same registry instance', () => {
    const { session, registry } = buildSession()
    expect(session.registry).toBe(registry)
    expect(session.registry).toBe(session.registry)
  })
})

describe('immutable Graph reference', () => {
  it('the session always returns the exact same graph instance', () => {
    const { session, graph } = buildSession()
    expect(session.graph).toBe(graph)
    expect(session.graph).toBe(session.graph)
  })
})

describe('diagnostics', () => {
  it('starts empty and accumulates added diagnostics in order', () => {
    const { session } = buildSession()
    const first = { definitionId: 'value:a', message: 'first' }
    const second = { definitionId: 'value:b', message: 'second' }
    session.addDiagnostic(first)
    session.addDiagnostic(second)
    expect(session.getDiagnostics()).toEqual([first, second])
  })
})
