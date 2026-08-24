// Tests for the first real Rules Package -- packages/eldra-dnd5e-2024
// (rules-package-architecture.md Step 3).
//
// This is a PACKAGE test, not an engine test. It loads the real files from
// disk exactly as scripts/directus/publish-starter-package.mjs does, then
// puts them through the real engine: parse -> registry -> dependency graph
// -> validation -> evaluation. Nothing is mocked and nothing is fixtured,
// because the artifact under test IS the file on disk.
//
// Three classes of assertion, in increasing order of what they protect:
//   1. It loads, validates, indexes, graphs, and canonicalizes.
//   2. It EVALUATES to the right numbers -- the only proof that a rules
//      package is mechanically real rather than merely well-formed.
//   3. It respects its own boundaries: no Content, no prose. Those two are
//      the architectural and licensing commitments the package makes, and
//      a test is the only thing that keeps them true as it grows.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { canonicalize } from '../../app/lib/rules/canonicalize'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { evaluate } from '../../app/lib/rules/evaluator'
import { validatePackage } from '../../app/lib/rules/package-validation'
import { parseExpression } from '../../app/lib/rules/parser'
import { RulesRegistry } from '../../app/lib/rules/registry'
import {
  RULE_CATEGORIES,
  type ActorState,
  type Definition,
  type RuleCategory,
  type RulesPackageManifest,
  type RuleValue
} from '../../app/lib/rules/types'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'

// The same `{text}` -> `{text, ast}` hydration the publish script performs.
// A parse failure throws here rather than degrading, so a malformed formula
// surfaces as a named test failure instead of a downstream mystery.
function hydrateExpressions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(hydrateExpressions)
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string' && !record.ast) {
      const parsed = parseExpression(record.text)
      if (!parsed.ok) {
        throw new Error(`Formula failed to parse: '${record.text}' -- ${JSON.stringify(parsed.diagnostics)}`)
      }
      return { text: record.text, ast: parsed.ast }
    }
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, hydrateExpressions(value)]))
  }
  return node
}

function loadPackage() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrateExpressions(
    JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))
  ) as Definition[]
  return { manifest, definitions }
}

function actorState(values: Record<string, RuleValue> = {}): ActorState {
  const { manifest } = loadPackage()
  return {
    actorId: 'entity:test',
    packageId: manifest.packageId,
    packageVersion: manifest.version,
    stateSchemaVersion: manifest.stateSchemaVersion,
    values,
    collections: {},
    choices: {},
    sources: []
  }
}

function sessionFor(values: Record<string, RuleValue> = {}) {
  const { manifest, definitions } = loadPackage()
  const registry = RulesRegistry.create(manifest, definitions)
  if (!registry.ok) throw new Error(`Registry failed: ${JSON.stringify(registry.errors)}`)
  const graph = DependencyGraph.build(registry.registry)
  if (!graph.ok) throw new Error(`Graph failed: ${JSON.stringify(graph.errors)}`)
  return new EvaluationSession(registry.registry, graph.graph, actorState(values), {})
}

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

const SKILLS = [
  'acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleight_of_hand', 'stealth', 'survival'
]

// ---------------------------------------------------------------------------
// 1. It loads and is structurally sound
// ---------------------------------------------------------------------------

