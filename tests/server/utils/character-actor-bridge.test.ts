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

import { choiceKey } from '../../../app/lib/characters/rules-choices'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { DND5E_2024_RULES_FACETS } from '../../../app/lib/content-rules/dnd5e-2024'
import { DependencyGraph } from '../../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../../app/lib/rules/evaluation-session'
import { evaluate } from '../../../app/lib/rules/evaluator'
import { parseExpression } from '../../../app/lib/rules/parser'
import { RulesRegistry } from '../../../app/lib/rules/registry'
import type { Definition, RuleValue, RulesPackageManifest } from '../../../app/lib/rules/types'
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
    }
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
        if (facet.progression) ids.push(facet.progression)
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
    for (const name of classes) {
      const facet = findRulesFacet('dnd5e.2024', 'class', `${name}-xphb`)
      expect(facet, name).not.toBeNull()
      // Every 2024 class grants exactly two saving throws, one Hit Die size
      // (the Health System's addition), and offers one skill choice.
      expect(facet!.grants).toHaveLength(3)
      expect(facet!.grants!.some((g) => g.set === 'value:hit_points.hit_die_size'), name).toBe(true)
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
      expect(isAbilityScore || isProficiencyFlag || isHitDieGrant, `unexpected stored value '${id}'`).toBe(true)
    }

    // ...and the derived values the sheet will show exist only in the
    // engine's output, never in the state that produced them.
    expect(stored).not.toContain('value:ability.str.mod')
    expect(stored).not.toContain('value:proficiency_bonus')
    expect(stored).not.toContain('value:save.str.bonus')
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
  it('every offered option matches the ChoiceSet\'s own writesTo pattern', () => {
    // The mechanism rests on this agreement: the package declares WHERE an
    // answer is written ("value:skill.{selected}.proficient") and the content
    // declares WHICH options are offered. If a facet ever offered an id that
    // did not fit that shape, resolveChoiceTarget would substitute rather
    // than pass through and silently target a Definition nobody declared.
    const { definitions } = loadRulesPackage()
    const choiceSet = definitions.find((definition) => definition.kind === 'choiceSet')
    expect(choiceSet).toBeDefined()

    const [prefix, suffix] = (choiceSet as any).writesTo.split('{selected}')
    const offered = new Set<string>()

    for (const byType of Object.values(DND5E_2024_RULES_FACETS)) {
      for (const facet of Object.values(byType)) {
        for (const choice of facet.choices ?? []) {
          for (const option of choice.from ?? []) offered.add(option)
        }
      }
    }

    expect(offered.size).toBeGreaterThan(0)
    for (const option of offered) {
      expect(option.startsWith(prefix) && option.endsWith(suffix)).toBe(true)
    }
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
