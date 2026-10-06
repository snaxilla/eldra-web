// PHASE P1 -- proficiency / training vocabulary and generic filtered proficiency choices.
//
// UNIT + AUTHORITY (no completeness stub): every assertion here reads the real package, the real
// facets, the real discovery artifact, and the real coverage authority. Nothing is stubbed.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../app/lib/content-rules'
import { DND5E_2024_MANDATORY_DECISIONS } from '../../app/lib/content-rules/creation-completeness'
import { classifyDecision, proficiencyCovered } from '../../app/lib/content-rules/mandatory-decision-coverage'
import type { DecisionRecord } from '../../app/lib/content-rules/mandatory-decisions'
import {
  ABILITY_KEYS,
  ARMOR_CATEGORIES,
  SKILLS,
  TOOL_FAMILIES,
  allToolIds,
  armorValueId,
  toolValueId,
  valueIdsOfToken
} from '../../app/lib/content-rules/proficiency-vocabulary'

const DEFINITIONS = JSON.parse(readFileSync('packages/eldra-dnd5e-2024/definitions.json', 'utf8')) as { id: string, kind: string, category?: string }[]
const DEFINITION_IDS = new Set(DEFINITIONS.map((d) => d.id))
const CORPUS_ITEMS = [
  ...(JSON.parse(readFileSync('/opt/eldra/datasets/5etools-src/data/items-base.json', 'utf8')).baseitem ?? []),
  ...(JSON.parse(readFileSync('/opt/eldra/datasets/5etools-src/data/items.json', 'utf8')).item ?? [])
].map((item: { name: string }) => item.name.toLowerCase())

const PROFICIENCY_VALUE = /^value:(tool|armor|weapon|skill|save)\./

// A synthetic decision for the bite tests. Only the fields coverage reads are meaningful.
function decision(overrides: Partial<DecisionRecord> & Pick<DecisionRecord, 'owner' | 'family' | 'detail'>): DecisionRecord {
  return {
    id: 'synthetic',
    level: 1,
    timing: 'creation',
    mandatory: true,
    cardinality: 1,
    source: 'synthetic',
    ...overrides
  }
}

