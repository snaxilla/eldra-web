// P7 -- BACKGROUND ABILITY SCORE DISTRIBUTION: real-engine composition and the base-score invariant.
//
// REAL ENGINE, NO STUB: this file builds the actual ActorState (`buildActorState`, the bridge) and
// evaluates it through the real RulesRegistry/DependencyGraph/EvaluationSession, the identical
// mechanism `tests/server/utils/character-actor-bridge.test.ts` already proves production
// correctness with. Nothing about completeness is exercised here (no stub needed, none applied).
//
// MECHANICS-ISOLATION TECHNIQUE, LABELED: `applyChoice`'s facet-choice loop is generic over the
// SLOT it is attached to (species/class/background are all read identically -- see
// character-actor-bridge.ts). The ASI and Epic Boon composition tests below attach the REAL
// `choice:feat.asi-ability-increase` / `choice:feat.epic-boon-ability` ChoiceSets (same ids, same
// `from`, same `effect: 'activate-source'`) to the SPECIES slot rather than to a fully-leveled
// class progression row -- proving the real Source-stacking mechanism composes with a Background
// increase, without building the entire Level 4/Level 19 class-table machinery just to reach the
// same two ChoiceSets. This is a test-fixture wiring choice, not a weakened engine: the ChoiceSet,
// the Source, and the Modifier pipeline are the exact production Definitions.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../../app/lib/content-rules'
import { backgroundAbilityDistribution } from '../../../app/lib/content-rules/mandatory-decisions'
import { backgroundIncreaseSourceId } from '../../../app/lib/content-rules/mandatory-decision-coverage'
import { DependencyGraph } from '../../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../../app/lib/rules/evaluation-session'
import { evaluate } from '../../../app/lib/rules/evaluator'
import { parseExpression } from '../../../app/lib/rules/parser'
import { RulesRegistry } from '../../../app/lib/rules/registry'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { buildActorState } from '../../../server/utils/character-actor-bridge'
import type { CharacterAssemblyBlueprint, CharacterAssemblySlot } from '../../../server/utils/character-assembly'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

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

function slot(entityType: string, slug: string, facetOverride?: Record<string, unknown>): CharacterAssemblySlot {
  const facet = facetOverride ?? findRulesFacet('dnd5e.2024', entityType, slug)
  return {
    status: 'resolved',
    entry: {
      packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
      title: slug, slug, externalId: slug, provider: '5etools-json',
      ...(facet ? { rulesFacet: facet } : {})
    }
  }
}

function blueprint(overrides: Partial<CharacterAssemblyBlueprint> = {}): CharacterAssemblyBlueprint {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Background Ability Test',
    characterImageUrl: null,
    species: slot('species', 'human-xphb'),
    class: slot('class', 'fighter-xphb'),
    background: slot('background', 'criminal-xphb'),
    abilityScores: { method: 'standard-array', scores: { str: 10, dex: 14, con: 13, int: 10, wis: 10, cha: 8 } },
    rulesChoices: null,
    inventory: [],
    notes: null,
    health: null,
    progression: { classes: [] },
    packs: [],
    ...overrides
  } as CharacterAssemblyBlueprint
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
    rulesChoices: bp.rulesChoices,
    lookupChoiceSet: (id) => {
      const definition = registry.registry.getById(id)
      return definition && definition.kind === 'choiceSet' ? definition : null
    },
    isContentChoiceSet: (id) => {
      const definition = registry.registry.getById(id)
      return Boolean(definition && definition.kind === 'choiceSet' && definition.from.kind === 'fromContentCatalogue')
    },
    levelDefinitionId: registry.registry.getBySemanticRole('level')?.id
  })

  const session = new EvaluationSession(registry.registry, graph.graph, bridged.actorState, {})
  return { bridged, value: (id: string): RuleValue => evaluate(id, session) }
}

type RuleValue = ReturnType<typeof evaluate>

