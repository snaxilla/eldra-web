// Unit tests for the Table, Progression, and ChoiceSet Definition kinds --
// rules-package-architecture.md Step 2 (§7.4-§7.6).
//
// Step 2 is infrastructure only: these kinds exist, are indexable, are
// canonicalizable, and are validatable -- and NOTHING evaluates,
// authors, or consumes them yet. That absence is itself part of the
// contract this file pins, not merely the presence.
//
// Pure throughout: no Nuxt, no Directus, no HTTP.

import { describe, expect, it } from 'vitest'

import { canonicalize } from '../../app/lib/rules/canonicalize'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { evaluate } from '../../app/lib/rules/evaluator'
import { validatePackage } from '../../app/lib/rules/package-validation'
import { RulesRegistry } from '../../app/lib/rules/registry'
import type {
  ChoiceSetDefinition,
  Definition,
  ProgressionDefinition,
  RulesPackageManifest,
  TableDefinition,
  ValueDefinition
} from '../../app/lib/rules/types'

function manifest(overrides: Partial<RulesPackageManifest> = {}): RulesPackageManifest {
  return {
    packageId: 'eldra.test.pkg',
    version: '1.0.0',
    status: 'published',
    engineApiVersion: '^1.0.0',
    stateSchemaVersion: 1,
    title: 'Test Package',
    license: { id: 'CC0-1.0' },
    capabilities: [],
    dependencies: [],
    ...overrides
  }
}

const table: TableDefinition = {
  id: 'table:proficiency_by_level',
  kind: 'table',
  category: 'core.proficiency',
  key: { valueType: 'number', match: 'range' },
  columns: [{ key: 'bonus', valueType: 'number' }],
  rows: [
    { min: 1, max: 4, bonus: 2 },
    { min: 5, max: 8, bonus: 3 }
  ],
  default: { bonus: 2 }
}

const progression: ProgressionDefinition = {
  id: 'progression:class.martial',
  kind: 'progression',
  category: 'progression',
  keyedBy: 'value:level',
  rows: [
    { at: 1, grants: ['source:feature.second_wind'] },
    { at: 2, grants: ['source:feature.action_surge'], sets: { 'value:attacks': 1 } }
  ]
}

const choiceSet: ChoiceSetDefinition = {
  id: 'choice:skill.class',
  kind: 'choiceSet',
  category: 'character.creation',
  prompt: 'Choose your class skill proficiencies',
  count: 2,
  from: { kind: 'definitionsInCategory', category: 'core.skills' },
  distinct: true,
  writesTo: 'value:skill.{selected}.proficient'
}

const levelValue: ValueDefinition = { id: 'value:level', kind: 'value', valueType: 'number', storage: 'stored' }

describe('the Registry recognizes all three kinds', () => {
  it('indexes Table, Progression, and ChoiceSet by id and by kind', () => {
    const result = RulesRegistry.create(manifest(), [table, progression, choiceSet, levelValue])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.registry.getById('table:proficiency_by_level')).toEqual(table)
    expect(result.registry.getById('progression:class.martial')).toEqual(progression)
    expect(result.registry.getById('choice:skill.class')).toEqual(choiceSet)

    expect(result.registry.listByKind('table')).toEqual([table])
    expect(result.registry.listByKind('progression')).toEqual([progression])
    expect(result.registry.listByKind('choiceSet')).toEqual([choiceSet])
  })

  it('applies the SAME identity rules as every other kind -- duplicate ids across kinds are rejected', () => {
    const clashing: Definition = { ...table, id: 'progression:class.martial', kind: 'table' } as TableDefinition
    const result = RulesRegistry.create(manifest(), [progression, clashing])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.message.includes('Duplicate DefinitionId'))).toBe(true)
  })

  it('carries category through unchanged, same as every other categorized kind', () => {
    const result = RulesRegistry.create(manifest(), [table])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.registry.getById('table:proficiency_by_level')?.category).toBe('core.proficiency')
  })
})

