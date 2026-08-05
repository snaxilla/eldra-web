// Unit tests for the Rules Engine Definition Registry
// (app/lib/rules/registry.ts). These assert on the public API
// (RulesRegistry.create and its instance methods) only -- no internal Map
// state.

import { describe, expect, it } from 'vitest'
import { RulesRegistry } from '../../app/lib/rules/registry'
import type {
  ActionDefinition,
  CollectionDefinition,
  Definition,
  ModifierDefinition,
  RollSpec,
  RulesPackageManifest,
  SourceDefinition,
  ValueDefinition
} from '../../app/lib/rules/types'

function manifest(overrides: Partial<RulesPackageManifest> = {}): RulesPackageManifest {
  return {
    packageId: 'eldra.test.pkg',
    version: '1.0.0',
    status: 'draft',
    engineApiVersion: '^1.0.0',
    stateSchemaVersion: 1,
    title: 'Test Package',
    license: { id: 'CC0-1.0' },
    capabilities: [],
    dependencies: [],
    ...overrides
  }
}

function valueDefinition(id: string, overrides: Partial<ValueDefinition> = {}): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored', ...overrides }
}

function collectionDefinition(id: string): CollectionDefinition {
  return { id, kind: 'collection', itemSchema: [] }
}

function actionDefinition(id: string): ActionDefinition {
  return { id, kind: 'action' }
}

function rollSpec(id: string): RollSpec {
  return { id, kind: 'roll', dice: { text: '1d20', ast: { kind: 'dice' } }, successRule: { kind: 'atLeast' } }
}

function sourceDefinition(id: string): SourceDefinition {
  return { id, kind: 'source', modifiers: [] }
}

// A standalone Modifier Definition -- has both id and kind populated, per
// §16.1's "standalone reusable template" form.
function standaloneModifier(id: string): ModifierDefinition {
  return { id, kind: 'modifier', target: 'value:x', phase: 'add', value: 1 }
}

// The *inline* Modifier Definition shape (§16.1): embedded inside a
// SourceDefinition.modifiers[], with no id/kind of its own. Used here to
// construct the "malformed if it appears at the top level" fixtures.
function inlineModifierMissingId(): Definition {
  return { kind: 'modifier', target: 'value:x', phase: 'add', value: 1 } as ModifierDefinition
}

function inlineModifierMissingKind(id: string): Definition {
  return { id, target: 'value:x', phase: 'add', value: 1 } as ModifierDefinition
}

describe('registry construction', () => {
  it('constructs successfully from an empty definitions list', () => {
    const result = RulesRegistry.create(manifest(), [])
    expect(result.ok).toBe(true)
  })

  it('constructs successfully from a mixed set of definition kinds', () => {
    const result = RulesRegistry.create(manifest(), [
      valueDefinition('value:might'),
      collectionDefinition('collection:inventory'),
      standaloneModifier('modifier:shieldBonus'),
      actionDefinition('action:strike'),
      rollSpec('roll:attack'),
      sourceDefinition('source:longsword')
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.listAll()).toHaveLength(6)
    }
  })
})

describe('duplicate DefinitionIds', () => {
  it('rejects construction when two definitions share the same id', () => {
    const result = RulesRegistry.create(manifest(), [valueDefinition('value:x'), valueDefinition('value:x')])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toEqual([
        { message: "Duplicate DefinitionId 'value:x'", definitionId: 'value:x' }
      ])
    }
  })

  it('reports every duplicate, not just the first', () => {
    const result = RulesRegistry.create(manifest(), [
      valueDefinition('value:x'),
      valueDefinition('value:x'),
      valueDefinition('value:y'),
      valueDefinition('value:y')
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.definitionId)).toEqual(['value:x', 'value:y'])
    }
  })
})

describe('lookup success', () => {
  it('getById returns the matching definition', () => {
    const definition = valueDefinition('value:might')
    const result = RulesRegistry.create(manifest(), [definition])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.getById('value:might')).toEqual(definition)
    }
  })

  it('has returns true for an indexed id', () => {
    const result = RulesRegistry.create(manifest(), [valueDefinition('value:might')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.has('value:might')).toBe(true)
    }
  })
})

