// Unit tests for the Rules Engine Source Overlay
// (app/lib/rules/source-overlay.ts). These assert on the public API
// (buildSourceOverlay) only. Per this task's own scope, no modifier
// discovery, no @source: resolution, and no modifier application are
// exercised here -- see modifier-pipeline.test.ts / evaluator.test.ts for
// those, unaffected by this commit.

import { describe, expect, it } from 'vitest'
import { buildSourceOverlay } from '../../app/lib/rules/source-overlay'
import { RulesRegistry } from '../../app/lib/rules/registry'
import type {
  ActorState,
  CollectionDefinition,
  CollectionInstanceItem,
  Definition,
  RulesPackageManifest,
  SourceDefinition,
  SourceInstance,
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

function valueDefinition(id: string): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored' }
}

function sourceDefinition(id: string, overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return { id, kind: 'source', modifiers: [], ...overrides }
}

function collectionDefinition(id: string, overrides: Partial<CollectionDefinition> = {}): CollectionDefinition {
  return { id, kind: 'collection', itemSchema: [], ...overrides }
}

function item(instanceId: string, fields: Record<string, unknown> = {}): CollectionInstanceItem {
  return { instanceId, ...fields }
}

function declared(instanceId: string, sourceRef: string, overrides: Partial<SourceInstance> = {}): SourceInstance {
  return { instanceId, sourceRef, ...overrides }
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

function registryOf(definitions: Definition[]): RulesRegistry {
  const result = RulesRegistry.create(manifest(), definitions)
  if (!result.ok) throw new Error(`registry construction failed: ${JSON.stringify(result.errors)}`)
  return result.registry
}

describe('declared Sources (§16.8 Path 1)', () => {
  it('a declared instance whose sourceRef resolves produces one ResolvedSourceInstance', () => {
    const registry = registryOf([sourceDefinition('source:blessed')])
    const state = actorState({ sources: [declared('cs-1', 'source:blessed')] })
    const overlay = buildSourceOverlay(registry, state)

    expect(overlay.instances).toHaveLength(1)
    expect(overlay.instances[0]).toMatchObject({
      instanceId: 'cs-1',
      definitionId: 'source:blessed',
      origin: { kind: 'declared' }
    })
    expect(overlay.diagnostics).toEqual([])
  })

  it('multiple declared instances all appear', () => {
    const registry = registryOf([sourceDefinition('source:a'), sourceDefinition('source:b')])
    const state = actorState({ sources: [declared('cs-1', 'source:a'), declared('cs-2', 'source:b')] })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances.map((i) => i.instanceId)).toEqual(['cs-1', 'cs-2'])
  })

  it('carries a declared instance\'s duration through unchanged', () => {
    const registry = registryOf([sourceDefinition('source:stressed')])
    const state = actorState({
      sources: [declared('cs-1', 'source:stressed', { duration: { kind: 'rounds', remaining: 3 } })]
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances[0]!.duration).toEqual({ kind: 'rounds', remaining: 3 })
  })

  it('a declared instance has no itemFields', () => {
    const registry = registryOf([sourceDefinition('source:blessed')])
    const state = actorState({ sources: [declared('cs-1', 'source:blessed')] })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances[0]!.itemFields).toBeUndefined()
  })
})