describe('P1 vocabulary -- identities are the corpus, and every id is a real Definition', () => {
  it('the tool identities are exactly 37 corpus items in four families (17 artisan, 10 instrument, 4 gaming-set, 6 other)', () => {
    expect(Object.fromEntries(Object.entries(TOOL_FAMILIES).map(([k, v]) => [k, v.length]))).toEqual({
      artisan: 17, instrument: 10, 'gaming-set': 4, other: 6
    })
    expect(allToolIds()).toHaveLength(37)
  })

  it('every tool name is a real corpus item (items-base.json or items.json)', () => {
    for (const name of Object.values(TOOL_FAMILIES).flat()) {
      expect(CORPUS_ITEMS, name).toContain(name.toLowerCase())
    }
  })

  it('every vocabulary id the package needs is a declared Definition (no dangling id)', () => {
    const ids = [
      ...allToolIds(),
      ...ARMOR_CATEGORIES.map(armorValueId),
      ...['simple', 'martial', 'improvised', 'martial_light', 'martial_finesse_light'].map((g) => `value:weapon.${g}.proficient`),
      ...SKILLS.map((s) => `value:skill.${s}.proficient`),
      ...ABILITY_KEYS.map((a) => `value:save.${a}.proficient`)
    ]
    const missing = ids.filter((id) => !DEFINITION_IDS.has(id))
    expect(missing).toEqual([])
  })

  it('every proficiency Value a facet grants or offers is a declared Definition', () => {
    const missing: string[] = []
    for (const kind of ['class', 'background', 'species', 'feat'] as const) {
      for (const d of DND5E_2024_MANDATORY_DECISIONS.filter((x) => x.owner.kind === kind)) {
        const facet = findRulesFacet('dnd5e.2024', kind, d.owner.slug)
        for (const g of facet?.grants ?? []) if (PROFICIENCY_VALUE.test(g.set) && !DEFINITION_IDS.has(g.set)) missing.push(g.set)
        for (const c of facet?.choices ?? []) for (const v of c.from ?? []) if (PROFICIENCY_VALUE.test(v) && !DEFINITION_IDS.has(v)) missing.push(v)
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })

  it('a tool identity is a stable slug: apostrophes dropped, other runs as underscores', () => {
    expect(toolValueId("Alchemist's Supplies")).toBe('value:tool.alchemists_supplies.proficient')
    expect(toolValueId('Three-Dragon Ante Set')).toBe('value:tool.three_dragon_ante_set.proficient')
    expect(toolValueId("Thieves' Tools")).toBe('value:tool.thieves_tools.proficient')
  })
})

describe('P1 discovery tokens resolve to Value ids (fail closed on anything unrecognized)', () => {
  it('armor and weapon tokens resolve to their category and group Values', () => {
    expect(valueIdsOfToken('armor:light,shield')).toEqual(['value:armor.light.proficient', 'value:armor.shield.proficient'])
    expect(valueIdsOfToken('weapon:martial_light')).toEqual(['value:weapon.martial_light.proficient'])
  })

  it('a fixed tool token resolves to its one tool Value; a choice token to its family universe', () => {
    expect(valueIdsOfToken('tool:Herbalism Kit')).toEqual(['value:tool.herbalism_kit.proficient'])
    expect(valueIdsOfToken('tools-choice:instrument')).toHaveLength(10)
    expect(valueIdsOfToken('tools-choice:artisan,instrument')).toHaveLength(27)
  })

  it('a skill-or-tool choice resolves to every skill and every tool', () => {
    expect(valueIdsOfToken('skill-tool:any')).toHaveLength(SKILLS.length + 37)
  })

  it('an unrecognized or unknown-family token resolves to NOTHING, so it can never be satisfied', () => {
    expect(valueIdsOfToken('tools-choice:unknown')).toEqual([])
    expect(valueIdsOfToken('unrecognized')).toEqual([])
    expect(valueIdsOfToken('armor:plate')).toEqual([])
  })
})

describe('P1 coverage bite tests (the real facets decide; a mismatch never covers)', () => {
  it('a fixed grant covers only when the owning facet grants every named Value', () => {
    const barbarian = decision({ owner: { kind: 'class', slug: 'barbarian-xphb', name: 'Barbarian' }, family: 'proficiency-grant', detail: 'save:str,con', source: 'proficiency' })
    expect(proficiencyCovered(barbarian)).toBe(true)
    expect(proficiencyCovered({ ...barbarian, detail: 'save:str,dex' })).toBe(false)
  })

  it('a choice covers only when the facet offers exactly the named universe with the same count', () => {
    const artisan = { kind: 'background' as const, slug: 'artisan-xphb', name: 'Artisan' }
    const artisanTool = decision({ owner: artisan, family: 'proficiency-choice', detail: 'tools-choice:artisan', cardinality: 1 })
    expect(proficiencyCovered(artisanTool)).toBe(true)
    // Wrong family for this facet: Artisan offers artisan tools, not gaming sets.
    expect(proficiencyCovered({ ...artisanTool, detail: 'tools-choice:gaming-set' })).toBe(false)
    // Wrong count: the facet offers one artisan tool, not two.
    expect(proficiencyCovered({ ...artisanTool, cardinality: 2 })).toBe(false)
  })

  it('an unrecognized detail is never covered, even on a facet that does grant something', () => {
    expect(proficiencyCovered(decision({ owner: { kind: 'class', slug: 'barbarian-xphb', name: 'Barbarian' }, family: 'proficiency-grant', detail: 'unrecognized' }))).toBe(false)
    expect(proficiencyCovered(decision({ owner: { kind: 'class', slug: 'barbarian-xphb', name: 'Barbarian' }, family: 'proficiency-grant', detail: undefined }))).toBe(false)
  })

  it('a Background-granted feat choice is covered through the granting background, and not standalone', () => {
    const crafter = { kind: 'feat' as const, slug: 'crafter-xphb', name: 'Crafter' }
    const granted = decision({ owner: crafter, family: 'proficiency-choice', detail: 'tools-from:carpenter\'s tools|leatherworker\'s tools|mason\'s tools|potter\'s tools|smith\'s tools|tinker\'s tools|weaver\'s tools|woodcarver\'s tools', cardinality: 3, grantedBy: 'artisan-xphb' })
    expect(proficiencyCovered(granted)).toBe(true)
    expect(proficiencyCovered({ ...granted, grantedBy: undefined })).toBe(false)
  })

  it('a feat choice with no facet offering it stays blocked (Resilient saving throws, Keen Mind skills)', () => {
    const resilient = DND5E_2024_MANDATORY_DECISIONS.find((d) => d.owner.slug === 'resilient-xphb' && d.family === 'proficiency-choice')
    const keenMind = DND5E_2024_MANDATORY_DECISIONS.find((d) => d.owner.slug === 'keen-mind-xphb' && d.family === 'proficiency-choice')
    expect(resilient && classifyDecision(resilient).status).toBe('blocked')
    expect(keenMind && classifyDecision(keenMind).status).toBe('blocked')
  })
})

describe('P1 discovery -- the real corpus transitions, and what stays blocked', () => {
  const byOwner = (slug: string) => DND5E_2024_MANDATORY_DECISIONS.filter((d) => d.owner.slug === slug)

  it('every class saving-throw proficiency is discovered and implemented (saves reuse the singular model)', () => {
    const classes = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']
    for (const name of classes) {
      const saves = byOwner(`${name}-xphb`).filter((d) => d.source === 'proficiency')
      expect(saves, name).toHaveLength(1)
      expect(classifyDecision(saves[0]!).status, name).toBe('implemented')
    }
  })

  it('every class armor, weapon, and fixed tool grant is implemented; Bard and Monk tool choices are implemented', () => {
    const proficiency = DND5E_2024_MANDATORY_DECISIONS.filter((d) => d.owner.kind === 'class' && (d.family === 'proficiency-grant' || d.family === 'proficiency-choice'))
    expect(proficiency.length).toBeGreaterThan(0)
    for (const d of proficiency) expect(classifyDecision(d).status, d.id).toBe('implemented')
  })

  it('Crafter, Musician, and Skilled are implemented through their Background; Magic Initiate is unchanged', () => {
    const crafter = byOwner('crafter-xphb').filter((d) => d.grantedBy === 'artisan-xphb')
    const musician = byOwner('musician-xphb').filter((d) => d.grantedBy === 'entertainer-xphb')
    const skilled = byOwner('skilled-xphb').filter((d) => d.grantedBy !== undefined)
    expect(crafter.length + musician.length + skilled.length).toBeGreaterThan(0)
    for (const d of [...crafter, ...musician, ...skilled]) expect(classifyDecision(d).status, d.id).toBe('implemented')
    const initiate = DND5E_2024_MANDATORY_DECISIONS.filter((d) => d.owner.slug === 'magic-initiate-xphb' && d.grantedBy === 'acolyte-xphb')
    for (const d of initiate) expect(classifyDecision(d).status, d.id).toBe('blocked')
  })

  it('the Skilled choice is 3 picks over skills or tools (the corpus count), not 1', () => {
    const skilled = byOwner('skilled-xphb').find((d) => d.grantedBy === 'charlatan-xphb')
    expect(skilled?.cardinality).toBe(3)
    expect(skilled?.detail).toBe('skill-tool:any')
  })

  it('the artifact is in step with discovery: its decision count matches a fresh corpus read', () => {
    const artifact = JSON.parse(readFileSync('app/lib/content-rules/dnd5e-2024-mandatory-decisions.json', 'utf8')) as { decisions: unknown[] }
    expect(artifact.decisions).toHaveLength(DND5E_2024_MANDATORY_DECISIONS.length)
  })
})
