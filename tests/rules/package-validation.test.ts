// Unit tests for Package Validation (app/lib/rules/package-validation.ts).
// Per this task's own scope, package loading from JSON/disk, Action
// execution, Roll execution, and runtime evaluation are not exercised
// here -- only validatePackage(manifest, definitions).

import { describe, expect, it } from 'vitest'
import { validatePackage } from '../../app/lib/rules/package-validation'
import { parseExpression } from '../../app/lib/rules/parser'
import type {
  CollectionDefinition,
  Definition,
  Expression,
  ModifierApplicationPhase,
  ModifierDefinition,
  ModifierReference,
  ModifierSpec,
  RequiredTraitDeclaration,
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

function modifier(
  target: string,
  phase: ModifierApplicationPhase,
  value: ModifierSpec['value'],
  overrides: Partial<ModifierSpec> = {}
): ModifierSpec {
  return { target, phase, value, ...overrides } as ModifierSpec
}

function standaloneModifier(
  id: string,
  target: string,
  phase: ModifierApplicationPhase,
  value: ModifierSpec['value'],
  overrides: Partial<ModifierSpec> = {}
): ModifierDefinition {
  return { id, kind: 'modifier', target, phase, value, ...overrides } as ModifierDefinition
}

function source(id: string, modifiers: Array<ModifierSpec | ModifierReference>, overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return { id, kind: 'source', modifiers, ...overrides }
}

function modifierRef(ref: string): ModifierReference {
  return { ref }
}

function collectionDefinition(id: string, itemSchema: CollectionDefinition['itemSchema'], overrides: Partial<CollectionDefinition> = {}): CollectionDefinition {
  return { id, kind: 'collection', itemSchema, ...overrides }
}

function rollSpec(id: string, overrides: Partial<RollSpec> = {}): RollSpec {
  return { id, kind: 'roll', dice: expression('1d20'), successRule: { kind: 'atLeast', threshold: 10 }, ...overrides }
}

function issueCodes(result: ReturnType<typeof validatePackage>): string[] {
  return result.issues.map((issue) => issue.code)
}

describe('validatePackage -- successful valid package', () => {
  it('accepts a well-formed package with no issues at all', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard', { default: 10 }),
      source('source:blessed', [modifier('value:guard', 'add', 2)])
    ])
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('accepts a well-formed package that also has warnings (ok:true, non-empty issues)', () => {
    const result = validatePackage(manifest(), [standaloneModifier('modifier:unused', 'value:guard', 'add', 1), valueDefinition('value:guard')])
    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ severity: 'warning', code: 'unattached-modifier' })
  })
})

describe('validatePackage -- unresolved ModifierReference', () => {
  it('rejects a Source referencing a modifier id that does not exist', () => {
    const result = validatePackage(manifest(), [source('source:cursed', [modifierRef('modifier:doesNotExist')])])
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.severity === 'error' && issue.code === 'dependency-graph-error')).toBe(true)
  })
})

describe('validatePackage -- wrong-kind ModifierReference', () => {
  it('rejects a Source referencing a real Definition that is not kind:modifier', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:notAModifier'),
      source('source:cursed', [modifierRef('value:notAModifier')])
    ])
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.severity === 'error' && issue.code === 'dependency-graph-error')).toBe(true)
  })
})

describe('validatePackage -- undeclared modifierType', () => {
  it('rejects a modifier declaring a modifierType absent from manifest.modifierTypes', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard'),
      source('source:blessed', [modifier('value:guard', 'add', 2, { modifierType: 'equipment' })])
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'undeclared-modifier-type', definitionId: 'source:blessed' })
    )
  })

  it('accepts the same modifier once its modifierType is declared', () => {
    const result = validatePackage(manifest({ modifierTypes: [{ id: 'equipment', stacking: 'highest' }] }), [
      valueDefinition('value:guard'),
      source('source:blessed', [modifier('value:guard', 'add', 2, { modifierType: 'equipment' })])
    ])
    expect(result.ok).toBe(true)
  })

  it('does not check an omitted modifierType against the table at all', () => {
    const result = validatePackage(manifest(), [valueDefinition('value:guard'), source('source:blessed', [modifier('value:guard', 'add', 2)])])
    expect(issueCodes(result)).not.toContain('undeclared-modifier-type')
  })

  it('rejects a manifest that declares the same modifierType id twice', () => {
    const result = validatePackage(
      manifest({ modifierTypes: [{ id: 'equipment', stacking: 'highest' }, { id: 'equipment', stacking: 'stack' }] }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'duplicate-modifier-type-declaration' }))
  })
})