describe('collection-derived Sources (§16.8 Path 2)', () => {
  it('an item whose sourceRefField resolves produces one ResolvedSourceInstance', () => {
    const registry = registryOf([
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:item.ring')
    ])
    const state = actorState({
      collections: {
        'collection:inventory': [item('ci-1', { name: 'Ring', sourceRef: 'source:item.ring' })]
      }
    })
    const overlay = buildSourceOverlay(registry, state)

    expect(overlay.instances).toHaveLength(1)
    expect(overlay.instances[0]).toMatchObject({
      instanceId: 'ci-1',
      definitionId: 'source:item.ring',
      origin: { kind: 'collection', collectionId: 'collection:inventory', itemInstanceId: 'ci-1' }
    })
    expect(overlay.diagnostics).toEqual([])
  })

  it('presence alone creates the Source -- an item field like "equipped" plays no activation role', () => {
    // §16.8: "Activation is not gated by any other item field... gating is
    // expressed ONLY by modifier conditions reading @source:." An
    // unequipped item still produces a ResolvedSourceInstance.
    const registry = registryOf([
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:item.hauberk')
    ])
    const state = actorState({
      collections: {
        'collection:inventory': [item('ci-1', { equipped: false, sourceRef: 'source:item.hauberk' })]
      }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances).toHaveLength(1)
  })

  it('an item with no sourceRefField value is silently skipped -- not every item carries a Source', () => {
    const registry = registryOf([collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' })])
    const state = actorState({
      collections: { 'collection:inventory': [item('ci-1', { name: 'Rope' })] }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances).toEqual([])
    expect(overlay.diagnostics).toEqual([])
  })

  it('a collection with no sourceRefField declared contributes nothing, silently', () => {
    const registry = registryOf([collectionDefinition('collection:inventory')])
    const state = actorState({
      collections: { 'collection:inventory': [item('ci-1', { name: 'Rope' })] }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances).toEqual([])
    expect(overlay.diagnostics).toEqual([])
  })

  it('populates itemFields from the item\'s own fields, excluding instanceId', () => {
    const registry = registryOf([
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:item.ring')
    ])
    const state = actorState({
      collections: {
        'collection:inventory': [item('ci-1', { name: 'Ring', quantity: 2, sourceRef: 'source:item.ring' })]
      }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances[0]!.itemFields).toEqual({ name: 'Ring', quantity: 2, sourceRef: 'source:item.ring' })
    expect(overlay.instances[0]!.itemFields).not.toHaveProperty('instanceId')
  })
})

describe('mixed overlays', () => {
  it('declared and collection-derived instances coexist, declared first (§16.8\'s own Path 1 / Path 2 order)', () => {
    const registry = registryOf([
      sourceDefinition('source:blessed'),
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:item.ring')
    ])
    const state = actorState({
      sources: [declared('cs-1', 'source:blessed')],
      collections: { 'collection:inventory': [item('ci-1', { sourceRef: 'source:item.ring' })] }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances.map((i) => ({ instanceId: i.instanceId, origin: i.origin.kind }))).toEqual([
      { instanceId: 'cs-1', origin: 'declared' },
      { instanceId: 'ci-1', origin: 'collection' }
    ])
  })
})

describe('duplicate sourceRefs -- the same SourceDefinition referenced by multiple instances', () => {
  it('two items pointing at the same SourceDefinition each produce their own distinct instance', () => {
    // Not an error case: §16.13's own stacking example has two equipped
    // items of the same kind (two rings) each contributing independently.
    const registry = registryOf([
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:item.ring')
    ])
    const state = actorState({
      collections: {
        'collection:inventory': [
          item('ci-1', { sourceRef: 'source:item.ring' }),
          item('ci-2', { sourceRef: 'source:item.ring' })
        ]
      }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances).toHaveLength(2)
    expect(overlay.instances.map((i) => i.instanceId)).toEqual(['ci-1', 'ci-2'])
    expect(overlay.instances.every((i) => i.definitionId === 'source:item.ring')).toBe(true)
    expect(overlay.diagnostics).toEqual([])
  })

  it('a declared instance and a collection item referencing the same SourceDefinition both survive', () => {
    const registry = registryOf([
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:condition.stressed')
    ])
    const state = actorState({
      sources: [declared('cs-1', 'source:condition.stressed')],
      collections: {
        'collection:inventory': [item('ci-1', { sourceRef: 'source:condition.stressed' })]
      }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances).toHaveLength(2)
  })
})

describe('missing sourceRef targets', () => {
  it('a declared instance referencing an id absent from the registry produces a diagnostic, not an instance', () => {
    const registry = registryOf([valueDefinition('value:x')])
    const state = actorState({ sources: [declared('cs-1', 'source:doesNotExist')] })
    const overlay = buildSourceOverlay(registry, state)

    expect(overlay.instances).toEqual([])
    expect(overlay.diagnostics).toHaveLength(1)
    expect(overlay.diagnostics[0]!.message).toContain('source:doesNotExist')
    expect(overlay.diagnostics[0]!.message).toContain('does not exist')
  })

  it('a collection item referencing an id absent from the registry produces a diagnostic, not an instance', () => {
    const registry = registryOf([collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' })])
    const state = actorState({
      collections: {
        'collection:inventory': [item('ci-1', { sourceRef: 'source:doesNotExist' })]
      }
    })
    const overlay = buildSourceOverlay(registry, state)

    expect(overlay.instances).toEqual([])
    expect(overlay.diagnostics).toHaveLength(1)
    expect(overlay.diagnostics[0]!.message).toContain("collection:inventory")
    expect(overlay.diagnostics[0]!.message).toContain('ci-1')
    expect(overlay.diagnostics[0]!.message).toContain('source:doesNotExist')
  })
})

describe('malformed sourceRef values', () => {
  it('a sourceRef that resolves to a non-Source Definition produces a diagnostic, not an instance', () => {
    const registry = registryOf([
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      valueDefinition('value:notASource')
    ])
    const state = actorState({
      collections: { 'collection:inventory': [item('ci-1', { sourceRef: 'value:notASource' })] }
    })
    const overlay = buildSourceOverlay(registry, state)

    expect(overlay.instances).toEqual([])
    expect(overlay.diagnostics).toHaveLength(1)
    expect(overlay.diagnostics[0]!.message).toContain("'value'")
  })

  it('a declared instance whose sourceRef resolves to a non-Source Definition produces a diagnostic', () => {
    const registry = registryOf([valueDefinition('value:notASource')])
    const state = actorState({ sources: [declared('cs-1', 'value:notASource')] })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances).toEqual([])
    expect(overlay.diagnostics).toHaveLength(1)
  })

  it('a non-text sourceRefField value produces a diagnostic distinguishable from "missing"', () => {
    const registry = registryOf([collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' })])
    const state = actorState({
      collections: { 'collection:inventory': [item('ci-1', { sourceRef: 42 })] }
    })
    const overlay = buildSourceOverlay(registry, state)

    expect(overlay.instances).toEqual([])
    expect(overlay.diagnostics).toHaveLength(1)
    expect(overlay.diagnostics[0]!.message).toContain('non-text')
    expect(overlay.diagnostics[0]!.reason).toBe('source-overlay-malformed-source-ref')
  })

  it('explicit null in a sourceRefField is treated as absent, not malformed', () => {
    const registry = registryOf([collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' })])
    const state = actorState({
      collections: { 'collection:inventory': [item('ci-1', { sourceRef: null })] }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances).toEqual([])
    expect(overlay.diagnostics).toEqual([])
  })
})

describe('diagnostics accumulation', () => {
  it('accumulates every problem across both paths rather than aborting on the first', () => {
    const registry = registryOf([
      sourceDefinition('source:good'),
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' })
    ])
    const state = actorState({
      sources: [declared('cs-1', 'source:good'), declared('cs-2', 'source:missing')],
      collections: {
        'collection:inventory': [
          item('ci-1', { sourceRef: 'source:alsoMissing' }),
          item('ci-2', { sourceRef: 123 })
        ]
      }
    })
    const overlay = buildSourceOverlay(registry, state)

    // The one good declared instance still produces a ResolvedSourceInstance.
    expect(overlay.instances).toHaveLength(1)
    expect(overlay.instances[0]!.instanceId).toBe('cs-1')
    // All three problems are reported, not just the first encountered.
    expect(overlay.diagnostics).toHaveLength(3)
  })
})

describe('deterministic ordering', () => {
  it('repeated construction from identical inputs produces an identical, equally-ordered overlay', () => {
    const registry = registryOf([
      sourceDefinition('source:a'),
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:item.ring')
    ])
    const state = actorState({
      sources: [declared('cs-1', 'source:a')],
      collections: { 'collection:inventory': [item('ci-1', { sourceRef: 'source:item.ring' })] }
    })
    expect(buildSourceOverlay(registry, state)).toEqual(buildSourceOverlay(registry, state))
  })

  it('collection-derived instances follow registry (package authoring) order, not object key insertion order', () => {
    // Registry declares 'collection:b' before 'collection:a'; actorState's
    // own collections Record is populated in the OPPOSITE order. If the
    // overlay followed Object.keys(actorState.collections) it would emit
    // 'a' before 'b' -- it must not.
    const registry = registryOf([
      collectionDefinition('collection:b', { sourceRefField: 'sourceRef' }),
      collectionDefinition('collection:a', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:item.x'),
      sourceDefinition('source:item.y')
    ])
    const state = actorState({
      collections: {
        'collection:a': [item('ci-a', { sourceRef: 'source:item.x' })],
        'collection:b': [item('ci-b', { sourceRef: 'source:item.y' })]
      }
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances.map((i) => i.instanceId)).toEqual(['ci-b', 'ci-a'])
  })

  it('items within one collection follow that collection\'s own stored array order', () => {
    const registry = registryOf([
      collectionDefinition('collection:inventory', { sourceRefField: 'sourceRef' }),
      sourceDefinition('source:item.ring')
    ])
    const state = actorState({
      collections: {
        'collection:inventory': [
          item('ci-z', { sourceRef: 'source:item.ring' }),
          item('ci-a', { sourceRef: 'source:item.ring' })
        ]
      }
    })
    const overlay = buildSourceOverlay(registry, state)
    // Deliberately z-then-a: stored array order, not a re-sort by id.
    expect(overlay.instances.map((i) => i.instanceId)).toEqual(['ci-z', 'ci-a'])
  })

  it('declared instances follow ActorState.sources\' own stored array order', () => {
    const registry = registryOf([sourceDefinition('source:z'), sourceDefinition('source:a')])
    const state = actorState({
      sources: [declared('cs-z', 'source:z'), declared('cs-a', 'source:a')]
    })
    const overlay = buildSourceOverlay(registry, state)
    expect(overlay.instances.map((i) => i.instanceId)).toEqual(['cs-z', 'cs-a'])
  })
})

describe('empty inputs', () => {
  it('an ActorState with no sources and no collections produces an empty overlay', () => {
    const registry = registryOf([valueDefinition('value:x')])
    const overlay = buildSourceOverlay(registry, actorState())
    expect(overlay).toEqual({ instances: [], diagnostics: [] })
  })

  it('the returned arrays are frozen', () => {
    const registry = registryOf([sourceDefinition('source:a')])
    const overlay = buildSourceOverlay(registry, actorState({ sources: [declared('cs-1', 'source:a')] }))
    expect(Object.isFrozen(overlay.instances)).toBe(true)
    expect(Object.isFrozen(overlay.diagnostics)).toBe(true)
  })
})