// Criminal's real three abilities, read from the corpus -- not hand-typed.
const CRIMINAL_RAW = (JSON.parse(readFileSync(`${DATA_ROOT}/backgrounds.json`, 'utf8')) as { background: { name: string, source: string, ability?: unknown[] }[] })
  .background.find((b) => b.name === 'Criminal' && b.source === 'XPHB')!
const CRIMINAL_ABILITIES = backgroundAbilityDistribution(CRIMINAL_RAW.ability ?? [])!.detail.match(/^weighted-abilities:([a-z,]+);/)![1]!.split(',')
// Fixtures below assume dex and con are both eligible (true for Criminal: dex, con, int).
const DEX_SOURCE = backgroundIncreaseSourceId('dex')
const CON_SOURCE = backgroundIncreaseSourceId('con')
const BACKGROUND_KEY = 'background:choice:background.ability-distribution'

describe('P7 base-score invariant -- a Background increase is a modifier, never a base mutation', () => {
  it('stores the untouched base ability scores in ActorState; derived evaluation adds the Background increase on top', () => {
    const bp = blueprint({ rulesChoices: { selections: { [BACKGROUND_KEY]: [DEX_SOURCE, DEX_SOURCE, CON_SOURCE] } } })
    const { bridged, value } = derive(bp)

    // BASE -- exactly what was submitted, byte-identical, never touched by the Background answer.
    expect(bridged.actorState.values['value:ability.dex']).toBe(14)
    expect(bridged.actorState.values['value:ability.con']).toBe(13)
    expect(bp.abilityScores!.scores.dex).toBe(14)
    expect(bp.abilityScores!.scores.con).toBe(13)

    // DERIVED -- base plus the Background's +2/+1, computed by the evaluator, not stored as base.
    expect(value('value:ability.dex')).toBe(16)
    expect(value('value:ability.con')).toBe(14)
    // The third Background ability (int), un-selected, stays at base.
    expect(value('value:ability.int')).toBe(10)
  })

  it('a +1/+1/+1 answer is the same invariant: base unchanged, three abilities derived +1 each', () => {
    const intSource = backgroundIncreaseSourceId('int')
    const bp = blueprint({ rulesChoices: { selections: { [BACKGROUND_KEY]: [DEX_SOURCE, CON_SOURCE, intSource] } } })
    const { bridged, value } = derive(bp)

    expect(bridged.actorState.values['value:ability.dex']).toBe(14)
    expect(bridged.actorState.values['value:ability.con']).toBe(13)
    expect(bridged.actorState.values['value:ability.int']).toBe(10)
    expect(value('value:ability.dex')).toBe(15)
    expect(value('value:ability.con')).toBe(14)
    expect(value('value:ability.int')).toBe(11)
  })

  it('no distribution answered leaves every ability at exactly its base', () => {
    const { value } = derive(blueprint())
    expect(value('value:ability.dex')).toBe(14)
    expect(value('value:ability.con')).toBe(13)
  })
})

describe('P7 ASI composition -- a Background increase stacks with a LATER Ability Score Improvement', () => {
  it('Background +2 Dex, later ASI +2 Dex: derived Dex is base + 4, base still untouched', () => {
    // The real ASI ChoiceSet, attached to Species purely as the mechanics-isolation fixture this
    // file's header explains -- `choice:feat.asi-ability-increase` is the SAME Definition, same
    // `effect: 'activate-source'`, same `writesTo: 'source:asi.increase.{selected}'` production uses.
    const asiFacet = { choices: [{ choiceSet: 'choice:feat.asi-ability-increase', count: 2, from: [DEX_SOURCE.replace('background.increase', 'asi.increase'), CON_SOURCE.replace('background.increase', 'asi.increase')] }] }
    const bp = blueprint({
      species: slot('species', 'human-xphb', asiFacet),
      rulesChoices: {
        selections: {
          [BACKGROUND_KEY]: [DEX_SOURCE, DEX_SOURCE, CON_SOURCE],
          'species:choice:feat.asi-ability-increase': ['source:asi.increase.dex', 'source:asi.increase.dex']
        }
      }
    })
    const { bridged, value } = derive(bp)

    expect(bridged.actorState.values['value:ability.dex']).toBe(14) // base, still untouched
    expect(value('value:ability.dex')).toBe(18) // 14 base + 2 (Background) + 2 (ASI)
    expect(value('value:ability.con')).toBe(14) // 13 base + 1 (Background); ASI never touched Con
  })
})

