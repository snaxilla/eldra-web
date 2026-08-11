// Unit tests for Rules Engine reference resolution and validation
// (app/lib/rules/reference-validation.ts). These assert on the public API
// (validateReferences, validateSemanticRoles) only.

import { describe, expect, it } from 'vitest'
import { validateReferences, validateSemanticRoles } from '../../app/lib/rules/reference-validation'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { parseExpression } from '../../app/lib/rules/parser'
import type { RuleExpressionNode } from '../../app/lib/rules/ast'
import type { RulesPackageManifest, ValueDefinition, CollectionDefinition } from '../../app/lib/rules/types'

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

function valueDefinition(id: string): ValueDefinition {
  return { id, kind: 'value', valueType: 'number', storage: 'stored' }
}

function collectionDefinition(id: string): CollectionDefinition {
  return { id, kind: 'collection', itemSchema: [] }
}

function registryWith(definitions: Array<ValueDefinition | CollectionDefinition>, manifestOverrides: Partial<RulesPackageManifest> = {}): RulesRegistry {
  const result = RulesRegistry.create(manifest(manifestOverrides), definitions)
  if (!result.ok) {
    throw new Error(`Expected registry construction to succeed, got: ${JSON.stringify(result.errors)}`)
  }
  return result.registry
}

function ast(text: string): RuleExpressionNode {
  const result = parseExpression(text)
  if (!result.ok) {
    throw new Error(`Expected '${text}' to parse, got: ${JSON.stringify(result.diagnostics)}`)
  }
  return result.ast
}

describe('valid references', () => {
  it('a single reference that resolves in the registry', () => {
    const registry = registryWith([valueDefinition('value:might')])
    expect(validateReferences(ast('@value:might'), registry)).toEqual({ ok: true })
  })

  it('a dotted-path reference that itself is a full DefinitionId', () => {
    // rules-engine.md's own worked example: "value:might.mod" is a
    // standalone derived Value Definition, not a sub-accessor of
    // "value:might" -- the whole path is the slug.
    const registry = registryWith([valueDefinition('value:might.mod')])
    expect(validateReferences(ast('@value:might.mod'), registry)).toEqual({ ok: true })
  })

  it('an expression with no references at all is valid', () => {
    const registry = registryWith([])
    expect(validateReferences(ast('floor((2 + 3) / 2)'), registry)).toEqual({ ok: true })
  })
})

describe('missing definitions', () => {
  it('a value reference with no matching Definition', () => {
    const registry = registryWith([])
    const result = validateReferences(ast('@value:might'), registry)
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          kind: 'unknown-definition',
          message: "Unknown Definition 'value:might'",
          namespace: 'value',
          path: 'might',
          definitionId: 'value:might'
        }
      ]
    })
  })

  it('a collection reference with no matching Definition', () => {
    const registry = registryWith([])
    const result = validateReferences(ast('count(@collection:inventory)'), registry)
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          kind: 'unknown-definition',
          message: "Unknown Definition 'collection:inventory'",
          namespace: 'collection',
          path: 'inventory',
          definitionId: 'collection:inventory'
        }
      ]
    })
  })
})

describe('multiple references', () => {
  it('reports one diagnostic per distinct missing reference', () => {
    const registry = registryWith([valueDefinition('value:hp')])
    const result = validateReferences(ast('clamp(@value:hp, @value:minHp, @value:maxHp)'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.definitionId)).toEqual(['value:minHp', 'value:maxHp'])
    }
  })

  it('a mix of resolvable and unresolvable references only flags the unresolvable ones', () => {
    const registry = registryWith([valueDefinition('value:might'), valueDefinition('value:hardiness.mod')])
    const result = validateReferences(ast('@value:might + @value:hardiness.mod - @value:missing'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0]!.definitionId).toBe('value:missing')
    }
  })
})

describe('duplicate references', () => {
  it('the same missing reference used twice is reported once', () => {
    const registry = registryWith([])
    const result = validateReferences(ast('@value:might + @value:might'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics).toHaveLength(1)
    }
  })

  it('the same missing reference reached through different syntactic positions is still reported once', () => {
    const registry = registryWith([])
    const result = validateReferences(ast('if(@value:hp > 0, @value:hp, 0)'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0]!.definitionId).toBe('value:hp')
    }
  })
})

describe('namespaces the registry does not check', () => {
  it('@sources references are never flagged as unknown definitions', () => {
    const registry = registryWith([])
    expect(validateReferences(ast('count(@sources)'), registry)).toEqual({ ok: true })
  })

  it('@ctx references are never flagged as unknown definitions', () => {
    const registry = registryWith([])
    expect(validateReferences(ast('@ctx:successes'), registry)).toEqual({ ok: true })
  })

  it('@world references are never flagged as unknown definitions', () => {
    const registry = registryWith([])
    expect(validateReferences(ast('@world:roadType.speedFactor'), registry)).toEqual({ ok: true })
  })

  it('@choice references are never flagged as unknown definitions', () => {
    // ChoiceSet is not yet modeled as a Definition kind (types.ts) -- see
    // reference-validation.ts's design-decision-2 comment for why this is
    // deliberately left unchecked rather than always failing.
    const registry = registryWith([])
    expect(validateReferences(ast('@choice:background'), registry)).toEqual({ ok: true })
  })
})