describe('the package loads and is structurally sound', () => {
  it('every formula in the package parses', () => {
    // hydrateExpressions throws on a parse failure, so reaching this line at
    // all is the assertion. Stated explicitly so the intent is not lost.
    expect(() => loadPackage()).not.toThrow()
  })

  it('validates with zero errors and zero warnings', () => {
    const { manifest, definitions } = loadPackage()
    const result = validatePackage(manifest, definitions)

    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('builds a registry indexing every definition', () => {
    const { manifest, definitions } = loadPackage()
    const result = RulesRegistry.create(manifest, definitions)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.registry.listAll()).toHaveLength(definitions.length)
  })

  it('builds a dependency graph', () => {
    const { manifest, definitions } = loadPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    expect(registry.ok).toBe(true)
    if (!registry.ok) return

    const graph = DependencyGraph.build(registry.registry)
    expect(graph.ok).toBe(true)
    if (!graph.ok) return

    // A derived value's edges come from its formula -- the skill bonus
    // depends on both the ability modifier and the proficiency bonus.
    expect(graph.graph.getDependencies('value:skill.athletics.bonus')).toEqual(
      expect.arrayContaining(['value:ability.str.mod', 'value:proficiency_bonus'])
    )
  })

  it('canonicalizes deterministically -- the integrity-hash prerequisite', () => {
    const { definitions } = loadPackage()
    expect(canonicalize(definitions)).toBe(canonicalize(definitions))
    expect(JSON.parse(canonicalize(definitions))).toHaveLength(definitions.length)
  })

  it('binds its semantic roles to definitions that exist', () => {
    const { manifest, definitions } = loadPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    expect(registry.ok).toBe(true)
    if (!registry.ok) return

    expect(registry.registry.getBySemanticRole('level')?.id).toBe('value:level')
    expect(registry.registry.getBySemanticRole('proficiency')?.id).toBe('value:proficiency_bonus')
    expect(registry.registry.getBySemanticRole('vitality')?.id).toBe('value:hit_points.current')
  })
})

// ---------------------------------------------------------------------------
// 2. It evaluates -- the proof it is mechanically real
// ---------------------------------------------------------------------------

describe('the package evaluates with an EMPTY actor state', () => {
  // "Publishable and evaluable with zero content bound" -- and, it turns out,
  // with zero actor state too: a stored Value falls back to its declared
  // default, so a blank character still produces coherent numbers rather
  // than errors.
  it('every ability defaults to 10, giving a +0 modifier', () => {
    const session = sessionFor()
    for (const ability of ABILITIES) {
      expect(evaluate(`value:ability.${ability}`, session)).toBe(10)
      expect(evaluate(`value:ability.${ability}.mod`, session)).toBe(0)
    }
  })

  it('level defaults to 1, giving a proficiency bonus of +2', () => {
    const session = sessionFor()
    expect(evaluate('value:level', session)).toBe(1)
    expect(evaluate('value:proficiency_bonus', session)).toBe(2)
  })

  it('no save or skill is proficient, so every bonus is +0', () => {
    const session = sessionFor()
    for (const ability of ABILITIES) {
      expect(evaluate(`value:save.${ability}.proficient`, session)).toBe(false)
      expect(evaluate(`value:save.${ability}.bonus`, session)).toBe(0)
    }
    for (const skill of SKILLS) {
      expect(evaluate(`value:skill.${skill}.bonus`, session)).toBe(0)
    }
  })

  it('the point buy budget is 27', () => {
    expect(evaluate('value:ability.point_buy_budget', sessionFor())).toBe(27)
  })
})

describe('the ability modifier formula', () => {
  it.each([
    [1, -5], [3, -4], [8, -1], [9, -1], [10, 0], [11, 0], [12, 1], [15, 2], [18, 4], [20, 5], [30, 10]
  ])('a score of %i yields a modifier of %i', (score, expected) => {
    expect(evaluate('value:ability.str.mod', sessionFor({ 'value:ability.str': score }))).toBe(expected)
  })
})

describe('the proficiency bonus progression', () => {
  // The whole 1-20 track, checked against the printed progression. This is
  // the test that makes the closed-form formula reviewable: if the formula
  // is wrong at any level, exactly one of these rows fails.
  it.each([
    [1, 2], [2, 2], [3, 2], [4, 2],
    [5, 3], [6, 3], [7, 3], [8, 3],
    [9, 4], [10, 4], [11, 4], [12, 4],
    [13, 5], [14, 5], [15, 5], [16, 5],
    [17, 6], [18, 6], [19, 6], [20, 6]
  ])('level %i yields a proficiency bonus of +%i', (level, expected) => {
    expect(evaluate('value:proficiency_bonus', sessionFor({ 'value:level': level }))).toBe(expected)
  })
})

describe('proficiency is what adds the bonus -- the law the package exists to state', () => {
  it('a proficient save adds the proficiency bonus; a non-proficient one does not', () => {
    const session = sessionFor({
      'value:ability.str': 18,
      'value:ability.dex': 18,
      'value:level': 9,
      'value:save.str.proficient': true
    })

    // STR 18 -> +4. Level 9 -> PB +4.
    expect(evaluate('value:proficiency_bonus', session)).toBe(4)
    expect(evaluate('value:save.str.bonus', session)).toBe(8)
    // Identical ability score, no proficiency -- the modifier alone.
    expect(evaluate('value:save.dex.bonus', session)).toBe(4)
  })

  it('applies identically to skills, using each skill\'s own ability', () => {
    const session = sessionFor({
      'value:ability.str': 16,
      'value:ability.cha': 8,
      'value:level': 5,
      'value:skill.athletics.proficient': true,
      'value:skill.persuasion.proficient': true
    })

    // Athletics uses STR (+3), Persuasion uses CHA (-1); PB at level 5 is +3.
    expect(evaluate('value:skill.athletics.bonus', session)).toBe(6)
    expect(evaluate('value:skill.persuasion.bonus', session)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 3. It respects its own boundaries
// ---------------------------------------------------------------------------

describe('the Rules / Content boundary', () => {
  it('names no species, class, background, spell, item, or monster', () => {
    // The commitment that makes this a Rules Package: it declares the slots,
    // never the things that fill them. If any of these ever appears, the
    // package has started absorbing a Content Pack's job.
    const serialized = JSON.stringify(loadPackage().definitions).toLowerCase()

    for (const forbidden of [
      'fighter', 'wizard', 'rogue', 'cleric', 'barbarian', 'paladin',
      'elf', 'dwarf', 'human', 'halfling', 'orc', 'tiefling', 'dragonborn',
      'fireball', 'longsword', 'goblin', 'acolyte', 'soldier'
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('references no content, no world traits, and no optional rules', () => {
    // Every formula reads only `@value:` -- so the package evaluates with no
    // Content Pack bound AND no world configuration answered.
    const { manifest, definitions } = loadPackage()
    const serialized = JSON.stringify(definitions)

    expect(serialized).not.toContain('@world:')
    expect(serialized).not.toContain('@content:')
    expect(manifest.requiredTraits).toBeUndefined()
    expect(manifest.optionalRules).toBeUndefined()
  })

  it('declares no dependencies and no capabilities', () => {
    const { manifest } = loadPackage()
    expect(manifest.dependencies).toEqual([])
    expect(manifest.capabilities).toEqual([])
  })
})

describe('the package is prose-free', () => {
  it('no definition carries a description', () => {
    // The licensing commitment (rules-package-architecture.md §18.1,
    // Decision 1): mechanically complete, zero prose. `description` is the
    // field prose would live in, and no definition has one.
    for (const definition of loadPackage().definitions) {
      expect(definition).not.toHaveProperty('description')
    }
  })

  it('carries only short identifying labels, never sentences', () => {
    // A label names a thing ("Strength Save"); it never explains one. The
    // length bound is what keeps that true as the package grows.
    for (const definition of loadPackage().definitions) {
      const label = (definition as { label?: string }).label
      if (label === undefined) continue
      expect(label.length).toBeLessThanOrEqual(40)
      expect(label).not.toContain('.')
    }
  })
})

describe('internal consistency', () => {
  it('every definition declares a category, and every category is in the closed registry', () => {
    for (const definition of loadPackage().definitions) {
      expect(definition.category).toBeDefined()
      expect(RULE_CATEGORIES).toContain(definition.category as RuleCategory)
    }
  })

  it('the manifest\'s declared coverage matches the categories actually populated', () => {
    const { manifest, definitions } = loadPackage()
    const populated = new Set(definitions.map((definition) => definition.category))

    expect([...populated].sort()).toEqual([...(manifest.categories ?? [])].sort())
  })

  it('declares all six abilities, all six saves, and all eighteen skills', () => {
    const ids = new Set(loadPackage().definitions.map((definition) => definition.id))

    for (const ability of ABILITIES) {
      expect(ids.has(`value:ability.${ability}`)).toBe(true)
      expect(ids.has(`value:ability.${ability}.mod`)).toBe(true)
      expect(ids.has(`value:save.${ability}.proficient`)).toBe(true)
      expect(ids.has(`value:save.${ability}.bonus`)).toBe(true)
    }
    expect(SKILLS).toHaveLength(18)
    for (const skill of SKILLS) {
      expect(ids.has(`value:skill.${skill}.proficient`)).toBe(true)
      expect(ids.has(`value:skill.${skill}.bonus`)).toBe(true)
    }
  })

  it('each skill\'s declared ability tag matches the ability its formula actually reads', () => {
    // The skill -> ability mapping is expressed twice: mechanically in the
    // formula, and declaratively as an `ability:<key>` tag a consumer can
    // group by without parsing formulas. Two expressions of one fact drift
    // unless something checks them against each other. This is that check.
    for (const definition of loadPackage().definitions) {
      if (!definition.id.startsWith('value:skill.') || !definition.id.endsWith('.bonus')) continue

      const tags = (definition as { tags?: string[] }).tags ?? []
      const tagged = tags.find((tag) => tag.startsWith('ability:'))?.slice('ability:'.length)
      const formula = (definition as { formula?: { text: string } }).formula?.text ?? ''

      expect(tagged).toBeDefined()
      expect(formula).toContain(`@value:ability.${tagged}.mod`)
    }
  })
})