describe('P7 Epic Boon composition -- CORPUS LEGALITY (verified against the real XPHB corpus, not assumed)', () => {
  // Earlier Epic Boon work established that each Boon has its OWN permitted ability list (Boon of
  // Irresistible Offense, for example, permits only str/dex). This checks the RAW corpus record,
  // independent of this package's own authored facet, so the engine-composition test below does
  // not rest on an assumption about which Boon allows which ability.
  it('Boon of Fortitude\'s real `ability` field legally permits Dexterity (it permits all six abilities)', () => {
    const feats = JSON.parse(readFileSync(`${DATA_ROOT}/feats.json`, 'utf8')) as { feat: { name: string, source: string, ability?: { choose?: { from?: string[] } }[] }[] }
    const fortitude = feats.feat.find((f) => f.name === 'Boon of Fortitude' && f.source === 'XPHB')
    expect(fortitude).toBeDefined()
    const allowed = fortitude!.ability?.[0]?.choose?.from ?? []
    expect(allowed).toContain('dex')
    expect(new Set(allowed)).toEqual(new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']))
  })

  it('the package\'s authored facet offers exactly the corpus\'s real ability universe for Boon of Fortitude -- no synthetic widening', () => {
    const boonFacet = findRulesFacet('dnd5e.2024', 'feat', 'boon-of-fortitude-xphb')
    const choice = boonFacet?.choices?.find((c) => c.choiceSet === 'choice:feat.epic-boon-ability')
    expect(choice).toBeDefined()
    const abilities = (choice!.from ?? []).map((id) => id.replace('source:asi.increase.', ''))
    expect(new Set(abilities)).toEqual(new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']))
  })
})

describe('P7 Epic Boon composition -- ENGINE PROOF (the real, unmodified facet; a real legal pick)', () => {
  it('Background +2 Dex composes with Boon of Fortitude\'s real ability-increase choice (Dex, a legal pick -- see the corpus-legality tests above): derived Dex is base + 3', () => {
    // Boon of Fortitude is a REAL XPHB Epic Boon feat; its real, UNMODIFIED facet is used as-is
    // below (only its SLOT attachment is a test-fixture choice -- see this file's header). Its
    // `choice:feat.epic-boon-ability` activates `source:asi.increase.<ability>`, the SAME Source
    // family ASI uses, proving a Background Source and an Epic Boon's Source stack correctly
    // rather than colliding or shadowing one another. Dexterity is a REAL legal pick for this
    // Boon (verified above against the raw corpus), not a widened or invented option.
    const boonFacet = findRulesFacet('dnd5e.2024', 'feat', 'boon-of-fortitude-xphb')
    expect(boonFacet?.choices?.[0]?.choiceSet).toBe('choice:feat.epic-boon-ability')

    const bp = blueprint({
      species: slot('species', 'human-xphb', boonFacet as unknown as Record<string, unknown>),
      rulesChoices: {
        selections: {
          [BACKGROUND_KEY]: [DEX_SOURCE, DEX_SOURCE, CON_SOURCE],
          'species:choice:feat.epic-boon-ability': ['source:asi.increase.dex']
        }
      }
    })
    const { bridged, value } = derive(bp)

    expect(bridged.actorState.values['value:ability.dex']).toBe(14) // base, still untouched
    expect(value('value:ability.dex')).toBe(17) // 14 base + 2 (Background) + 1 (Epic Boon)
  })
})

// Sanity: the three test abilities really are Criminal's three, so the fixtures above are not
// silently testing an ability the Background does not actually offer.
describe('P7 fixture sanity', () => {
  it('Criminal\'s real three abilities include dex, con, and int', () => {
    expect(new Set(CRIMINAL_ABILITIES)).toEqual(new Set(['dex', 'con', 'int']))
  })
})
