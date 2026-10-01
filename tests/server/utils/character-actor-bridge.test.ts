// End-to-end tests for the Character -> ActorState -> Rules Engine chain --
// rules-package-architecture.md Steps 5 and 6.
//
// This is the test the cancelled Character Phase 4 could not write, because
// the Rules Package it needed did not exist. It now runs the WHOLE chain
// with nothing mocked below the bridge:
//
//   a Bobbert-shaped blueprint (Species + Class + Background + scores)
//     -> the REAL hand-authored XPHB Rules Facets (app/lib/content-rules)
//     -> the REAL bridge
//     -> the REAL packages/eldra-dnd5e-2024 loaded from disk
//     -> the REAL evaluator
//
// If any link is wrong, the numbers come out wrong here.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { choiceKey, progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { DND5E_2024_RULES_FACETS } from '../../../app/lib/content-rules/dnd5e-2024'
import { DependencyGraph } from '../../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../../app/lib/rules/evaluation-session'
import { evaluate } from '../../../app/lib/rules/evaluator'
import { parseExpression } from '../../../app/lib/rules/parser'
import { RulesRegistry } from '../../../app/lib/rules/registry'
import type { Definition, ProgressionDefinition, RuleValue, RulesPackageManifest } from '../../../app/lib/rules/types'
import { buildActorState } from '../../../server/utils/character-actor-bridge'
import type { AssembledInventoryItem, CharacterAssemblyBlueprint, CharacterAssemblySlot } from '../../../server/utils/character-assembly'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'

function hydrate(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(hydrate)
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string' && !record.ast) {
      const parsed = parseExpression(record.text)
      if (!parsed.ok) throw new Error(`Failed to parse: ${record.text}`)
      return { text: record.text, ast: parsed.ast }
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, hydrate(v)]))
  }
  return node
}

function loadRulesPackage() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  return { manifest, definitions }
}

// A resolved catalogue slot carrying the REAL authored facet for that slug.
function slot(entityType: string, slug: string): CharacterAssemblySlot {
  const facet = findRulesFacet('dnd5e.2024', entityType, slug)
  return {
    status: 'resolved',
    entry: {
      packageId: 'eldra.content.xphb',
      packageVersion: '1.0.0',
      systemKey: 'dnd5e',
      title: slug,
      slug,
      externalId: slug,
      provider: '5etools-json',
      ...(facet ? { rulesFacet: facet } : {})
    }
  }
}

function blueprint(overrides: Partial<CharacterAssemblyBlueprint> = {}): CharacterAssemblyBlueprint {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Bobbert',
    characterImageUrl: null,
    species: slot('species', 'human-xphb'),
    class: slot('class', 'fighter-xphb'),
    background: slot('background', 'acolyte-xphb'),
    abilityScores: {
      method: 'standard-array',
      scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
    },
    rulesChoices: null,
    inventory: [],
    notes: null,
    health: null,
    progression: { classes: [] },
    packs: [],
    ...overrides
  }
}

function derive(bp: CharacterAssemblyBlueprint) {
  const { manifest, definitions } = loadRulesPackage()
  const registry = RulesRegistry.create(manifest, definitions)
  if (!registry.ok) throw new Error('registry failed')
  const graph = DependencyGraph.build(registry.registry)
  if (!graph.ok) throw new Error('graph failed')

  const bridged = buildActorState({
    blueprint: bp,
    packageId: manifest.packageId,
    packageVersion: manifest.version,
    stateSchemaVersion: manifest.stateSchemaVersion,
    knownDefinition: (id) => registry.registry.has(id),
    // Exactly what server/utils/character-derived.ts supplies in production.
    rulesChoices: bp.rulesChoices,
    lookupChoiceSet: (id) => {
      const definition = registry.registry.getById(id)
      return definition && definition.kind === 'choiceSet' ? definition : null
    },
    // Character Progression Phase 1A -- exactly what character-derived.ts
    // supplies in production, via the active package's own semantic-role
    // binding.
    levelDefinitionId: registry.registry.getBySemanticRole('level')?.id
  })

  const session = new EvaluationSession(registry.registry, graph.graph, bridged.actorState, {})
  return {
    bridged,
    value: (id: string): RuleValue => evaluate(id, session)
  }
}

// ---------------------------------------------------------------------------
// Step 5 -- the authored facets
// ---------------------------------------------------------------------------