describe('validatePackage -- illegal base phase', () => {
  it('rejects a modifier declaring phase "base" (JSON-deserialized, bypassing the type system)', () => {
    const malformedModifier = { target: 'value:guard', phase: 'base', value: 1 } as unknown as ModifierSpec
    const result = validatePackage(manifest(), [valueDefinition('value:guard'), source('source:blessed', [malformedModifier])])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'illegal-base-phase', definitionId: 'source:blessed' })
    )
  })
})

describe('validatePackage -- missing clamp bound', () => {
  it('rejects a clamp-phase modifier whose clamp bound was stripped (JSON-deserialized)', () => {
    const malformedModifier = { target: 'value:guard', phase: 'clamp', value: 20 } as unknown as ModifierSpec
    const result = validatePackage(manifest(), [valueDefinition('value:guard'), source('source:blessed', [malformedModifier])])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'missing-clamp-bound' }))
  })

  it('accepts a clamp-phase modifier with a valid clamp bound', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard'),
      source('source:blessed', [modifier('value:guard', 'clamp', 20, { clamp: 'max' })])
    ])
    expect(result.ok).toBe(true)
  })
})

describe('validatePackage -- unattached standalone Modifier', () => {
  it('reports a warning, not an error, and does not fail the package', () => {
    const result = validatePackage(manifest(), [standaloneModifier('modifier:library.unused', 'value:guard', 'add', 1), valueDefinition('value:guard')])
    expect(result.ok).toBe(true)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'unattached-modifier', definitionId: 'modifier:library.unused' })
    )
  })

  it('does not warn once the standalone modifier is attached via {ref}', () => {
    const result = validatePackage(manifest(), [
      standaloneModifier('modifier:armour.guard', 'value:guard', 'add', 1),
      valueDefinition('value:guard'),
      source('source:item.hauberk', [modifierRef('modifier:armour.guard')])
    ])
    expect(issueCodes(result)).not.toContain('unattached-modifier')
  })
})

describe('validatePackage -- invalid sourceRefField', () => {
  it('rejects a sourceRefField that does not name a key in itemSchema', () => {
    const result = validatePackage(manifest(), [
      collectionDefinition('collection:inventory', [{ key: 'name', valueType: 'text' }], { sourceRefField: 'doesNotExist' })
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'invalid-source-ref-field', definitionId: 'collection:inventory' })
    )
  })

  it('rejects a sourceRefField key that is not valueType:ref/refKind:source', () => {
    const result = validatePackage(manifest(), [
      collectionDefinition('collection:inventory', [{ key: 'sourceRef', valueType: 'text' }], { sourceRefField: 'sourceRef' })
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'invalid-source-ref-field' }))
  })

  it('accepts a correctly declared sourceRefField', () => {
    const result = validatePackage(manifest(), [
      collectionDefinition('collection:inventory', [{ key: 'sourceRef', valueType: 'ref', refKind: 'source' }], { sourceRefField: 'sourceRef' })
    ])
    expect(result.ok).toBe(true)
  })

  it('is a no-op when sourceRefField is not declared at all', () => {
    const result = validatePackage(manifest(), [collectionDefinition('collection:inventory', [{ key: 'name', valueType: 'text' }])])
    expect(result.ok).toBe(true)
  })
})

describe('validatePackage -- reserved field collisions', () => {
  it.each(['instanceId', 'definitionId', 'duration', 'origin'])('rejects an itemSchema field named %s', (reservedKey) => {
    const result = validatePackage(manifest(), [collectionDefinition('collection:inventory', [{ key: reservedKey, valueType: 'text' }])])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'reserved-field-collision', definitionId: 'collection:inventory' })
    )
  })

  it('accepts an itemSchema with only non-reserved keys', () => {
    const result = validatePackage(manifest(), [
      collectionDefinition('collection:inventory', [{ key: 'name', valueType: 'text' }, { key: 'quantity', valueType: 'number' }])
    ])
    expect(result.ok).toBe(true)
  })
})

describe('validatePackage -- registry construction failure', () => {
  it('rejects a package with duplicate DefinitionIds and skips every other check', () => {
    const result = validatePackage(manifest(), [valueDefinition('value:might'), valueDefinition('value:might')])
    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'error', code: 'registry-construction-error' })])
  })
})

describe('validatePackage -- composed Reference Validation', () => {
  it('rejects a formula referencing an unknown Value', () => {
    const result = validatePackage(manifest(), [
      { id: 'value:x', kind: 'value', valueType: 'number', storage: 'derived', formula: expression('@value:doesNotExist') } as ValueDefinition
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'unknown-definition' }))
  })

  it('rejects a manifest semantic role bound to an unknown Definition', () => {
    const result = validatePackage(manifest({ semanticRoles: { vitality: 'value:doesNotExist' } }), [valueDefinition('value:might')])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'unknown-semantic-role' }))
  })
})