describe('lookup failure', () => {
  it('getById returns undefined for an unknown id', () => {
    const result = RulesRegistry.create(manifest(), [valueDefinition('value:might')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.getById('value:doesNotExist')).toBeUndefined()
    }
  })

  it('has returns false for an unknown id', () => {
    const result = RulesRegistry.create(manifest(), [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.has('value:doesNotExist')).toBe(false)
    }
  })
})

describe('semantic role lookup', () => {
  it('resolves a bound role to its definition', () => {
    const might = valueDefinition('value:might')
    const result = RulesRegistry.create(
      manifest({ semanticRoles: { vitality: 'value:might' } }),
      [might]
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.getBySemanticRole('vitality')).toEqual(might)
    }
  })

  it('returns undefined for a role the manifest never binds', () => {
    const result = RulesRegistry.create(manifest(), [valueDefinition('value:might')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.getBySemanticRole('vitality')).toBeUndefined()
    }
  })

  it('returns undefined for a role bound to a DefinitionId not present among the definitions', () => {
    // A dangling semantic-role reference is a semantic-validation concern,
    // not something this registry rejects at construction -- see the file
    // header comment on registry.ts.
    const result = RulesRegistry.create(
      manifest({ semanticRoles: { vitality: 'value:doesNotExist' } }),
      [valueDefinition('value:might')]
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.getBySemanticRole('vitality')).toBeUndefined()
    }
  })
})

describe('enumeration', () => {
  it('listAll returns every indexed definition', () => {
    const a = valueDefinition('value:a')
    const b = valueDefinition('value:b')
    const result = RulesRegistry.create(manifest(), [a, b])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.listAll()).toEqual([a, b])
    }
  })

  it('listAll on an empty registry returns an empty list', () => {
    const result = RulesRegistry.create(manifest(), [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.listAll()).toEqual([])
    }
  })
})

describe('kind filtering', () => {
  it('listByKind returns only definitions of the requested kind', () => {
    const might = valueDefinition('value:might')
    const inventory = collectionDefinition('collection:inventory')
    const result = RulesRegistry.create(manifest(), [might, inventory])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.listByKind('value')).toEqual([might])
      expect(result.registry.listByKind('collection')).toEqual([inventory])
    }
  })

  it('listByKind returns an empty list for a kind with no definitions', () => {
    const result = RulesRegistry.create(manifest(), [valueDefinition('value:might')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.listByKind('roll')).toEqual([])
    }
  })
})

describe('immutable behavior', () => {
  it('the array returned by listAll is frozen', () => {
    const result = RulesRegistry.create(manifest(), [valueDefinition('value:might')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.isFrozen(result.registry.listAll())).toBe(true)
    }
  })

  it('the array returned by listByKind is frozen', () => {
    const result = RulesRegistry.create(manifest(), [valueDefinition('value:might')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.isFrozen(result.registry.listByKind('value'))).toBe(true)
    }
  })

  it('mutating the caller-supplied definitions array after construction does not affect the registry', () => {
    const definitions: Definition[] = [valueDefinition('value:might')]
    const result = RulesRegistry.create(manifest(), definitions)
    definitions.push(valueDefinition('value:intruder'))
    definitions.length = 0
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.listAll()).toEqual([valueDefinition('value:might')])
    }
  })

  it('two calls to listAll return independent array instances', () => {
    const result = RulesRegistry.create(manifest(), [valueDefinition('value:might')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.registry.listAll()).not.toBe(result.registry.listAll())
    }
  })
})

describe('malformed package rejection', () => {
  it('rejects a definition with no id', () => {
    const result = RulesRegistry.create(manifest(), [inlineModifierMissingId()])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toEqual([
        { message: "Definition of kind 'modifier' has no id and cannot be indexed" }
      ])
    }
  })

  it('rejects a definition with no kind', () => {
    const result = RulesRegistry.create(manifest(), [inlineModifierMissingKind('modifier:orphan')])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toEqual([
        { message: 'Definition has no kind and cannot be indexed (not a standalone Definition)' }
      ])
    }
  })

  it('a well-formed definition alongside a malformed one still surfaces the malformed one', () => {
    const result = RulesRegistry.create(manifest(), [
      valueDefinition('value:might'),
      inlineModifierMissingId()
    ])
    expect(result.ok).toBe(false)
  })
})