describe('Package Validation accepts all three kinds', () => {
  it('a package containing only Table/Progression/ChoiceSet validates cleanly', () => {
    const result = validatePackage(manifest(), [table, progression, choiceSet, levelValue])

    expect(result.ok).toBe(true)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('an uncategorized instance of each kind is still legal (category is optional everywhere)', () => {
    const bare: Definition[] = [
      { id: 'table:x', kind: 'table', key: { valueType: 'number', match: 'exact' }, columns: [], rows: [], default: {} },
      { id: 'progression:x', kind: 'progression', keyedBy: 'value:level', rows: [] },
      { id: 'choice:x', kind: 'choiceSet', prompt: 'Choose', count: 1, from: { kind: 'explicit', ids: [] }, writesTo: 'value:x.{selected}' }
    ]

    const result = validatePackage(manifest(), [...bare, levelValue])
    expect(result.ok).toBe(true)
  })

  it('a Progression\'s dangling grants/sets references produce NO validation error -- they are not consumed yet', () => {
    // The direct, testable consequence of Step 2's "nothing consumes them
    // yet": a grant naming a Source that does not exist would be a real
    // authoring mistake once Progressions are evaluated, but today it is
    // simply unread data, exactly as inert as a comment.
    const danglingProgression: ProgressionDefinition = {
      id: 'progression:x',
      kind: 'progression',
      keyedBy: 'value:level',
      rows: [{ at: 1, grants: ['source:does.not.exist'], sets: { 'value:also.missing': 1 } }]
    }

    const result = validatePackage(manifest(), [danglingProgression, levelValue])
    expect(result.ok).toBe(true)
  })
})

describe('Canonicalization supports all three kinds', () => {
  it('produces deterministic, key-sorted output for each new kind', () => {
    const serialized = canonicalize(table)
    // Object keys are sorted -- 'columns' precedes 'default' precedes 'id'.
    expect(serialized.indexOf('"columns"')).toBeLessThan(serialized.indexOf('"default"'))
    expect(serialized.indexOf('"default"')).toBeLessThan(serialized.indexOf('"id"'))
    // Round-trips through JSON exactly as any other definition would.
    expect(JSON.parse(serialized)).toEqual(table)
  })

  it('canonicalizes Progression and ChoiceSet without error, including nested arrays/records', () => {
    expect(() => canonicalize(progression)).not.toThrow()
    expect(() => canonicalize(choiceSet)).not.toThrow()
    expect(JSON.parse(canonicalize(progression))).toEqual(progression)
    expect(JSON.parse(canonicalize(choiceSet))).toEqual(choiceSet)
  })

  it('is stable -- canonicalizing twice produces the identical string (integrity-hash prerequisite)', () => {
    expect(canonicalize([table, progression, choiceSet])).toBe(canonicalize([table, progression, choiceSet]))
  })
})

describe('the Dependency Graph recognizes all three kinds', () => {
  it('builds a node for each, with no edges -- Step 2 contributes zero edges for these kinds', () => {
    const registryResult = RulesRegistry.create(manifest(), [table, progression, choiceSet, levelValue])
    expect(registryResult.ok).toBe(true)
    if (!registryResult.ok) return

    const graphResult = DependencyGraph.build(registryResult.registry)
    expect(graphResult.ok).toBe(true)
    if (!graphResult.ok) return

    expect(graphResult.graph.listNodes()).toEqual(
      expect.arrayContaining(['table:proficiency_by_level', 'progression:class.martial', 'choice:skill.class'])
    )
    expect(graphResult.graph.getDependencies('table:proficiency_by_level')).toEqual([])
    // Even though `progression.rows[].grants`/`.sets` and
    // `choiceSet.from`/`writesTo` NAME other definitions, Step 2 does not
    // turn those names into edges -- see dependency-graph.ts's own comment.
    expect(graphResult.graph.getDependencies('progression:class.martial')).toEqual([])
    expect(graphResult.graph.getDependencies('choice:skill.class')).toEqual([])
  })

  it('construction succeeds even when a Progression names a Source that was never defined', () => {
    // Confirms the "no edges" claim above is not merely untested but
    // load-bearing: if grants DID become edges, this would fail with a
    // dangling-reference graph-construction error.
    const registryResult = RulesRegistry.create(manifest(), [progression, levelValue])
    expect(registryResult.ok).toBe(true)
    if (!registryResult.ok) return

    const graphResult = DependencyGraph.build(registryResult.registry)
    expect(graphResult.ok).toBe(true)
  })
})

describe('nothing evaluates the new kinds yet', () => {
  it('evaluating a Table/Progression/ChoiceSet returns a RulesError, not a value', () => {
    const registryResult = RulesRegistry.create(manifest(), [table, progression, choiceSet, levelValue])
    expect(registryResult.ok).toBe(true)
    if (!registryResult.ok) return

    const graphResult = DependencyGraph.build(registryResult.registry)
    expect(graphResult.ok).toBe(true)
    if (!graphResult.ok) return

    const actorState = {
      actorId: 'actor:1',
      packageId: manifest().packageId,
      packageVersion: manifest().version,
      stateSchemaVersion: 1,
      values: {},
      collections: {},
      choices: {},
      sources: []
    }
    const session = new EvaluationSession(registryResult.registry, graphResult.graph, actorState, {})

    for (const id of ['table:proficiency_by_level', 'progression:class.martial', 'choice:skill.class']) {
      const result = evaluate(id, session)
      // A RulesError, not a computed RuleValue -- {definitionId, message},
      // never a number/string/boolean/array/DiceSpec.
      expect(result).toMatchObject({ definitionId: id, message: expect.stringContaining('no single evaluable RuleValue') })
    }
  })
})

describe('no existing Definition kind regresses', () => {
  it('a package built ONLY from the seven pre-existing kinds behaves exactly as before', () => {
    const value: ValueDefinition = { id: 'value:x', kind: 'value', valueType: 'number', storage: 'stored' }
    const registryResult = RulesRegistry.create(manifest(), [value])
    expect(registryResult.ok).toBe(true)
    if (!registryResult.ok) return

    const graphResult = DependencyGraph.build(registryResult.registry)
    expect(graphResult.ok).toBe(true)

    const validation = validatePackage(manifest(), [value])
    expect(validation.ok).toBe(true)

    // Registry still exposes exactly the pre-existing lookup surface for a
    // kind the new Definition kinds never touch.
    expect(registryResult.registry.listByKind('table')).toEqual([])
  })
})
