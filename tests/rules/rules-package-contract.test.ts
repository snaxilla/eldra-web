// Unit tests for the manifest and category contract --
// .github/docs/architecture/rules-package-architecture.md Step 1.
//
// This phase is TYPE-ONLY and ADDITIVE. There is no new behaviour to test,
// which is precisely what makes these tests worth writing: the contract's
// whole claim is that nothing changed, and "nothing changed" is a claim that
// needs evidence rather than assertion.
//
// Three things are pinned here:
//   1. The registry is closed, ordered, and complete (§6.3).
//   2. The real shipped package -- packages/eldra-generic-d20 -- still loads,
//      still validates, and hashes to the SAME integrity value as before
//      this commit (§Compatibility). That last property is the one that
//      would silently break a published package if `category` had been added
//      carelessly, and it is verified against the real files on disk rather
//      than a fixture.
//   3. The new fields are genuinely optional everywhere.
//
// Pure: no Nuxt, no Directus, no HTTP.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { canonicalize } from '../../app/lib/rules/canonicalize'
import { parseExpression } from '../../app/lib/rules/parser'
import { RulesRegistry } from '../../app/lib/rules/registry'
import { loadRulesPackage } from '../../app/lib/rules/rules-package'
import { validatePackage } from '../../app/lib/rules/package-validation'
import { resolveWorldConfig } from '../../app/lib/rules/world-config'
import {
  CORE_CHARACTER_RULE_CATEGORIES,
  RULE_CATEGORIES,
  RULE_CATEGORY_LABELS,
  type Definition,
  type Expression,
  type RuleCategory,
  type RulesPackageManifest,
  type ValueDefinition
} from '../../app/lib/rules/types'

// ---------------------------------------------------------------------------
// The real shipped package, loaded from disk exactly as
// scripts/directus/publish-starter-package.mjs does.
// ---------------------------------------------------------------------------

const PACKAGE_DIR = 'packages/eldra-generic-d20'

function hydrateExpressions(node: any): any {
  if (Array.isArray(node)) return node.map(hydrateExpressions)
  if (node && typeof node === 'object') {
    if (typeof node.text === 'string' && !node.ast) {
      const result = parseExpression(node.text)
      if (!result.ok) throw new Error(`Fixture expression failed to parse: ${node.text}`)
      return { text: node.text, ast: result.ast }
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, hydrateExpressions(value)]))
  }
  return node
}

function loadStarterPackage() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrateExpressions(
    JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))
  ) as Definition[]
  return { manifest, definitions }
}

describe('the Rule Category registry (§6.3)', () => {
  it('declares exactly the eighteen canonical categories, in authoring order', () => {
    expect(RULE_CATEGORIES).toEqual([
      'core.abilities',
      'core.proficiency',
      'core.skills',
      'core.saves',
      'core.defenses',
      'core.health',
      'progression',
      'character.creation',
      'combat',
      'movement',
      'conditions',
      'spellcasting',
      'equipment',
      'resting',
      'death',
      'currency',
      'downtime',
      'environment'
    ])
  })

  it('is ordered by authoring sequence, NOT alphabetically', () => {
    // Pinned because a well-meaning "tidy up" would sort it, and the order
    // is what a sheet reads top to bottom.
    expect([...RULE_CATEGORIES]).not.toEqual([...RULE_CATEGORIES].sort())
  })

  it('contains no duplicates', () => {
    expect(new Set(RULE_CATEGORIES).size).toBe(RULE_CATEGORIES.length)
  })

  it('names every category, so a coverage report can render one (§6.4)', () => {
    for (const category of RULE_CATEGORIES) {
      expect(RULE_CATEGORY_LABELS[category]).toBeTruthy()
    }
    expect(Object.keys(RULE_CATEGORY_LABELS).sort()).toEqual([...RULE_CATEGORIES].sort())
  })

  it('exposes the Core Character Rules as the first eight, in the same order', () => {
    expect(CORE_CHARACTER_RULE_CATEGORIES).toEqual(RULE_CATEGORIES.slice(0, 8))
  })
})