describe('validatePackage -- composed Type Validation (modifier condition/value)', () => {
  it('rejects a modifier condition that statically resolves to a non-boolean type', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard'),
      source('source:blessed', [modifier('value:guard', 'add', 2, { condition: expression('1 + 1') })])
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'modifier-condition-not-statically-boolean' }))
  })

  it('rejects an add-phase modifier value that statically resolves to a non-numeric type', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard'),
      source('source:blessed', [modifier('value:guard', 'add', expression('"not a number"'))])
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'modifier-value-not-statically-numeric' }))
  })

  it('accepts a numeric add-phase value and a boolean condition', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard'),
      valueDefinition('value:flag', { valueType: 'boolean' }),
      source('source:blessed', [modifier('value:guard', 'add', expression('2 + 3'), { condition: expression('@value:flag') })])
    ])
    expect(result.ok).toBe(true)
  })

  it('does not check value type for set/final phases (any RuleValue is legal there)', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard'),
      source('source:blessed', [modifier('value:guard', 'set', expression('"a text override"'))])
    ])
    expect(issueCodes(result)).not.toContain('modifier-value-not-statically-numeric')
  })
})

describe('validatePackage -- composed static cycle detection', () => {
  it('rejects a package containing a dependency cycle', () => {
    const result = validatePackage(manifest(), [
      { id: 'value:a', kind: 'value', valueType: 'number', storage: 'derived', formula: expression('@value:b') } as ValueDefinition,
      { id: 'value:b', kind: 'value', valueType: 'number', storage: 'derived', formula: expression('@value:a') } as ValueDefinition
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'dependency-cycle' }))
  })
})

describe('validatePackage -- roll specs and other definition kinds are unaffected', () => {
  it('a package containing a valid Roll Spec alongside modifiers still validates cleanly', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard'),
      source('source:blessed', [modifier('value:guard', 'add', 2)]),
      rollSpec('roll:attack')
    ])
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// World Configuration -- Commit 2 (world-configuration.md §D/§E/§F, §15)
// ---------------------------------------------------------------------------

describe('validatePackage -- requiredTraits', () => {
  it('rejects a manifest declaring the same (kind, trait) pair twice', () => {
    const result = validatePackage(
      manifest({
        requiredTraits: [
          { kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 },
          { kind: 'roadType', trait: 'quality', valueType: 'number', default: 2 }
        ]
      }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'duplicate-required-trait' }))
  })

  it('rejects a default whose runtime type does not match the declared valueType', () => {
    const badTrait = { kind: 'roadType', trait: 'quality', valueType: 'number', default: 'not-a-number' } as unknown as RequiredTraitDeclaration
    const result = validatePackage(manifest({ requiredTraits: [badTrait] }), [valueDefinition('value:guard')])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'required-trait-default-type-mismatch' }))
  })

  it('accepts a well-formed requiredTrait declaration', () => {
    const result = validatePackage(
      manifest({ requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }] }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(true)
    expect(issueCodes(result)).not.toContain('duplicate-required-trait')
    expect(issueCodes(result)).not.toContain('required-trait-default-type-mismatch')
    expect(issueCodes(result)).not.toContain('missing-required-trait-default')
  })
})

describe('validatePackage -- optionalRules', () => {
  it('rejects a manifest declaring the same key twice', () => {
    const result = validatePackage(
      manifest({
        optionalRules: [
          { key: 'flanking', label: 'Flanking', valueType: 'boolean', default: false },
          { key: 'flanking', label: 'Flanking Again', valueType: 'boolean', default: true }
        ]
      }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'duplicate-optional-rule' }))
  })

  it('rejects an enum optional rule declared with no options', () => {
    const result = validatePackage(
      manifest({
        optionalRules: [{ key: 'restVariant', label: 'Rest Variant', valueType: 'enum', default: 'standard', options: [] }]
      }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'optional-rule-enum-missing-options' }))
  })

  it('rejects an enum optional rule whose default is not among its options', () => {
    const result = validatePackage(
      manifest({
        optionalRules: [{ key: 'restVariant', label: 'Rest Variant', valueType: 'enum', default: 'gritty', options: ['standard', 'heroic'] }]
      }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'optional-rule-enum-default-not-in-options' }))
  })

  it('rejects a default whose runtime type does not match the declared valueType', () => {
    const result = validatePackage(
      manifest({
        optionalRules: [{ key: 'flanking', label: 'Flanking', valueType: 'boolean', default: 'yes' as unknown as boolean }]
      }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'optional-rule-default-type-mismatch' }))
  })

  it('rejects an optional rule key that collides with the reserved world-config kind "rules"', () => {
    const result = validatePackage(
      manifest({ optionalRules: [{ key: 'rules', label: 'Rules', valueType: 'boolean', default: false }] }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'optional-rule-reserved-key-collision' }))
  })

  it('accepts a well-formed optionalRule declaration', () => {
    const result = validatePackage(
      manifest({ optionalRules: [{ key: 'flanking', label: 'Flanking', valueType: 'boolean', default: false }] }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(true)
    expect(issueCodes(result).some((code) => code.startsWith('optional-rule'))).toBe(false)
  })
})