describe('@world path arity (world-configuration.md §F.2)', () => {
  it('accepts a two-segment @world reference', () => {
    const registry = registryWith([])
    expect(validateReferences(ast('@world:rules.flanking'), registry)).toEqual({ ok: true })
  })

  it('accepts a two-segment reference under a non-reserved kind', () => {
    const registry = registryWith([])
    expect(validateReferences(ast('@world:calendar.currentSeason'), registry)).toEqual({ ok: true })
  })

  it('rejects a one-segment @world reference', () => {
    const registry = registryWith([])
    const result = validateReferences(ast('@world:restVariant'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics).toEqual([
        {
          kind: 'invalid-world-reference',
          message:
            "'@world:restVariant' must have exactly two path segments -- '@world:<kind>.<key>' (for example '@world:rules.flanking')",
          namespace: 'world',
          path: 'restVariant'
        }
      ])
    }
  })

  it('rejects a three-segment @world reference', () => {
    const registry = registryWith([])
    const result = validateReferences(ast('@world:a.b.c'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.kind)).toEqual(['invalid-world-reference'])
      expect(result.diagnostics[0]?.path).toBe('a.b.c')
    }
  })

  it('rejects a bare @world reference with no path', () => {
    // The parser does not reject this today (only @source/@sources carry
    // namespace-specific arity checks), so it is reachable through normal
    // parsing, not just hand-built AST.
    const registry = registryWith([])
    const result = validateReferences(ast('@world'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.kind)).toEqual(['invalid-world-reference'])
      expect(result.diagnostics[0]?.path).toBeUndefined()
    }
  })

  it('reports arity per distinct reference, and does not affect other namespaces', () => {
    const registry = registryWith([valueDefinition('value:a')])
    const result = validateReferences(ast('@world:one + @world:a.b.c + @value:a + @ctx:x'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.path)).toEqual(['one', 'a.b.c'])
    }
  })

  it('arity failure does not also report the reference as an unknown definition', () => {
    // A `world` reference is never registry-resolvable, so an arity
    // diagnostic must be the ONLY diagnostic it produces.
    const registry = registryWith([])
    const result = validateReferences(ast('@world:restVariant'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics).toHaveLength(1)
    }
  })

  it('does not yet check whether the trait is declared -- that is Package Validation', () => {
    // `rules.neverDeclared` names no declared optional rule and
    // `roadType.neverDeclared` no declared requiredTrait, but neither
    // check belongs to this phase (world-configuration.md §15): both need
    // the manifest, which validateReferences does not take.
    const registry = registryWith([])
    expect(validateReferences(ast('@world:rules.neverDeclared'), registry)).toEqual({ ok: true })
    expect(validateReferences(ast('@world:roadType.neverDeclared'), registry)).toEqual({ ok: true })
  })
})

describe('unknown namespace (defensive, hand-built AST only)', () => {
  it('flags a reference node whose namespace is outside the closed six', () => {
    // The parser can never produce this (parser.ts rejects unknown
    // namespaces at parse time); this exercises the defensive runtime
    // check for AST built by something other than the parser.
    const registry = registryWith([])
    const malformed: RuleExpressionNode = { kind: 'reference', namespace: 'bogus' as any, path: 'x' }
    const result = validateReferences(malformed, registry)
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          kind: 'unknown-namespace',
          message: "Unknown reference namespace 'bogus'",
          namespace: 'bogus',
          path: 'x'
        }
      ]
    })
  })
})

describe('semantic role lookup', () => {
  it('a role bound to a Definition that exists in the registry is valid', () => {
    const might = valueDefinition('value:might')
    const registry = registryWith([might], { semanticRoles: { vitality: 'value:might' } })
    expect(validateSemanticRoles(manifest({ semanticRoles: { vitality: 'value:might' } }), registry)).toEqual({
      ok: true
    })
  })

  it('a manifest with no semantic role bindings at all is valid', () => {
    const registry = registryWith([])
    expect(validateSemanticRoles(manifest(), registry)).toEqual({ ok: true })
  })
})

describe('unknown role bindings', () => {
  it('flags a role bound to a DefinitionId absent from the registry', () => {
    const registry = registryWith([valueDefinition('value:might')])
    const result = validateSemanticRoles(
      manifest({ semanticRoles: { vitality: 'value:doesNotExist' } }),
      registry
    )
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          kind: 'unknown-semantic-role',
          message: "Semantic Role 'vitality' is bound to unknown Definition 'value:doesNotExist'",
          role: 'vitality',
          definitionId: 'value:doesNotExist'
        }
      ]
    })
  })

  it('flags a role name outside the closed Semantic Role vocabulary', () => {
    const registry = registryWith([valueDefinition('value:might')])
    const result = validateSemanticRoles(
      manifest({ semanticRoles: { madeUpRole: 'value:might' } as any }),
      registry
    )
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          kind: 'unknown-semantic-role',
          message: "Unknown Semantic Role 'madeUpRole'",
          role: 'madeUpRole'
        }
      ]
    })
  })

  it('reports every dangling role binding, not just the first', () => {
    const registry = registryWith([])
    const result = validateSemanticRoles(
      manifest({ semanticRoles: { vitality: 'value:a', level: 'value:b' } }),
      registry
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.role)).toEqual(['vitality', 'level'])
    }
  })
})

describe('deterministic diagnostics', () => {
  it('validating the same AST twice yields identical diagnostics', () => {
    const registry = registryWith([])
    const expression = ast('@value:a + @value:b + @value:a')
    expect(validateReferences(expression, registry)).toEqual(validateReferences(expression, registry))
  })

  it('diagnostic order reflects first-occurrence traversal order', () => {
    const registry = registryWith([])
    const result = validateReferences(ast('@value:z + @value:a + @value:z + @value:m'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.definitionId)).toEqual(['value:z', 'value:a', 'value:m'])
    }
  })

  it('validating the same semantic role bindings twice yields identical diagnostics', () => {
    const registry = registryWith([])
    const withRoles = manifest({ semanticRoles: { vitality: 'value:missing' } })
    expect(validateSemanticRoles(withRoles, registry)).toEqual(validateSemanticRoles(withRoles, registry))
  })
})