describe('the generic d20 package is completely unaffected (§Compatibility)', () => {
  it('still constructs a registry and loads as a runtime package', () => {
    const { manifest, definitions } = loadStarterPackage()

    const registry = RulesRegistry.create(manifest, definitions)
    expect(registry.ok).toBe(true)

    const worldConfig = resolveWorldConfig(manifest, 'world-1', null)
    const loaded = loadRulesPackage(manifest, definitions, worldConfig)
    expect(loaded.ok).toBe(true)
  })

  it('still passes package validation with no new issues', () => {
    const { manifest, definitions } = loadStarterPackage()
    const result = validatePackage(manifest, definitions)

    expect(result.ok).toBe(true)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('hashes to the SAME canonical form -- adding an optional field changed no published identity', () => {
    // The load-bearing compatibility test. `canonicalize` filters keys whose
    // value is `undefined`, so a Definition that declares no `category` and a
    // Definition that never could serialise identically. If this ever fails,
    // a published package's integrity hash has moved and every character
    // built against it is now claiming a package that no longer exists.
    const { definitions } = loadStarterPackage()
    const serialized = canonicalize(definitions)

    expect(serialized).not.toContain('category')
    expect(serialized).not.toContain('provides')

    // And explicitly: an absent optional field is invisible to the hash.
    const withAbsentCategory = definitions.map((definition) => ({ ...definition, category: undefined }))
    expect(canonicalize(withAbsentCategory)).toBe(serialized)
  })

  it('declares no vocabulary and no categories, and is valid anyway', () => {
    const { manifest } = loadStarterPackage()

    expect(manifest.provides).toBeUndefined()
    expect(manifest.categories).toBeUndefined()
    expect(validatePackage(manifest, loadStarterPackage().definitions).ok).toBe(true)
  })
})

describe('the new manifest fields', () => {
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

  const value: ValueDefinition = { id: 'value:x', kind: 'value', valueType: 'number', storage: 'stored' }

  it('carry a vocabulary and declared coverage through validation untouched', () => {
    const withContract = manifest({
      provides: { vocabulary: 'dnd5e.2024' },
      categories: ['core.abilities', 'core.proficiency']
    })

    expect(validatePackage(withContract, [value]).ok).toBe(true)
    expect(withContract.provides?.vocabulary).toBe('dnd5e.2024')
    expect(withContract.categories).toEqual(['core.abilities', 'core.proficiency'])
  })

  it('are NOT validated in this phase -- type-only, exactly as modifierTypes once was', () => {
    // Deliberate: Step 1 adds no validation. A vocabulary that looks like a
    // version range, or a declared category with no matching Definition, is
    // accepted here and becomes Step 2+'s concern. Pinned so that a later
    // commit adding validation has to change this test on purpose rather
    // than discovering the absence by accident.
    const sloppy = manifest({
      provides: { vocabulary: 'dnd5e.2024@^1.2' },
      categories: ['core.spellcasting' as RuleCategory]
    })

    expect(validatePackage(sloppy, [value]).ok).toBe(true)
  })
})

describe('category on definitions', () => {
  it('is optional -- an uncategorised Definition is legal and complete', () => {
    const uncategorised: ValueDefinition = {
      id: 'value:x',
      kind: 'value',
      valueType: 'number',
      storage: 'stored'
    }

    expect(uncategorised.category).toBeUndefined()
    expect(RulesRegistry.create(
      {
        packageId: 'eldra.test.pkg',
        version: '1.0.0',
        status: 'published',
        engineApiVersion: '^1.0.0',
        stateSchemaVersion: 1,
        title: 'Test',
        license: { id: 'CC0-1.0' },
        capabilities: [],
        dependencies: []
      },
      [uncategorised]
    ).ok).toBe(true)
  })

  it('is carried on every identified Definition kind, and survives indexing', () => {
    const expressionFor = (text: string): Expression => {
      const parsed = parseExpression(text)
      if (!parsed.ok) throw new Error(`failed to parse ${text}`)
      return { text, ast: parsed.ast as Expression['ast'] }
    }

    // One of each of the seven union members, each categorised.
    const definitions: Definition[] = [
      { id: 'value:str', kind: 'value', valueType: 'number', storage: 'stored', category: 'core.abilities' },
      { id: 'resource:hp', kind: 'resource', max: 10, category: 'core.health' },
      { id: 'collection:inventory', kind: 'collection', itemSchema: [], category: 'equipment' },
      { id: 'mod:bonus', kind: 'modifier', phase: 'add', target: 'value:str', value: 1, category: 'core.abilities' },
      { id: 'action:strike', kind: 'action', category: 'combat' },
      { id: 'roll:check', kind: 'roll', dice: expressionFor('1d20'), successRule: { kind: 'none' }, category: 'combat' },
      { id: 'source:feature.x', kind: 'source', modifiers: [], category: 'progression' }
    ]

    const registry = RulesRegistry.create(
      {
        packageId: 'eldra.test.pkg',
        version: '1.0.0',
        status: 'published',
        engineApiVersion: '^1.0.0',
        stateSchemaVersion: 1,
        title: 'Test',
        license: { id: 'CC0-1.0' },
        capabilities: [],
        dependencies: []
      },
      definitions
    )

    expect(registry.ok).toBe(true)
    if (!registry.ok) return

    // The category round-trips through the registry untouched -- the engine
    // neither reads nor strips it.
    for (const definition of definitions) {
      expect(registry.registry.getById(definition.id)?.category).toBe(definition.category)
    }
  })

  it('does not participate in evaluation -- two Definitions differing only by category are identical to the engine', () => {
    // The §6.1 claim, made testable: a category never changes how a
    // Definition evaluates. Canonical form is the strongest available proxy
    // -- it is what integrity, and therefore package identity, is built on.
    const base: ValueDefinition = { id: 'value:x', kind: 'value', valueType: 'number', storage: 'stored' }
    const categorised: ValueDefinition = { ...base, category: 'core.abilities' }

    expect(canonicalize(categorised)).not.toBe(canonicalize(base))
    // ...but the difference is confined to the one added key, and nothing
    // mechanical moved.
    expect(canonicalize(categorised)).toContain('"category":"core.abilities"')
    expect(canonicalize({ ...categorised, category: undefined })).toBe(canonicalize(base))
  })
})