describe('validatePackage -- rollTypes', () => {
  it('rejects a manifest declaring the same roll type id twice', () => {
    const result = validatePackage(
      manifest({
        rollTypes: [
          { id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'] },
          { id: 'luck', label: 'Luck Roll Again', rollSpec: 'roll:luck', surfaces: ['sheet'] }
        ]
      }),
      [rollSpec('roll:luck')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'duplicate-roll-type-id' }))
  })

  it('rejects a surface not in the supported set', () => {
    const result = validatePackage(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['gm-only' as unknown as 'sheet'] }] }),
      [rollSpec('roll:luck')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'invalid-roll-type-surface' }))
  })

  it('rejects the same surface declared twice on one roll type', () => {
    const result = validatePackage(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet', 'sheet'] }] }),
      [rollSpec('roll:luck')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'duplicate-roll-type-surface' }))
  })

  it('rejects a rollSpec that does not resolve to any Definition', () => {
    const result = validatePackage(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:doesNotExist', surfaces: ['sheet'] }] }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'unknown-roll-spec' }))
  })

  it('rejects a rollSpec that resolves to a Definition that is not kind:roll', () => {
    const result = validatePackage(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'value:guard', surfaces: ['sheet'] }] }),
      [valueDefinition('value:guard')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'roll-type-target-not-roll' }))
  })

  it('rejects an unsupported visibility value', () => {
    const result = validatePackage(
      manifest({
        rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet'], visibility: 'hidden' as unknown as 'public' }]
      }),
      [rollSpec('roll:luck')]
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'invalid-roll-type-visibility' }))
  })

  it('accepts a well-formed roll type declaration', () => {
    const result = validatePackage(
      manifest({ rollTypes: [{ id: 'luck', label: 'Luck Roll', rollSpec: 'roll:luck', surfaces: ['sheet', 'gm-toolbar'], visibility: 'public' }] }),
      [rollSpec('roll:luck')]
    )
    expect(result.ok).toBe(true)
  })
})

describe('validatePackage -- @world reference declaredness', () => {
  it('accepts @world:rules.X when X is a declared optionalRules key', () => {
    const result = validatePackage(
      manifest({ optionalRules: [{ key: 'flanking', label: 'Flanking', valueType: 'boolean', default: false }] }),
      [valueDefinition('value:x', { storage: 'derived', formula: expression('@world:rules.flanking') })]
    )
    expect(result.ok).toBe(true)
    expect(issueCodes(result)).not.toContain('undeclared-optional-rule-reference')
  })

  it('rejects @world:rules.X when X is not a declared optionalRules key', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:x', { storage: 'derived', formula: expression('@world:rules.flanking') })
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'undeclared-optional-rule-reference', definitionId: 'value:x' })
    )
  })

  it('accepts @world:<kind>.<key> when the pair is a declared requiredTraits entry', () => {
    const result = validatePackage(
      manifest({ requiredTraits: [{ kind: 'roadType', trait: 'quality', valueType: 'number', default: 1 }] }),
      [valueDefinition('value:x', { storage: 'derived', formula: expression('@world:roadType.quality') })]
    )
    expect(result.ok).toBe(true)
    expect(issueCodes(result)).not.toContain('undeclared-required-trait-reference')
  })

  it('rejects @world:<kind>.<key> when the pair is not a declared requiredTraits entry', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:x', { storage: 'derived', formula: expression('@world:roadType.quality') })
    ])
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'undeclared-required-trait-reference', definitionId: 'value:x' })
    )
  })
})

describe('validatePackage -- World Configuration regression (no sections declared)', () => {
  it('adds no World Configuration diagnostics for a manifest with no requiredTraits/optionalRules/rollTypes', () => {
    const result = validatePackage(manifest(), [
      valueDefinition('value:guard', { default: 10 }),
      source('source:blessed', [modifier('value:guard', 'add', 2)])
    ])
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })
})