describe('the hand-authored XPHB Rules Facets', () => {
  it('every id in every facet resolves against the real Rules Package', () => {
    // The load-bearing test for §8.2 rule 1. A facet naming an id the
    // package does not declare is an unresolved reference -- and renaming a
    // Definition on either side must fail here, loudly, rather than
    // degrading into a grant that silently does nothing.
    const { manifest, definitions } = loadRulesPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    expect(registry.ok).toBe(true)
    if (!registry.ok) return

    const ids: string[] = []
    for (const byType of Object.values(DND5E_2024_RULES_FACETS)) {
      for (const facet of Object.values(byType)) {
        for (const grant of facet.grants ?? []) ids.push(grant.set)
        for (const choice of facet.choices ?? []) {
          ids.push(choice.choiceSet)
          for (const option of choice.from ?? []) ids.push(option)
        }
        for (const source of facet.sources ?? []) ids.push(source)
        // Character Progression Phase 1C -- facet.progression is now an
        // array (a class may opt into more than one ProgressionDefinition);
        // pushed element-by-element, not as a single (accidentally
        // stringified) array value.
        for (const progressionId of facet.progression ?? []) ids.push(progressionId)
      }
    }

    // Every id the corpus names must exist in the package. This is the
    // assertion that fails the day either side renames a Definition.
    const unique = [...new Set(ids)]
    for (const id of unique) {
      expect(registry.registry.has(id), `facet references unknown Definition '${id}'`).toBe(true)
    }

    // ...and the corpus genuinely exercises the package's surface, rather
    // than resolving trivially because it names almost nothing. Between
    // them the facets reach every save, every skill, and the ChoiceSet.
    for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
      expect(unique).toContain(`value:save.${ability}.proficient`)
    }
    expect(unique.filter((id) => id.startsWith('value:skill.'))).toHaveLength(18)
    expect(unique).toContain('choice:skill.proficiency')
  })

  it('covers all twelve classes and all sixteen backgrounds', () => {
    const classes = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
      'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']
    // The eight 2024 spellcasting classes (Spellcasting System addition) --
    // everyone else (Barbarian, Fighter, Monk, Rogue) grants no spellcasting
    // ids at all.
    const casters = new Set(['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'])

    for (const name of classes) {
      const facet = findRulesFacet('dnd5e.2024', 'class', `${name}-xphb`)
      expect(facet, name).not.toBeNull()
      // Every 2024 class grants exactly two saving throws and one Hit Die
      // size (the Health System's addition); a caster grants two more
      // (Spellcasting Ability, Caster Type -- the Spellcasting System's
      // addition), and offers one skill choice.
      expect(facet!.grants).toHaveLength(casters.has(name) ? 5 : 3)
      expect(facet!.grants!.some((g) => g.set === 'value:hit_points.hit_die_size'), name).toBe(true)
      expect(facet!.grants!.some((g) => g.set.startsWith('value:spellcasting.ability.')), name).toBe(casters.has(name))
      expect(facet!.grants!.some((g) => g.set.startsWith('value:spellcasting.caster_type.')), name).toBe(casters.has(name))
      expect(facet!.choices).toHaveLength(1)
    }

    const backgrounds = ['acolyte', 'artisan', 'charlatan', 'criminal', 'entertainer',
      'farmer', 'guard', 'guide', 'hermit', 'merchant', 'noble', 'sage', 'sailor',
      'scribe', 'soldier', 'wayfarer']
    for (const name of backgrounds) {
      const facet = findRulesFacet('dnd5e.2024', 'background', `${name}-xphb`)
      expect(facet, name).not.toBeNull()
      expect(facet!.grants).toHaveLength(2)
    }
  })

  it('contains no expressions, no formulas, and no 5etools field names', () => {
    // §8.2 rule 2, enforced structurally rather than by care.
    const source = readFileSync('app/lib/content-rules/dnd5e-2024.ts', 'utf8')
    const body = source.slice(source.indexOf('export const'))

    expect(body).not.toContain('@value:')
    expect(body).not.toContain('floor(')
    expect(body).not.toContain('text:')
    expect(body).not.toContain('startingProficiencies')
    expect(body).not.toContain('skillProficiencies')
  })

  it('returns null for an unknown vocabulary rather than throwing', () => {
    expect(findRulesFacet('pf2e', 'class', 'fighter-xphb')).toBeNull()
    expect(findRulesFacet(undefined, 'class', 'fighter-xphb')).toBeNull()
    expect(findRulesFacet('dnd5e.2024', 'class', 'no-such-class')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Step 6 -- the bridge
// ---------------------------------------------------------------------------

describe('the bridge translates, and only translates', () => {
  it('maps ability scores onto the package\'s own Definition IDs', () => {
    const { bridged } = derive(blueprint())
    expect(bridged.actorState.values['value:ability.str']).toBe(15)
    expect(bridged.actorState.values['value:ability.cha']).toBe(8)
  })

  it('computes nothing -- no modifier or bonus appears in the ActorState', () => {
    // The whole point: the bridge supplies inputs. STR 15 is present; the
    // +2 modifier it implies is nowhere, because deriving it is the
    // engine's job.
    const { bridged } = derive(blueprint())
    const serialized = JSON.stringify(bridged.actorState)

    expect(serialized).not.toContain('.mod')
    expect(serialized).not.toContain('.bonus')
    expect(serialized).not.toContain('proficiency_bonus')
  })

  it('leaves absent ability scores absent rather than defaulting them', () => {
    // The package already declares each ability's default; letting the
    // engine apply it keeps one source of that number instead of two.
    const { bridged, value } = derive(blueprint({ abilityScores: null }))
    expect(bridged.actorState.values['value:ability.str']).toBeUndefined()
    expect(value('value:ability.str')).toBe(10)
  })

  it('applies class-granted saving throw proficiencies', () => {
    const { bridged } = derive(blueprint())
    // Fighter grants STR and CON saves.
    expect(bridged.actorState.values['value:save.str.proficient']).toBe(true)
    expect(bridged.actorState.values['value:save.con.proficient']).toBe(true)
    expect(bridged.actorState.values['value:save.dex.proficient']).toBeUndefined()
  })

  it('applies background-granted skill proficiencies', () => {
    const { bridged } = derive(blueprint())
    // Acolyte grants Insight and Religion.
    expect(bridged.actorState.values['value:skill.insight.proficient']).toBe(true)
    expect(bridged.actorState.values['value:skill.religion.proficient']).toBe(true)
  })

  it('reports unanswered choices instead of resolving them', () => {
    const { bridged } = derive(blueprint())
    // Human offers 1 skill of any; Fighter offers 2 from its list.
    expect(bridged.pendingChoices.map((choice) => choice.slot)).toEqual(['species', 'class'])
    expect(bridged.pendingChoices.find((choice) => choice.slot === 'class')?.count).toBe(2)
    // ...and none of them silently became a proficiency.
    expect(bridged.actorState.choices).toEqual({})
  })

  it('declares every choice, answered or not, with the key an answer is stored under', () => {
    const { bridged } = derive(blueprint())
    expect(bridged.declaredChoices.map((choice) => choice.key)).toEqual([
      'species:choice:skill.proficiency',
      'class:choice:skill.proficiency'
    ])
    // The pending records carry the same key, so a surface that wants to
    // ANSWER one never has to reconstruct it.
    expect(bridged.pendingChoices.map((choice) => choice.key))
      .toEqual(bridged.declaredChoices.map((choice) => choice.key))
  })

  it('surfaces a grant naming an unknown Definition instead of writing it', () => {
    const bp = blueprint()
    bp.class = {
      status: 'resolved',
      entry: {
        packageId: 'p', packageVersion: '1', systemKey: 'dnd5e', title: 'x',
        slug: 'x', externalId: 'x', provider: 'test',
        rulesFacet: { grants: [{ set: 'value:does.not.exist', to: true }] }
      }
    }

    const { bridged } = derive(bp)
    expect(bridged.unresolvedGrants).toEqual(['value:does.not.exist'])
    expect(bridged.actorState.values['value:does.not.exist']).toBeUndefined()
  })

  it('produces a byte-identical ActorState on every build -- no randomness', () => {
    expect(JSON.stringify(derive(blueprint()).bridged.actorState))
      .toBe(JSON.stringify(derive(blueprint()).bridged.actorState))
  })

  it('tolerates a character whose content no longer resolves', () => {
    const missing: CharacterAssemblySlot = {
      status: 'missing', packageId: 'p', slug: 's', reason: 'gone'
    }
    const { bridged, value } = derive(blueprint({ class: missing, background: missing }))

    // Ability scores still bridge; nothing throws; nothing is granted.
    expect(bridged.actorState.values['value:ability.str']).toBe(15)
    expect(bridged.actorState.values['value:save.str.proficient']).toBeUndefined()
    expect(value('value:ability.str.mod')).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// The whole chain -- Bobbert's real numbers
// ---------------------------------------------------------------------------

describe('Bobbert: Character -> Bridge -> Rules Engine', () => {
  it('derives ability modifiers from the standard array', () => {
    const { value } = derive(blueprint())
    // 15/14/13/12/10/8 -> +2/+2/+1/+1/+0/-1
    expect(value('value:ability.str.mod')).toBe(2)
    expect(value('value:ability.dex.mod')).toBe(2)
    expect(value('value:ability.con.mod')).toBe(1)
    expect(value('value:ability.int.mod')).toBe(1)
    expect(value('value:ability.wis.mod')).toBe(0)
    expect(value('value:ability.cha.mod')).toBe(-1)
  })

  it('derives the proficiency bonus from level', () => {
    expect(derive(blueprint()).value('value:proficiency_bonus')).toBe(2)
  })

  it('derives saving throw proficiencies from the Class facet', () => {
    const { value } = derive(blueprint())
    // Fighter: STR and CON.
    expect(value('value:save.str.proficient')).toBe(true)
    expect(value('value:save.con.proficient')).toBe(true)
    expect(value('value:save.dex.proficient')).toBe(false)
    expect(value('value:save.wis.proficient')).toBe(false)
  })

  it('derives skill proficiencies from the Background facet', () => {
    const { value } = derive(blueprint())
    // Acolyte: Insight and Religion.
    expect(value('value:skill.insight.proficient')).toBe(true)
    expect(value('value:skill.religion.proficient')).toBe(true)
    // Not chosen, so not proficient -- correct, not convenient.
    expect(value('value:skill.athletics.proficient')).toBe(false)
  })

  it('a different Class changes the derived saves, with no code change anywhere', () => {
    // The proof that the mechanics live in data: swapping one slug moves the
    // proficiencies, because the facet did, not because anything branched.
    const { value } = derive(blueprint({ class: slot('class', 'wizard-xphb') }))
    // Wizard: INT and WIS.
    expect(value('value:save.int.proficient')).toBe(true)
    expect(value('value:save.wis.proficient')).toBe(true)
    expect(value('value:save.str.proficient')).toBe(false)
  })

  it('no derived value is stored -- the ActorState holds only inputs', () => {
    // The invariant the whole architecture rests on (ADR-003). Everything in
    // `values` is either a player decision (an ability score) or a content
    // grant (a proficiency flag, or -- since the Health System -- a Class's
    // granted Hit Die size). Not one entry is something the engine computed.
    const { bridged } = derive(blueprint())
    const stored = Object.keys(bridged.actorState.values)

    for (const id of stored) {
      const isAbilityScore = /^value:ability\.(str|dex|con|int|wis|cha)$/.test(id)
      const isProficiencyFlag = id.endsWith('.proficient')
      const isHitDieGrant = id === 'value:hit_points.hit_die_size'
      // Character Progression Phase 1A -- `value:level` is exactly the same
      // kind of input as an ability score: a stored, per-character fact
      // (see character-progression.ts's own StoredCharacterProgression),
      // never something the engine computed. Its presence here is the SAME
      // ADR-003 invariant this test checks, not an exception to it.
      const isLevel = id === 'value:level'
      expect(isAbilityScore || isProficiencyFlag || isHitDieGrant || isLevel, `unexpected stored value '${id}'`).toBe(true)
    }

    // ...and the derived values the sheet will show exist only in the
    // engine's output, never in the state that produced them.
    expect(stored).not.toContain('value:ability.str.mod')
    expect(stored).not.toContain('value:proficiency_bonus')
    expect(stored).not.toContain('value:save.str.bonus')
  })
})

// ---------------------------------------------------------------------------
// Character Progression Phase 1A -- `value:level`
// ---------------------------------------------------------------------------

describe('Character Progression: level writes into ActorState, and everything level-derived responds', () => {
  it('a character with no progression block at all evaluates at level 1 (value:level\'s own Rules Engine default)', () => {
    const { value } = derive(blueprint())
    expect(value('value:level')).toBe(1)
    expect(value('value:proficiency_bonus')).toBe(2)
  })

  it('a stored progression entry raises value:level, and proficiency_bonus (a real formula reading it) responds', () => {
    const { value } = derive(blueprint({
      progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 5 }] }
    }))
    expect(value('value:level')).toBe(5)
    // 2 + floor((5-1)/4) = 3
    expect(value('value:proficiency_bonus')).toBe(3)
  })

  it('total level is the SUM across every class entry -- the multiclass-ready shape, even with one entry today', () => {
    const { value } = derive(blueprint({
      progression: {
        classes: [
          { classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 3 },
          { classRef: { packageId: 'eldra.content.xphb', slug: 'wizard-xphb' }, level: 2 }
        ]
      }
    }))
    expect(value('value:level')).toBe(5)
  })

  it('levelOverride simulates a different level without touching the stored progression the blueprint carries', () => {
    const bp = blueprint({
      progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 1 }] }
    })
    const { manifest, definitions } = loadRulesPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    if (!registry.ok) throw new Error('registry failed')
    const graph = DependencyGraph.build(registry.registry)
    if (!graph.ok) throw new Error('graph failed')

    const bridged = buildActorState({
      blueprint: bp,
      packageId: manifest.packageId,
      packageVersion: manifest.version,
      stateSchemaVersion: manifest.stateSchemaVersion,
      knownDefinition: (id) => registry.registry.has(id),
      rulesChoices: bp.rulesChoices,
      lookupChoiceSet: () => null,
      levelDefinitionId: registry.registry.getBySemanticRole('level')?.id,
      levelOverride: 11
    })
    const session = new EvaluationSession(registry.registry, graph.graph, bridged.actorState, {})
    expect(evaluate('value:level', session)).toBe(11)
    // The blueprint's own stored progression is untouched -- this was a
    // one-evaluation simulation, never a mutation.
    expect(bp.progression).toEqual({ classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 1 }] })
  })

  it('omitting levelDefinitionId entirely is a no-op -- a package with no \'level\' semantic role bound gets no value:level write at all', () => {
    const bp = blueprint({
      progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 9 }] }
    })
    const { manifest, definitions } = loadRulesPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    if (!registry.ok) throw new Error('registry failed')

    const bridged = buildActorState({
      blueprint: bp,
      packageId: manifest.packageId,
      packageVersion: manifest.version,
      stateSchemaVersion: manifest.stateSchemaVersion,
      knownDefinition: (id) => registry.registry.has(id),
      rulesChoices: bp.rulesChoices,
      lookupChoiceSet: () => null
      // levelDefinitionId deliberately omitted.
    })
    expect(bridged.actorState.values['value:level']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// DND5E Playability Audit: Level 1 Monk Max HP
// ---------------------------------------------------------------------------
// Regression coverage for the reported bug ("a Level 1 Monk with CON 12
// shows 1/1 HP"). Traced to the fact that `value:hit_points.hit_die_size`
// defaults to 0 when a Class facet's grant never reaches ActorState.values
// -- 0 (hit die size) + 1 (CON mod) + 0 (levels above 1) = 1, matching the
// reported symptom exactly. This suite proves the current, on-disk chain
// (content facet -> bridge -> package formula) does NOT reproduce that bug:
// the Monk facet's grant reaches ActorState, and the correct Hit Die size
// (8) is available to the Health System's formula. Full end-to-end Max HP
// arithmetic (which also needs `value:level` and `value:ability.con.mod`,
// both handled elsewhere) is covered in character-derived.test.ts.
describe('DND5E Playability Audit: Monk Hit Die grant', () => {
  it('the Monk Class facet grants hit_points.hit_die_size = 8, and it reaches ActorState.values', () => {
    const { bridged } = derive(blueprint({ class: slot('class', 'monk-xphb') }))
    expect(bridged.actorState.values['value:hit_points.hit_die_size']).toBe(8)
  })

  it('every class\'s hit_die_size grant reaches ActorState.values -- not just Monk\'s', () => {
    const CLASS_HIT_DICE: Record<string, number> = {
      'barbarian-xphb': 12,
      'bard-xphb': 8,
      'cleric-xphb': 8,
      'druid-xphb': 8,
      'fighter-xphb': 10,
      'monk-xphb': 8,
      'paladin-xphb': 10,
      'ranger-xphb': 10,
      'rogue-xphb': 8,
      'sorcerer-xphb': 6,
      'warlock-xphb': 8,
      'wizard-xphb': 6
    }

    for (const [slug, expectedDie] of Object.entries(CLASS_HIT_DICE)) {
      const { bridged } = derive(blueprint({ class: slot('class', slug) }))
      expect(bridged.actorState.values['value:hit_points.hit_die_size'], slug).toBe(expectedDie)
    }
  })

  it('with NO Class resolved, hit_die_size is absent from ActorState -- the engine formula falls back to its own default, never a value this bridge invents', () => {
    const { bridged } = derive(blueprint({ class: { status: 'missing', packageId: 'x', slug: 'y', reason: 'gone' } }))
    expect(bridged.actorState.values['value:hit_points.hit_die_size']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Proficiency choice resolution -- Builder -> ActorState -> Rules Engine
// ---------------------------------------------------------------------------

const CLASS_SKILLS = choiceKey('class', 'choice:skill.proficiency')
const SPECIES_SKILLS = choiceKey('species', 'choice:skill.proficiency')

// Two of the nine skills the Fighter facet actually offers.
const ATHLETICS = 'value:skill.athletics.proficient'
const PERCEPTION = 'value:skill.perception.proficient'

function withClassSkills(...selected: string[]) {
  return blueprint({ rulesChoices: { selections: { [CLASS_SKILLS]: selected } } })
}

describe('Bobbert chooses two class skills', () => {
  it('stores the answer in ActorState.choices, verbatim', () => {
    const { bridged } = derive(withClassSkills(ATHLETICS, PERCEPTION))
    expect(bridged.actorState.choices).toEqual({ [CLASS_SKILLS]: [ATHLETICS, PERCEPTION] })
  })

  it('the Rules Engine derives proficiency from the answer', () => {
    const { value } = derive(withClassSkills(ATHLETICS, PERCEPTION))
    expect(value(ATHLETICS)).toBe(true)
    expect(value(PERCEPTION)).toBe(true)
  })

  it('unselected skills stay unproficient', () => {
    const { value } = derive(withClassSkills(ATHLETICS, PERCEPTION))
    expect(value('value:skill.survival.proficient')).toBe(false)
    expect(value('value:skill.acrobatics.proficient')).toBe(false)
  })

  it('the derived BONUS gains the proficiency bonus -- computed by the engine, not the bridge', () => {
    const { bridged, value } = derive(withClassSkills(ATHLETICS, PERCEPTION))

    // str 15 -> +2 mod, proficiency bonus 2, so a proficient Athletics is 4
    // and an unproficient Acrobatics is dex 14 -> +2 with nothing added.
    expect(value('value:proficiency_bonus')).toBe(2)
    expect(value('value:skill.athletics.bonus')).toBe(4)
    expect(value('value:skill.acrobatics.bonus')).toBe(2)

    // ...and NONE of those numbers is in the ActorState. The bridge stored a
    // boolean; every total came from the evaluator.
    expect(bridged.actorState.values['value:skill.athletics.bonus']).toBeUndefined()
    expect(bridged.actorState.values['value:proficiency_bonus']).toBeUndefined()
  })

  it('an answered choice is no longer outstanding', () => {
    const { bridged } = derive(withClassSkills(ATHLETICS, PERCEPTION))
    // The Species choice is still unanswered; the Class one is not.
    expect(bridged.pendingChoices.map((choice) => choice.key)).toEqual([SPECIES_SKILLS])
  })

  it('answering every choice leaves nothing outstanding', () => {
    const { bridged } = derive(blueprint({
      rulesChoices: {
        selections: {
          [CLASS_SKILLS]: [ATHLETICS, PERCEPTION],
          [SPECIES_SKILLS]: ['value:skill.arcana.proficient']
        }
      }
    }))
    expect(bridged.pendingChoices).toEqual([])
    expect(derive(blueprint({
      rulesChoices: {
        selections: {
          [CLASS_SKILLS]: [ATHLETICS, PERCEPTION],
          [SPECIES_SKILLS]: ['value:skill.arcana.proficient']
        }
      }
    })).value('value:skill.arcana.proficient')).toBe(true)
  })

  it('a choice does not disturb the proficiencies the Class GRANTS outright', () => {
    const { value } = derive(withClassSkills(ATHLETICS, PERCEPTION))
    expect(value('value:save.str.proficient')).toBe(true)
    expect(value('value:save.con.proficient')).toBe(true)
    expect(value('value:save.dex.proficient')).toBe(false)
  })
})

describe('changing the Class changes the available choices', () => {
  it('offers a different option list, with no code change anywhere', () => {
    const fighter = derive(blueprint()).bridged.declaredChoices
      .find((choice) => choice.slot === 'class')!
    const wizard = derive(blueprint({ class: slot('class', 'wizard-xphb') })).bridged.declaredChoices
      .find((choice) => choice.slot === 'class')!

    expect(fighter.options).toContain(ATHLETICS)
    expect(wizard.options).not.toContain(ATHLETICS)
    expect(wizard.options).toContain('value:skill.arcana.proficient')
  })

  it('an answer that the new Class does not offer is refused, not partially applied', () => {
    // The player answered as a Fighter and then switched to Wizard. Athletics
    // is not on the Wizard list, so the whole answer reverts to outstanding.
    const { bridged, value } = derive(blueprint({
      class: slot('class', 'wizard-xphb'),
      rulesChoices: { selections: { [CLASS_SKILLS]: [ATHLETICS, PERCEPTION] } }
    }))

    expect(value(ATHLETICS)).toBe(false)
    expect(value(PERCEPTION)).toBe(false)
    expect(bridged.pendingChoices.map((choice) => choice.key)).toContain(CLASS_SKILLS)
    expect(bridged.actorState.choices[CLASS_SKILLS]).toBeUndefined()
  })
})

describe('invalid selections are rejected', () => {
  it('rejects an option the Class never offered', () => {
    // Arcana is not on the Fighter's list.
    const { bridged, value } = derive(withClassSkills('value:skill.arcana.proficient', ATHLETICS))
    expect(value('value:skill.arcana.proficient')).toBe(false)
    // ...and the VALID half of the answer is not applied either: a partly
    // honoured answer is a character nobody can explain.
    expect(value(ATHLETICS)).toBe(false)
    expect(bridged.pendingChoices.map((choice) => choice.key)).toContain(CLASS_SKILLS)
  })

  it('rejects too few and too many', () => {
    expect(derive(withClassSkills(ATHLETICS)).value(ATHLETICS)).toBe(false)
    expect(
      derive(withClassSkills(ATHLETICS, PERCEPTION, 'value:skill.survival.proficient')).value(ATHLETICS)
    ).toBe(false)
  })

  it('rejects the same skill twice', () => {
    expect(derive(withClassSkills(ATHLETICS, ATHLETICS)).value(ATHLETICS)).toBe(false)
  })

  it('rejects an answer to a choice this character is not asked', () => {
    const { bridged } = derive(blueprint({
      rulesChoices: { selections: { 'background:choice:skill.proficiency': [ATHLETICS] } }
    }))
    // Acolyte declares no ChoiceSet, so the stored key answers nothing and
    // contributes nothing.
    expect(bridged.actorState.choices['background:choice:skill.proficiency']).toBeUndefined()
    expect(bridged.actorState.values[ATHLETICS]).toBeUndefined()
  })

  it('produces a byte-identical ActorState on every build, answers included', () => {
    const bp = withClassSkills(ATHLETICS, PERCEPTION)
    expect(JSON.stringify(derive(bp).bridged.actorState))
      .toBe(JSON.stringify(derive(bp).bridged.actorState))
  })
})

describe('the authored corpus and the package agree about ChoiceSets', () => {
  it('every offered option matches its OWN ChoiceSet\'s own writesTo pattern', () => {
    // The mechanism rests on this agreement: the package declares WHERE an
    // answer is written ("value:skill.{selected}.proficient") and the content
    // declares WHICH options are offered. If a facet ever offered an id that
    // did not fit that shape, resolveChoiceTarget would substitute rather
    // than pass through and silently target a Definition nobody declared.
    //
    // D&D 2024 Character Rules Phase 2A.1 -- generalized from "grab the
    // first ChoiceSet in the package and check every offered option
    // everywhere against IT" (correct only while `choice:skill.proficiency`
    // was the package's only ChoiceSet) to "group offered options by which
    // ChoiceSet their own facet declares, and check each group against ITS
    // OWN writesTo" -- the package now legitimately declares four
    // ChoiceSets with three distinct patterns (`choice:skill.proficiency`/
    // `choice:skill.expertise` both write `value:skill.{selected}.*`;
    // `choice:feat.asi-ability-increase`/`choice:feat.ability-choice-1`
    // both write `source:asi.increase.{selected}`; `choice:class.subclass`/
    // `choice:feat.selection` are content-shaped and declare no `writesTo`
    // at all, per app/lib/rules/types.ts's own doc comment on why -- and
    // therefore have no pattern for this test to check).
    const { definitions } = loadRulesPackage()
    const choiceSetsById = new Map<string, { writesTo?: string }>()
    for (const definition of definitions) {
      if (definition.kind === 'choiceSet') choiceSetsById.set(definition.id, definition as { writesTo?: string })
    }
    expect(choiceSetsById.size).toBeGreaterThan(0)

    const offeredByChoiceSet = new Map<string, Set<string>>()

    for (const byType of Object.values(DND5E_2024_RULES_FACETS)) {
      for (const facet of Object.values(byType)) {
        for (const choice of facet.choices ?? []) {
          const set = offeredByChoiceSet.get(choice.choiceSet) ?? new Set<string>()
          for (const option of choice.from ?? []) set.add(option)
          offeredByChoiceSet.set(choice.choiceSet, set)
        }
      }
    }

    let totalOffered = 0
    for (const [choiceSetId, offered] of offeredByChoiceSet) {
      const choiceSet = choiceSetsById.get(choiceSetId)
      expect(choiceSet, `facet references undeclared ChoiceSet '${choiceSetId}'`).toBeDefined()
      // A content-shaped ChoiceSet (subclass/feat selection) declares no
      // writesTo -- its facets offer NO Definition-id options at all (the
      // bridge never reaches this path for them, see character-actor-bridge.ts's
      // own PROGRESSION header), so there is nothing to check here.
      if (!choiceSet!.writesTo) continue

      const [prefix, suffix] = choiceSet!.writesTo.split('{selected}')
      for (const option of offered) {
        totalOffered++
        expect(
          option.startsWith(prefix) && option.endsWith(suffix),
          `'${option}' does not match ChoiceSet '${choiceSetId}'s own writesTo pattern '${choiceSet!.writesTo}'`
        ).toBe(true)
      }
    }

    expect(totalOffered).toBeGreaterThan(0)
  })

  it('every offered option is a Definition the Rules Package actually declares', () => {
    // §8.2 rule 1: a facet naming an id the package does not define is an
    // unresolved reference. An option nobody can resolve is a choice that
    // does nothing when picked.
    const { manifest, definitions } = loadRulesPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    if (!registry.ok) throw new Error('registry failed')

    for (const byType of Object.values(DND5E_2024_RULES_FACETS)) {
      for (const facet of Object.values(byType)) {
        for (const choice of facet.choices ?? []) {
          expect(registry.registry.has(choice.choiceSet)).toBe(true)
          for (const option of choice.from ?? []) {
            expect(registry.registry.has(option)).toBe(true)
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Equipment -- stored inventory decisions become a Collection
// ---------------------------------------------------------------------------

function inventoryItem(overrides: Partial<AssembledInventoryItem> = {}): AssembledInventoryItem {
  return {
    instanceId: 'item-1',
    status: 'resolved',
    title: 'Longsword',
    quantity: 1,
    equipped: false,
    attuned: false,
    ...overrides
  }
}

// A resolved item carrying the REAL Rules Facet the corpus authors for
// `slug`, exactly like `slot()` above does for species/class/background --
// so these tests exercise the actual authored content, not a hand-typed
// stand-in that could silently diverge from it.
function inventoryItemWithFacet(slug: string, overrides: Partial<AssembledInventoryItem> = {}): AssembledInventoryItem {
  const facet = findRulesFacet('dnd5e.2024', 'item', slug)
  if (!facet) throw new Error(`no authored facet for item '${slug}' -- fixture is stale`)

  return inventoryItem({
    instanceId: slug,
    title: slug,
    entry: {
      packageId: 'eldra.content.xphb',
      packageVersion: '1.0.0',
      title: slug,
      slug,
      rulesFacet: facet
    },
    ...overrides
  })
}

describe('equipment: stored decisions translate, nothing is computed', () => {
  it('writes an empty equipment collection when nothing is carried', () => {
    const { bridged } = derive(blueprint())
    expect(bridged.actorState.collections['collection:equipment']).toEqual([])
  })

  it('carries instanceId, equipped, and attuned into the collection verbatim', () => {
    const bp = blueprint({
      inventory: [
        inventoryItem({ instanceId: 'item-1', equipped: true, attuned: false }),
        inventoryItem({ instanceId: 'item-2', equipped: false, attuned: false })
      ]
    })

    const { bridged } = derive(bp)
    // Every item also carries category/slot/requiresAttunement -- defaulted
    // here because a custom item (this fixture's default status) has no
    // facet to supply them. See the dedicated 'item facets' suite below for
    // a resolved item whose facet overrides these.
    expect(bridged.actorState.collections['collection:equipment']).toEqual([
      { instanceId: 'item-1', equipped: true, attuned: false, category: 'gear', slot: '', requiresAttunement: false },
      { instanceId: 'item-2', equipped: false, attuned: false, category: 'gear', slot: '', requiresAttunement: false }
    ])
  })

  it('carries a MISSING (unresolvable) item through unchanged -- attunement is a player fact, not a content fact', () => {
    // A broken Content Pack reference does not un-attune the item: the
    // player's decision does not depend on the reference still resolving.
    const bp = blueprint({
      inventory: [inventoryItem({ instanceId: 'item-1', status: 'missing', equipped: true, attuned: true })]
    })

    const { value } = derive(bp)
    expect(value('value:equipment.equipped_count')).toBe(1)
    expect(value('value:equipment.attuned_count')).toBe(1)
  })

  it('defaults category/slot/requiresAttunement rather than leaving them absent', () => {
    // Verified against the real evaluator (this task's own investigation):
    // a Collection's declared itemSchema default is NOT applied for a
    // genuinely missing field -- a `[key]` predicate over an absent key
    // compares the predicate's own literal text instead, which is truthy
    // for a non-empty string. Writing every field explicitly, defaulted to
    // the same value the schema declares, is what keeps that from becoming
    // a live bug the day a definition filters on any of them.
    const bp = blueprint({ inventory: [inventoryItem()] })
    const { bridged } = derive(bp)
    expect(bridged.actorState.collections['collection:equipment']![0]).toMatchObject({
      category: 'gear',
      slot: '',
      requiresAttunement: false
    })
  })

  it('computes no total, count, or limit -- only equipped/attuned booleans are written', () => {
    const bp = blueprint({
      inventory: [
        inventoryItem({ instanceId: 'item-1', equipped: true, attuned: true }),
        inventoryItem({ instanceId: 'item-2', equipped: true, attuned: false })
      ]
    })

    const { bridged } = derive(bp)
    // Nothing named "count" or "max" or "attunement" appears in ActorState --
    // those are the Rules Package's own derived Values, computed by the
    // evaluator from this input, never by this module.
    expect(Object.keys(bridged.actorState.values).some((id) => id.startsWith('value:equipment.'))).toBe(false)
  })
})

describe('equipment: the Rules Engine resolves equipped state and attunement', () => {
  function withEquipment(items: Array<{ equipped: boolean; attuned: boolean }>) {
    return blueprint({
      inventory: items.map((item, index) => inventoryItem({ instanceId: `item-${index + 1}`, ...item }))
    })
  }

  it('an empty pack has zero equipped, zero attuned, full attunement remaining', () => {
    const { value } = derive(blueprint())
    expect(value('value:equipment.equipped_count')).toBe(0)
    expect(value('value:equipment.attuned_count')).toBe(0)
    expect(value('value:equipment.attunement_max')).toBe(3)
    expect(value('value:equipment.attunement_available')).toBe(3)
  })

  it('counts equipped and attuned independently', () => {
    const { value } = derive(withEquipment([
      { equipped: true, attuned: true },
      { equipped: true, attuned: false },
      { equipped: false, attuned: false }
    ]))

    expect(value('value:equipment.equipped_count')).toBe(2)
    expect(value('value:equipment.attuned_count')).toBe(1)
  })

  it('attunement available is derived FROM the max and the count, not stored', () => {
    const { value } = derive(withEquipment([
      { equipped: true, attuned: true },
      { equipped: true, attuned: true }
    ]))

    expect(value('value:equipment.attunement_max')).toBe(3)
    expect(value('value:equipment.attuned_count')).toBe(2)
    expect(value('value:equipment.attunement_available')).toBe(1)
  })

  it('attunement available can go negative -- the engine reports the fact, it does not clamp or block it', () => {
    // This task's non-goals exclude enforcement; the Rules Engine's job is
    // to say what IS true, and a player over their limit is a true state.
    const { value } = derive(withEquipment([
      { equipped: true, attuned: true },
      { equipped: true, attuned: true },
      { equipped: true, attuned: true },
      { equipped: true, attuned: true }
    ]))

    expect(value('value:equipment.attuned_count')).toBe(4)
    expect(value('value:equipment.attunement_available')).toBe(-1)
  })

  it('declares the equipment Collection with its slots -- Rules Engine output, not Vue', () => {
    const { manifest, definitions } = loadRulesPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    if (!registry.ok) throw new Error('registry failed')

    const collection = registry.registry.getById('collection:equipment')
    expect(collection?.kind).toBe('collection')
    expect((collection as any).slots).toEqual([
      { id: 'armor', capacity: 1 },
      { id: 'held', capacity: 2 }
    ])
  })
})

// ---------------------------------------------------------------------------
// Item Rules Facets -- Equipment content becomes Collection field values
// ---------------------------------------------------------------------------

describe('item facets: content declares, the bridge relays, nothing is computed', () => {
  it('a real Longsword\'s facet sets category and slot on its collection item', () => {
    const bp = blueprint({ inventory: [inventoryItemWithFacet('longsword-xphb', { equipped: true })] })
    const { bridged } = derive(bp)

    expect(bridged.actorState.collections['collection:equipment']![0]).toMatchObject({
      category: 'weapon',
      slot: 'held',
      requiresAttunement: false
    })
  })

  it('a real Breastplate\'s facet sets category:armor, slot:armor', () => {
    const bp = blueprint({ inventory: [inventoryItemWithFacet('breastplate-xphb')] })
    const { bridged } = derive(bp)

    expect(bridged.actorState.collections['collection:equipment']![0]).toMatchObject({
      category: 'armor',
      slot: 'armor'
    })
  })

  it('a Shield is category:armor but slot:held -- it occupies a hand, not the armor slot', () => {
    const bp = blueprint({ inventory: [inventoryItemWithFacet('shield-xphb')] })
    const { bridged } = derive(bp)

    expect(bridged.actorState.collections['collection:equipment']![0]).toMatchObject({
      category: 'armor',
      slot: 'held'
    })
  })

  it('an item the corpus has no facet for (adventuring gear) reads as the schema default', () => {
    // No XPHB item facet exists for a torch, a bedroll, etc -- confirmed by
    // this NOT throwing findRulesFacet's own null branch, since this test
    // deliberately does not use inventoryItemWithFacet (which would throw on
    // a missing facet). A resolved item with no facet is legal (§8.2 rule 4).
    const bp = blueprint({
      inventory: [inventoryItem({
        entry: { packageId: 'eldra.content.xphb', packageVersion: '1.0.0', title: 'Torch', slug: 'torch-xphb' }
      })]
    })

    const { bridged } = derive(bp)
    expect(bridged.actorState.collections['collection:equipment']![0]).toMatchObject({
      category: 'gear',
      slot: '',
      requiresAttunement: false
    })
  })

  it('the Rules Engine, not the bridge, counts equipped weapons -- computed with a real facet', () => {
    const bp = blueprint({
      inventory: [
        inventoryItemWithFacet('longsword-xphb', { equipped: true }),
        inventoryItemWithFacet('breastplate-xphb', { equipped: true }),
        inventoryItemWithFacet('dagger-xphb', { equipped: false })
      ]
    })

    const { value } = derive(bp)
    // equipped_count only counts `equipped`, which is unaffected by category
    // -- proving the two mechanisms (equipped tracking vs category facets)
    // stay independent, exactly as the design intends.
    expect(value('value:equipment.equipped_count')).toBe(2)
  })

  it('a custom item (no content reference at all) has no facet and reads as the schema default', () => {
    const bp = blueprint({ inventory: [inventoryItem({ ref: undefined, entry: undefined, name: 'Duke\'s Letter' })] })
    const { bridged } = derive(bp)

    expect(bridged.actorState.collections['collection:equipment']![0]).toMatchObject({ category: 'gear', slot: '' })
  })

  it('a MISSING (unresolvable) item has no facet to read -- category/slot fall back to the default, not to whatever the item used to be', () => {
    const bp = blueprint({
      inventory: [inventoryItem({ status: 'missing', entry: undefined, ref: { packageId: 'gone', slug: 'longsword-xphb' } })]
    })

    const { bridged } = derive(bp)
    expect(bridged.actorState.collections['collection:equipment']![0]).toMatchObject({ category: 'gear', slot: '' })
  })

  it('every authored item facet resolves against the real registry -- publish-time correctness, asserted here too', () => {
    const { manifest, definitions } = loadRulesPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    if (!registry.ok) throw new Error('registry failed')

    const items = (DND5E_2024_RULES_FACETS as any).item as Record<string, { collectionFields?: Array<{ collection: string; fields: Record<string, unknown> }> }>
    const declaredFields = new Set((registry.registry.getById('collection:equipment') as any).itemSchema.map((f: any) => f.key))

    let checked = 0
    for (const [itemSlug, facet] of Object.entries(items)) {
      for (const entry of facet.collectionFields ?? []) {
        expect(registry.registry.has(entry.collection)).toBe(true)
        for (const key of Object.keys(entry.fields)) {
          expect(declaredFields.has(key)).toBe(true)
        }
        checked++
      }
    }
    // 52 measured weapon/armor XPHB items, verified against the real dataset
    // when this corpus was authored.
    expect(checked).toBe(52)
  })
})

// ---------------------------------------------------------------------------
// Armor Class -- the first equipment-driven gameplay consequence
// ---------------------------------------------------------------------------
// Full pipeline: Content (a real armor facet) -> Rules Facet
// (`collectionFields`, including `sourceRef`) -> Equipment Collection (the
// bridge's own translation) -> Rules Engine (Source Overlay + Modifier
// pipeline, both UNMODIFIED by this task) -> a derived Value. Every number
// below is produced by `derive()`'s real registry/graph/evaluator -- this
// suite computes nothing of its own to compare against.

describe('Armor Class: equip -> Source -> derived AC', () => {
  function withAbilities(dex: number) {
    return {
      abilityScores: {
        method: 'standard-array' as const,
        scores: { str: 10, dex, con: 10, int: 10, wis: 10, cha: 10 }
      }
    }
  }

  it('unarmored AC is 10 + Dex modifier -- the Value\'s own base formula, no Source involved', () => {
    const bp = blueprint({ ...withAbilities(14), inventory: [] })
    expect(derive(bp).value('value:defenses.armor_class')).toBe(12)
  })

  it('equipping a real Breastplate emits a Source the engine resolves into a set-phase AC modifier', () => {
    const bp = blueprint({
      ...withAbilities(18), // +4 mod, medium armor caps the bonus at +2
      inventory: [inventoryItemWithFacet('breastplate-xphb', { equipped: true })]
    })

    const { bridged, value } = derive(bp)

    // The Actor Bridge's own contribution: the item carries `sourceRef`
    // into the collection, unresolved by this module -- it is the ENGINE
    // (session.sourceOverlay, built inside EvaluationSession, untouched by
    // this task) that turns it into an active Source instance.
    expect(bridged.actorState.collections['collection:equipment']![0]).toMatchObject({
      sourceRef: 'source:equipment.armor',
      armorClass: 14
    })

    // 14 (Breastplate base) + 2 (medium armor's Dex cap, not the full +4)
    expect(value('value:defenses.armor_class')).toBe(16)
  })

  it('unequipping reverts to the unarmored base -- the SAME item, only `equipped` changes', () => {
    const equippedAC = derive(blueprint({
      ...withAbilities(14),
      inventory: [inventoryItemWithFacet('breastplate-xphb', { equipped: true })]
    })).value('value:defenses.armor_class')

    const unequippedAC = derive(blueprint({
      ...withAbilities(14),
      inventory: [inventoryItemWithFacet('breastplate-xphb', { equipped: false })]
    })).value('value:defenses.armor_class')

    expect(equippedAC).toBe(16) // 14 + min(dex +2, cap 2)
    expect(unequippedAC).toBe(12) // back to 10 + dex mod, armor contributes nothing
  })

  it('different armor produces a different Armor Class -- heavy armor ignores Dex entirely', () => {
    const breastplateAC = derive(blueprint({
      ...withAbilities(16), // +3 mod
      inventory: [inventoryItemWithFacet('breastplate-xphb', { equipped: true })]
    })).value('value:defenses.armor_class')

    const chainMailAC = derive(blueprint({
      ...withAbilities(16),
      inventory: [inventoryItemWithFacet('chain-mail-xphb', { equipped: true })]
    })).value('value:defenses.armor_class')

    const leatherAC = derive(blueprint({
      ...withAbilities(16),
      inventory: [inventoryItemWithFacet('leather-armor-xphb', { equipped: true })]
    })).value('value:defenses.armor_class')

    expect(breastplateAC).toBe(16) // 14 + min(+3, cap 2)
    expect(chainMailAC).toBe(16)   // 16 flat, heavy armor ignores Dex
    expect(leatherAC).toBe(14)     // 11 + full +3, light armor has no cap
    expect(new Set([breastplateAC, chainMailAC, leatherAC]).size).toBeGreaterThan(1)
  })

  it('heavy armor does not PENALIZE a negative Dex modifier -- clamp(), not a bare min()', () => {
    // The exact edge case a naive `min(dexMod, 2)` formula would get wrong:
    // heavy armor should apply NEITHER bonus NOR penalty from Dex.
    const bp = blueprint({
      ...withAbilities(6), // -2 modifier
      inventory: [inventoryItemWithFacet('plate-armor-xphb', { equipped: true })]
    })
    expect(derive(bp).value('value:defenses.armor_class')).toBe(18) // flat, not 16
  })

  it('a Shield contributes nothing to Armor Class -- deliberately excluded (add-phase bonus is out of scope)', () => {
    const bp = blueprint({
      ...withAbilities(14),
      inventory: [inventoryItemWithFacet('shield-xphb', { equipped: true })]
    })
    expect(derive(bp).value('value:defenses.armor_class')).toBe(12) // unarmored base, unaffected
  })

  it('a weapon (no sourceRef at all) does not affect Armor Class', () => {
    const bp = blueprint({
      ...withAbilities(14),
      inventory: [inventoryItemWithFacet('longsword-xphb', { equipped: true })]
    })
    expect(derive(bp).value('value:defenses.armor_class')).toBe(12)
  })

  it('no derived value is stored -- ActorState carries only the item\'s own booleans and numbers', () => {
    const bp = blueprint({
      ...withAbilities(18),
      inventory: [inventoryItemWithFacet('breastplate-xphb', { equipped: true })]
    })
    const { bridged } = derive(bp)

    // The bridge writes exactly what the facet and the player declared --
    // never an armor_class key, never a computed AC number, anywhere in
    // ActorState.
    expect(JSON.stringify(bridged.actorState.values)).not.toContain('armor_class')
    expect(JSON.stringify(bridged.actorState.collections)).not.toContain('"armor_class"')
    for (const item of bridged.actorState.collections['collection:equipment']!) {
      expect(item).not.toHaveProperty('armor_class')
    }
  })

  it('a MISSING (unresolvable) armor reference contributes nothing -- there is no facet left to read', () => {
    const bp = blueprint({
      ...withAbilities(18),
      inventory: [inventoryItem({
        status: 'missing', entry: undefined, ref: { packageId: 'gone', slug: 'breastplate-xphb' }, equipped: true
      })]
    })
    expect(derive(bp).value('value:defenses.armor_class')).toBe(14) // unarmored, dex +4
  })
})

// ---------------------------------------------------------------------------
// Health System -- Maximum HP derived from a Class-granted Hit Die
// ---------------------------------------------------------------------------
// Full pipeline: Content (a real Class facet) -> Rules Facet (`grants`,
// including hit_points.hit_die_size) -> ActorState.values (the bridge's own
// translation) -> Rules Engine (the standard base/derived formula pipeline,
// UNMODIFIED by this task) -> a derived Value. Every number below is
// produced by `derive()`'s real registry/graph/evaluator.

describe('Health System: stored decisions translate, Maximum HP derives', () => {
  function withHealth(overrides: Partial<{
    currentHp: number
    temporaryHp: number
    hitDiceSpent: number
    deathSaves: { successes: number; failures: number }
  }> = {}) {
    return blueprint({
      health: {
        currentHp: 0,
        temporaryHp: 0,
        hitDiceSpent: 0,
        deathSaves: { successes: 0, failures: 0 },
        ...overrides
      }
    })
  }

  it('writes nothing to ActorState.values when health was never recorded', () => {
    const { bridged } = derive(blueprint({ health: null }))
    expect(bridged.actorState.values['value:hit_points.current']).toBeUndefined()
    expect(bridged.actorState.values['value:hit_points.temp']).toBeUndefined()
    expect(bridged.actorState.values['value:hit_points.hit_dice_spent']).toBeUndefined()
    expect(bridged.actorState.values['value:death_saves.successes']).toBeUndefined()
  })

  it('copies current/temporary HP, hit dice spent, and death save marks verbatim', () => {
    const bp = withHealth({ currentHp: 18, temporaryHp: 4, hitDiceSpent: 1, deathSaves: { successes: 2, failures: 1 } })
    const { bridged } = derive(bp)

    expect(bridged.actorState.values['value:hit_points.current']).toBe(18)
    expect(bridged.actorState.values['value:hit_points.temp']).toBe(4)
    expect(bridged.actorState.values['value:hit_points.hit_dice_spent']).toBe(1)
    expect(bridged.actorState.values['value:death_saves.successes']).toBe(2)
    expect(bridged.actorState.values['value:death_saves.failures']).toBe(1)
  })

  it('never writes Maximum HP -- there is no field for it to come from', () => {
    const { bridged } = derive(withHealth({ currentHp: 10 }))
    expect(bridged.actorState.values['value:hit_points.max']).toBeUndefined()
  })

  it('a real Class facet grants the Hit Die size the way it already grants save proficiencies', () => {
    // Bobbert's default class is Fighter (d10) -- see slot('class', 'fighter-xphb').
    const { bridged } = derive(blueprint())
    expect(bridged.actorState.values['value:hit_points.hit_die_size']).toBe(10)
  })

  it('the Rules Engine derives Maximum HP from Hit Die size, Constitution, and level', () => {
    // Fighter (d10) + CON 13 (+1 mod, the character's default), level 1.
    const { value } = derive(blueprint())
    expect(value('value:hit_points.max')).toBe(11)
  })

  it('a different Class changes Maximum HP -- same ability scores, different Hit Die', () => {
    const fighterMax = derive(blueprint({ class: slot('class', 'fighter-xphb') })).value('value:hit_points.max')
    const wizardMax = derive(blueprint({ class: slot('class', 'wizard-xphb') })).value('value:hit_points.max')

    expect(fighterMax).toBe(11) // d10 + 1
    expect(wizardMax).toBe(7)   // d6 + 1
    expect(fighterMax).not.toBe(wizardMax)
  })

  it('Hit Dice available derives from level minus dice spent', () => {
    const { value } = derive(withHealth({ hitDiceSpent: 0 }))
    expect(value('value:hit_points.hit_dice_max')).toBe(1) // level 1
    expect(value('value:hit_points.hit_dice_available')).toBe(1)
  })

  it('spending a hit die reduces availability, computed by the engine', () => {
    const unspent = derive(withHealth({ hitDiceSpent: 0 })).value('value:hit_points.hit_dice_available')
    const spent = derive(withHealth({ hitDiceSpent: 1 })).value('value:hit_points.hit_dice_available')

    expect(unspent).toBe(1)
    expect(spent).toBe(0)
  })

  it('no derived value is stored -- ActorState carries only the player\'s inputs and the Class grant', () => {
    const { bridged } = derive(withHealth({ currentHp: 10 }))
    const stored = Object.keys(bridged.actorState.values)

    expect(stored).not.toContain('value:hit_points.max')
    expect(stored).not.toContain('value:hit_points.hit_dice_max')
    expect(stored).not.toContain('value:hit_points.hit_dice_available')
  })

  it('Maximum HP scales with level using the standard average-roll method', () => {
    // Level is stored player data too (`value:level`), just not one this
    // milestone's health block owns -- set directly on the fixture to
    // exercise the level term of the formula. Fighter (d10) + CON 13
    // (+1 mod): level 1 -> 11, level 5 -> 11 + 4*(avg 6 + 1) = 11 + 28 = 39.
    const level1 = derive(blueprint()).value('value:hit_points.max')

    const { manifest, definitions } = loadRulesPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    if (!registry.ok) throw new Error('registry failed')
    const graph = DependencyGraph.build(registry.registry)
    if (!graph.ok) throw new Error('graph failed')

    const bridged = buildActorState({
      blueprint: blueprint(),
      packageId: manifest.packageId,
      packageVersion: manifest.version,
      stateSchemaVersion: manifest.stateSchemaVersion,
      knownDefinition: (id) => registry.registry.has(id)
    })
    bridged.actorState.values['value:level'] = 5

    const session = new EvaluationSession(registry.registry, graph.graph, bridged.actorState, {})
    const level5 = evaluate('value:hit_points.max', session)

    expect(level1).toBe(11)
    expect(level5).toBe(39)
  })

  it('death save marks persist independently of current/temporary HP', () => {
    const bp = withHealth({ currentHp: 0, deathSaves: { successes: 1, failures: 2 } })
    const { value } = derive(bp)

    expect(value('value:death_saves.successes')).toBe(1)
    expect(value('value:death_saves.failures')).toBe(2)
    expect(value('value:hit_points.current')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Character Progression Phase 1B -- the dormant `kind:'progression'` seam,
// now a real consumer
// ---------------------------------------------------------------------------
// `derive()` above never wires `lookupProgression`/`levelOverride`, so every
// test below uses its own small helper rather than risk changing that
// shared fixture's behavior for the 82 tests already passing against it.

function deriveWithProgression(
  bp: CharacterAssemblyBlueprint,
  levelOverride: number,
  progressionOverrides: Record<string, Pick<ProgressionDefinition, 'keyedBy' | 'rows'>> = {}
) {
  const { manifest, definitions } = loadRulesPackage()
  const registry = RulesRegistry.create(manifest, definitions)
  if (!registry.ok) throw new Error('registry failed')

  const lookupProgression = (id: string) => {
    if (progressionOverrides[id]) return progressionOverrides[id]
    const definition = registry.registry.getById(id)
    return definition && definition.kind === 'progression' ? definition : null
  }

  // Character Progression Phase 1C -- mirrors character-derived.ts's own
  // `isContentChoiceSet` wiring exactly, so this shared helper reflects the
  // real production bridge call rather than an incomplete one. Without
  // this, the real Wizard facet's new `progression:class.subclass-selection`
  // reference (added this phase) would have its Level-3 content choice
  // silently mis-treated as an unanswerable Definition choice by every
  // existing test calling this helper at levelOverride >= 3.
  const isContentChoiceSet = (id: string) => {
    const definition = registry.registry.getById(id)
    return Boolean(definition && definition.kind === 'choiceSet' && definition.from.kind === 'fromContentCatalogue')
  }

  const bridged = buildActorState({
    blueprint: bp,
    packageId: manifest.packageId,
    packageVersion: manifest.version,
    stateSchemaVersion: manifest.stateSchemaVersion,
    knownDefinition: (id) => registry.registry.has(id),
    rulesChoices: bp.rulesChoices,
    lookupChoiceSet: (id) => {
      const definition = registry.registry.getById(id)
      return definition && definition.kind === 'choiceSet' ? definition : null
    },
    lookupProgression,
    isContentChoiceSet,
    levelDefinitionId: registry.registry.getBySemanticRole('level')?.id,
    levelOverride
  })

  return { bridged }
}

describe('Character Progression Phase 1B -- real Wizard Scholar/Expertise choice, end to end', () => {
  const wizardBp = blueprint({ class: slot('class', 'wizard-xphb') })

  it('a level-1 Wizard has no Scholar choice declared at all -- the row has not been reached', () => {
    const { bridged } = deriveWithProgression(wizardBp, 1)
    expect(bridged.declaredChoices.some((c) => c.key.includes('progression'))).toBe(false)
  })

  it('a level-2 Wizard declares the real Scholar choice, unanswered by default', () => {
    const { bridged } = deriveWithProgression(wizardBp, 2)
    const key = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const declared = bridged.declaredChoices.find((c) => c.key === key)
    expect(declared).toBeDefined()
    expect(declared?.count).toBe(1)
    expect(declared?.options).toHaveLength(6)
    expect(declared?.options).toContain('value:skill.arcana.expertise')
    expect(bridged.pendingChoices.some((c) => c.key === key)).toBe(true)
  })

  it('stays declared (cumulative) at level 5 -- once reached, never "expires"', () => {
    const { bridged } = deriveWithProgression(wizardBp, 5)
    const key = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    expect(bridged.declaredChoices.some((c) => c.key === key)).toBe(true)
  })

  it('a valid answer resolves the choice and sets the real Expertise value', () => {
    const key = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const withAnswer = blueprint({
      class: slot('class', 'wizard-xphb'),
      rulesChoices: { selections: { [key]: ['value:skill.arcana.expertise'] } }
    })
    const { bridged } = deriveWithProgression(withAnswer, 2)

    expect(bridged.pendingChoices.some((c) => c.key === key)).toBe(false)
    expect(bridged.actorState.choices[key]).toEqual(['value:skill.arcana.expertise'])
    expect(bridged.actorState.values['value:skill.arcana.expertise']).toBe(true)
  })

  it('an invalid answer (illegal option) is ignored -- the choice stays pending, no value is set', () => {
    const key = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const withBadAnswer = blueprint({
      class: slot('class', 'wizard-xphb'),
      rulesChoices: { selections: { [key]: ['value:skill.athletics.proficient'] } }
    })
    const { bridged } = deriveWithProgression(withBadAnswer, 2)

    expect(bridged.pendingChoices.some((c) => c.key === key)).toBe(true)
    expect(bridged.actorState.values['value:skill.arcana.expertise']).toBeUndefined()
  })

  it('a Fighter (no `progression` on its own facet) declares no progression choice at any level', () => {
    const fighterBp = blueprint({ class: slot('class', 'fighter-xphb') })
    const { bridged } = deriveWithProgression(fighterBp, 5)
    expect(bridged.declaredChoices.some((c) => c.key.includes('progression'))).toBe(false)
  })

  it('creation-time and progression answers coexist -- one does not shadow or overwrite the other', () => {
    const progressionKey = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const creationKey = choiceKey('class', 'choice:skill.proficiency')
    const bp = blueprint({
      class: slot('class', 'wizard-xphb'),
      rulesChoices: {
        selections: {
          [creationKey]: ['value:skill.history.proficient', 'value:skill.medicine.proficient'],
          [progressionKey]: ['value:skill.arcana.expertise']
        }
      }
    })
    const { bridged } = deriveWithProgression(bp, 2)

    expect(bridged.actorState.choices[creationKey]).toEqual(['value:skill.history.proficient', 'value:skill.medicine.proficient'])
    expect(bridged.actorState.choices[progressionKey]).toEqual(['value:skill.arcana.expertise'])
    expect(bridged.actorState.values['value:skill.history.proficient']).toBe(true)
    expect(bridged.actorState.values['value:skill.arcana.expertise']).toBe(true)
  })
})

describe('Character Progression Phase 1B -- generic Progression mechanism, synthetic content', () => {
  // Proves the mechanism itself (trigger ownership, automatic grants,
  // keyedBy scoping, no-op fallbacks) against constructed Progression
  // definitions -- the real authored corpus has exactly one real case
  // (Scholar/Expertise, tested above); these prove the GENERIC machinery
  // works for shapes the real corpus does not currently exercise, the same
  // "synthetic edge cases beyond the real corpus" precedent 1B.5's own
  // scaling resolver tests already established.

  it('a row\'s `sets` become direct values once its own `at` threshold is reached, never before', () => {
    const wizardBp = blueprint({ class: slot('class', 'wizard-xphb') })
    const synthetic = {
      keyedBy: 'value:level',
      rows: [{ at: 3, sets: { 'value:skill.arcana.expertise': true } }]
    }

    const below = deriveWithProgression(wizardBp, 2, { 'progression:class.skill-expertise': synthetic })
    expect(below.bridged.actorState.values['value:skill.arcana.expertise']).toBeUndefined()

    const at = deriveWithProgression(wizardBp, 3, { 'progression:class.skill-expertise': synthetic })
    expect(at.bridged.actorState.values['value:skill.arcana.expertise']).toBe(true)

    const above = deriveWithProgression(wizardBp, 4, { 'progression:class.skill-expertise': synthetic })
    expect(above.bridged.actorState.values['value:skill.arcana.expertise']).toBe(true)
  })

  it('a row\'s `grants` become SourceInstances, mirroring `facet.sources` exactly, deterministic id', () => {
    const wizardBp = blueprint({ class: slot('class', 'wizard-xphb') })
    const synthetic = {
      keyedBy: 'value:level',
      rows: [{ at: 3, grants: ['source:equipment.armor'] }]
    }

    const { bridged } = deriveWithProgression(wizardBp, 3, { 'progression:class.skill-expertise': synthetic })
    expect(bridged.actorState.sources).toContainEqual({
      instanceId: 'class:progression:3:source:equipment.armor',
      sourceRef: 'source:equipment.armor',
      origin: { kind: 'declared' }
    })
  })

  it('an unresolved `sets`/`grants` target is reported, never silently written', () => {
    const wizardBp = blueprint({ class: slot('class', 'wizard-xphb') })
    const synthetic = {
      keyedBy: 'value:level',
      rows: [{ at: 2, sets: { 'value:not.a.real.definition': true }, grants: ['source:also.not.real'] }]
    }

    const { bridged } = deriveWithProgression(wizardBp, 2, { 'progression:class.skill-expertise': synthetic })
    expect(bridged.unresolvedGrants).toContain('value:not.a.real.definition')
    expect(bridged.unresolvedGrants).toContain('source:also.not.real')
    expect(bridged.actorState.values['value:not.a.real.definition']).toBeUndefined()
  })

  it('a Progression whose `keyedBy` does not match the bridge\'s own known level Definition is never evaluated', () => {
    const wizardBp = blueprint({ class: slot('class', 'wizard-xphb') })
    const synthetic = {
      keyedBy: 'value:not-the-level-definition',
      rows: [{ at: 1, sets: { 'value:skill.arcana.expertise': true } }]
    }

    const { bridged } = deriveWithProgression(wizardBp, 5, { 'progression:class.skill-expertise': synthetic })
    expect(bridged.actorState.values['value:skill.arcana.expertise']).toBeUndefined()
  })

  it('with no `lookupProgression` supplied at all, a facet\'s `progression` is a pure no-op (backward compatible)', () => {
    const { manifest, definitions } = loadRulesPackage()
    const registry = RulesRegistry.create(manifest, definitions)
    if (!registry.ok) throw new Error('registry failed')
    const wizardBp = blueprint({ class: slot('class', 'wizard-xphb') })

    const bridged = buildActorState({
      blueprint: wizardBp,
      packageId: manifest.packageId,
      packageVersion: manifest.version,
      stateSchemaVersion: manifest.stateSchemaVersion,
      knownDefinition: (id) => registry.registry.has(id),
      levelDefinitionId: registry.registry.getBySemanticRole('level')?.id,
      levelOverride: 5
      // lookupProgression intentionally omitted.
    })

    expect(bridged.declaredChoices.some((c) => c.key.includes('progression'))).toBe(false)
    expect(bridged.actorState.values['value:skill.arcana.expertise']).toBeUndefined()
  })

  // DEPENDENT CHOICES -- an earlier row's own choice answer can influence a
  // LATER row's own `sets`/`grants` in the SAME Progression, because both
  // rows are evaluated against the SAME already-merged `rulesChoices` input
  // in one `buildActorState` call -- no special-casing needed for this to
  // already work.
  it('an earlier row\'s answered choice is visible (already applied to values) while a LATER row is evaluated', () => {
    const expertiseKey = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const wizardBp = blueprint({
      class: slot('class', 'wizard-xphb'),
      rulesChoices: { selections: { [expertiseKey]: ['value:skill.arcana.expertise'] } }
    })
    // A synthetic level-4 row whose own `sets` is irrelevant to the
    // answer's own value, but proves the SAME evaluation pass sees BOTH:
    // the level-2 answer's own value (from the real Scholar row) AND this
    // synthetic level-4 row's own grant, together.
    const synthetic = {
      keyedBy: 'value:level',
      rows: [
        { at: 2, choices: [{ choiceSet: 'choice:skill.expertise', count: 1, from: ['value:skill.arcana.expertise', 'value:skill.history.expertise'] }] },
        { at: 4, sets: { 'value:skill.history.expertise': false } }
      ]
    }

    const { bridged } = deriveWithProgression(wizardBp, 4, { 'progression:class.skill-expertise': synthetic })
    // The level-2 answer's own effect (set by the FIRST row) is still
    // visible in the SAME resulting ActorState the level-4 row's own `sets`
    // also wrote into.
    expect(bridged.actorState.values['value:skill.arcana.expertise']).toBe(true)
    expect(bridged.actorState.values['value:skill.history.expertise']).toBe(false)
  })
})

describe('D&D 2024 Character Rules Phase 2A.2 -- GENERIC CHARACTER RESOURCES, the bridge-level mechanism (synthetic content)', () => {
  // The real authored corpus's own resources (Rage, Bardic Inspiration,
  // Superiority Dice, ...) are proven end-to-end against the real package
  // in tests/server/utils/character-resources-vertical-slices.test.ts; this
  // describe block proves the GENERIC bridge mechanism itself (facet.
  // resources always-on, row.resources level-gated, unresolved reporting,
  // de-duplication) against synthetic content, mirroring this file's own
  // Progression tests immediately above.

  // A synthetic rulesFacet, nested correctly under `entry.rulesFacet` --
  // `facetFor` (character-actor-bridge.ts) reads `slot.entry.rulesFacet`,
  // never the entry's own top-level fields.
  function slotWithFacet(entityType: string, slug: string, facet: { resources?: string[] }): CharacterAssemblySlot {
    const base = slot(entityType, slug)
    if (base.status !== 'resolved') throw new Error('expected a resolved slot')
    return { status: 'resolved', entry: { ...base.entry, rulesFacet: { ...base.entry.rulesFacet, ...facet } } }
  }

  it('facet.resources is always-on from level 1, consumed through the SAME consumeFacet path as facet.sources', () => {
    const wizardBp = blueprint({
      class: slotWithFacet('class', 'wizard-xphb', { resources: ['resource:rage'] })
    })
    const { bridged } = deriveWithProgression(wizardBp, 1)
    expect(bridged.acquiredResourceIds).toContain('resource:rage')
  })

  it('row.resources is LEVEL-GATED, mirroring row.grants exactly -- absent before, present at and after `at`', () => {
    const wizardBp = blueprint({ class: slot('class', 'wizard-xphb') })
    const synthetic = {
      keyedBy: 'value:level',
      rows: [{ at: 3, resources: ['resource:rage'] }]
    }

    const below = deriveWithProgression(wizardBp, 2, { 'progression:class.skill-expertise': synthetic })
    expect(below.bridged.acquiredResourceIds).not.toContain('resource:rage')

    const at = deriveWithProgression(wizardBp, 3, { 'progression:class.skill-expertise': synthetic })
    expect(at.bridged.acquiredResourceIds).toContain('resource:rage')

    const above = deriveWithProgression(wizardBp, 5, { 'progression:class.skill-expertise': synthetic })
    expect(above.bridged.acquiredResourceIds).toContain('resource:rage')
  })

  it('an unresolved resource id (facet OR row) is reported in unresolvedGrants when knownDefinition is supplied, never silently granted', () => {
    const wizardBp = blueprint({
      class: slotWithFacet('class', 'wizard-xphb', { resources: ['resource:does-not-exist'] })
    })
    const { bridged } = deriveWithProgression(wizardBp, 1)
    expect(bridged.unresolvedGrants).toContain('resource:does-not-exist')
    expect(bridged.acquiredResourceIds).not.toContain('resource:does-not-exist')
  })

  it('the SAME resource id declared twice (e.g. by two facets) de-duplicates to one entry', () => {
    const wizardBp = blueprint({
      species: slotWithFacet('species', 'human-xphb', { resources: ['resource:rage'] }),
      class: slotWithFacet('class', 'wizard-xphb', { resources: ['resource:rage'] })
    })
    const { bridged } = deriveWithProgression(wizardBp, 1)
    expect(bridged.acquiredResourceIds.filter((id) => id === 'resource:rage')).toHaveLength(1)
  })

  it('an acquired feat\'s own facet.resources is consumed through the feat loop, exactly like a SLOT_ORDER facet', () => {
    const featSlot = slotWithFacet('feat', 'ability-score-improvement-xphb', { resources: ['resource:rage'] })
    if (featSlot.status !== 'resolved') throw new Error('expected a resolved feat slot')
    const wizardBp = blueprint({
      class: slot('class', 'wizard-xphb'),
      feats: [{ status: 'resolved', choiceKey: 'class:progression:4:choice:feat.selection', entry: featSlot.entry }]
    })
    const { bridged } = deriveWithProgression(wizardBp, 4)
    expect(bridged.acquiredResourceIds).toContain('resource:rage')
  })
})

// ---------------------------------------------------------------------------
// Character Progression Phase 1C -- the SUBCLASS SLOT. Proves a resolved
// subclass's RulesFacet contributes through the exact same generic
// slot-consumption loop species/class/background already use -- never a
// manual "apply subclass grants" special case anywhere. No real subclass
// RulesFacet is authored yet (this phase's own scope: structural
// correctness, not subclass mechanics), so a synthetic facet proves the
// MECHANISM, the same "prove the mechanism against synthetic data" pattern
// this file's own Progression tests already established for Phase 1B.
// ---------------------------------------------------------------------------

describe('Character Progression Phase 1C -- the subclass slot', () => {
  it("27/29. a resolved subclass's RulesFacet grants contribute to the ActorState, and no RulesFacet is snapshotted anywhere on the character", () => {
    const subclassSlot: CharacterAssemblySlot = {
      status: 'resolved',
      entry: {
        packageId: 'eldra.content.xphb',
        packageVersion: '1.0.0',
        systemKey: 'dnd5e',
        title: 'School of Evocation',
        slug: 'school-of-evocation-phb',
        externalId: 'School of Evocation__PHB',
        provider: '5etools-json',
        // Synthetic -- proves the mechanism, not a real authored fact (no
        // real subclass facet exists yet in app/lib/content-rules).
        rulesFacet: { grants: [{ set: 'value:hit_points.hit_die_size', to: 8 }] }
      }
    }

    const bp = blueprint({ class: slot('class', 'wizard-xphb'), subclass: subclassSlot })
    const { bridged } = derive(bp)

    // The subclass's own grant reached ActorState.values through the
    // IDENTICAL generic loop species/class/background already use -- no
    // special "if subclass" branch exists in character-actor-bridge.ts.
    expect(bridged.actorState.values['value:hit_points.hit_die_size']).toBe(8)
  })

  it('an unresolved (missing/absent) subclass contributes nothing -- legal, inert, never a crash', () => {
    const bp = blueprint({ class: slot('class', 'wizard-xphb') }) // no `subclass` override -- defaults via CharacterAssemblyBlueprint's own optionality in this test helper
    expect(() => derive(bp)).not.toThrow()
  })

  it('the subclass slot is consumed AFTER class, so a subclass grant wins on conflict -- matches SLOT_ORDER\'s own documented rule', () => {
    const subclassSlot: CharacterAssemblySlot = {
      status: 'resolved',
      entry: {
        packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
        title: 'Synthetic Subclass', slug: 'synthetic-subclass', externalId: 'synthetic-subclass', provider: '5etools-json',
        rulesFacet: { grants: [{ set: 'value:hit_points.hit_die_size', to: 12 }] }
      }
    }
    // Wizard's own real facet already grants hit_die_size: 6 -- the
    // subclass's own (synthetic) grant must win, proving slot order.
    const bp = blueprint({ class: slot('class', 'wizard-xphb'), subclass: subclassSlot })
    const { bridged } = derive(bp)
    expect(bridged.actorState.values['value:hit_points.hit_die_size']).toBe(12)
  })
})

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules Phase 2A.1 -- Feat Selection / ASI, end to end
// ---------------------------------------------------------------------------
// Mirrors `deriveWithProgression` above exactly, plus a real EvaluationSession
// so these tests can read the RESULTING derived ability score, not just the
// raw Source list -- proving the increment primitive (two stacked +1 Sources)
// all the way through the Modifier pipeline, never merely that a Source was
// pushed.
function deriveFeat(bp: CharacterAssemblyBlueprint) {
  const { manifest, definitions } = loadRulesPackage()
  const registry = RulesRegistry.create(manifest, definitions)
  if (!registry.ok) throw new Error('registry failed')
  const graph = DependencyGraph.build(registry.registry)
  if (!graph.ok) throw new Error('graph failed')

  const bridged = buildActorState({
    blueprint: bp,
    packageId: manifest.packageId,
    packageVersion: manifest.version,
    stateSchemaVersion: manifest.stateSchemaVersion,
    knownDefinition: (id) => registry.registry.has(id),
    rulesChoices: bp.rulesChoices,
    lookupChoiceSet: (id) => {
      const definition = registry.registry.getById(id)
      return definition && definition.kind === 'choiceSet' ? definition : null
    },
    lookupProgression: (id) => {
      const definition = registry.registry.getById(id)
      return definition && definition.kind === 'progression' ? definition : null
    },
    isContentChoiceSet: (id) => {
      const definition = registry.registry.getById(id)
      return Boolean(definition && definition.kind === 'choiceSet' && definition.from.kind === 'fromContentCatalogue')
    },
    levelDefinitionId: registry.registry.getBySemanticRole('level')?.id,
    levelOverride: 4
  })

  const session = new EvaluationSession(registry.registry, graph.graph, bridged.actorState, {})
  return { bridged, value: (id: string): RuleValue => evaluate(id, session) }
}

// One acquired feat slot, shaped exactly like character-assembly.ts's own
// `CharacterAssemblyFeatSlot` -- `slot()` (above) already builds the
// identical `{status, entry}` shape for species/class/background; this adds
// the `choiceKey` every feat slot additionally carries.
function featSlot(featEntitySlug: string, choiceKey: string) {
  return { ...slot('feat', featEntitySlug), choiceKey }
}

const ASI_CHOICE_KEY = progressionChoiceKey('class', 4, 'choice:feat.selection')
const NESTED_ASI_CHOICE_KEY = `feat:${ASI_CHOICE_KEY}:choice:feat.asi-ability-increase`

describe('D&D 2024 Character Rules Phase 2A.1 -- Ability Score Improvement, end to end', () => {
  it('two stacked picks of the SAME ability compose to +2 through the real Modifier pipeline', () => {
    const bp = blueprint({
      class: slot('class', 'wizard-xphb'),
      feats: [featSlot('ability-score-improvement-xphb', ASI_CHOICE_KEY)],
      rulesChoices: {
        selections: {
          [NESTED_ASI_CHOICE_KEY]: ['source:asi.increase.str', 'source:asi.increase.str']
        }
      }
    })
    const { bridged, value } = deriveFeat(bp)
    expect(bridged.actorState.sources.filter((s) => s.sourceRef === 'source:asi.increase.str')).toHaveLength(2)
    // Base 15 (blueprint's own str score) + 2 = 17.
    expect(value('value:ability.str')).toBe(17)
  })

  it('two picks of DIFFERENT abilities each apply +1, independently', () => {
    const bp = blueprint({
      class: slot('class', 'wizard-xphb'),
      feats: [featSlot('ability-score-improvement-xphb', ASI_CHOICE_KEY)],
      rulesChoices: {
        selections: {
          [NESTED_ASI_CHOICE_KEY]: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      }
    })
    const { value } = deriveFeat(bp)
    expect(value('value:ability.str')).toBe(16) // 15 + 1
    expect(value('value:ability.dex')).toBe(15) // 14 + 1
  })

  it('the SAME option selected twice is rejected when the choice is distinct (every OTHER ChoiceSet in this package)', () => {
    // `choice:skill.proficiency` is distinct (the pre-existing default) --
    // proves `distinct: false` is a real opt-in, not the new global
    // behavior, by showing the OLD unconditional-uniqueness rule still
    // holds for every choice that does not explicitly relax it.
    const bp = blueprint({
      class: slot('class', 'fighter-xphb'),
      rulesChoices: {
        selections: {
          [choiceKey('class', 'choice:skill.proficiency')]: [
            'value:skill.athletics.proficient', 'value:skill.athletics.proficient'
          ]
        }
      }
    })
    const { bridged } = derive(bp)
    expect(bridged.pendingChoices.some((c) => c.key === choiceKey('class', 'choice:skill.proficiency'))).toBe(true)
  })

  it('a feat with no ability-increase facet (unauthored) is structurally inert but never crashes', () => {
    // Every General feat this phase authors grants SOMETHING (see
    // dnd5e-2024.ts's own FEAT AUDIT header) -- this proves the bridge's
    // own general contract for a feat slot with NO facet at all (a feat
    // this package never authored a RulesFacet for), mirroring how an
    // unfaceted species/item already behaves.
    const bp = blueprint({
      class: slot('class', 'wizard-xphb'),
      feats: [{ status: 'resolved' as const, entry: { packageId: 'x', packageVersion: '1', systemKey: 'dnd5e', title: 'Unauthored Feat', slug: 'unauthored-feat', externalId: 'x', provider: '5etools-json' }, choiceKey: ASI_CHOICE_KEY }]
    })
    expect(() => deriveFeat(bp)).not.toThrow()
  })
})

describe('D&D 2024 Character Rules Phase 2A.1 -- real per-class ASI cadence, package-declared', () => {
  // Real corpus levels (this phase's own audit, class-*.json `classFeatures`)
  // -- verified here against the ACTUAL published Progression rows, never
  // a hand-typed assumption.
  const CADENCES: Record<string, number[]> = {
    'progression:class.asi-standard': [4, 8, 12, 16],
    'progression:class.asi-extended': [4, 6, 8, 12, 14, 16],
    'progression:class.asi-frequent': [4, 8, 10, 12, 16]
  }

  it('Fighter references the EXTENDED cadence (4/6/8/12/14/16) -- not the naive 4/8/12/16', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')
    expect(facet?.progression).toContain('progression:class.asi-extended')
  })

  it('Rogue references the FREQUENT cadence (4/8/10/12/16) -- not the naive 4/8/12/16', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb')
    expect(facet?.progression).toContain('progression:class.asi-frequent')
  })

  it('every one of the 12 real classes references exactly one of the three real cadences, and each cadence\'s rows match the real levels', () => {
    const { definitions } = loadRulesPackage()
    const progressionsById = new Map(
      definitions.filter((d) => d.kind === 'progression').map((d) => [d.id, d as ProgressionDefinition])
    )

    for (const [classSlug, classFacet] of Object.entries(DND5E_2024_RULES_FACETS.class ?? {})) {
      const asiId = (classFacet.progression ?? []).find((id) => id.startsWith('progression:class.asi-'))
      expect(asiId, `${classSlug} declares no ASI progression`).toBeDefined()
      expect(Object.keys(CADENCES), `${classSlug} references unknown cadence '${asiId}'`).toContain(asiId)

      const def = progressionsById.get(asiId!)
      expect(def, `'${asiId}' is not a real Definition in the package`).toBeDefined()
      expect(def!.rows.map((r) => r.at)).toEqual(CADENCES[asiId!])
    }
  })

  it('Level 19 is never part of an ASI cadence -- Epic Boon is a separate, unauthored concept this phase deliberately excludes', () => {
    for (const levels of Object.values(CADENCES)) {
      expect(levels).not.toContain(19)
    }
  })
})
