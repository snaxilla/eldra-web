// D&D 2024 Character Rules -- WEAPON MASTERY (Barbarian, Fighter, Paladin, Ranger, Rogue). Corpus
// re-derivation (regression fixtures, not detector inputs -- the real 5etools dataset is read at
// test time, matching every other corpus-authority test's own convention), the real 40-weapon
// Content proof, the generic item-mechanics model, package Definition shape, and real-runtime
// load proof.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createWorldRuntime } from '../../app/lib/rules/world-runtime'
import { parseExpression } from '../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../app/lib/rules/types'
import { findRulesFacet } from '../../app/lib/content-rules'
import { resolveDnd5eItemMechanics } from '../../app/lib/item-mechanics/dnd5e'
import { itemFilterVerdict, itemOptionVerdict } from '../../app/lib/item-mechanics/eligibility'
import { weaponValueId } from '../../app/lib/content-rules/proficiency-vocabulary'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const WORLD_ID = '5'
const DATASET_DIR = '/opt/eldra/datasets/5etools-src/data'

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

function loadRealRuntime() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  const result = createWorldRuntime(manifest, definitions, WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function loadClassFile(stem: string): any {
  return JSON.parse(readFileSync(`${DATASET_DIR}/class/class-${stem}.json`, 'utf8'))
}

describe('CORPUS RE-DERIVATION -- Weapon Mastery, five classes', () => {
  it('every class has exactly one real, XPHB-sourced "Weapon Mastery" classFeature at Level 1', () => {
    for (const stem of ['barbarian', 'fighter', 'paladin', 'ranger', 'rogue']) {
      const data = loadClassFile(stem)
      const matches = data.classFeature.filter((f: any) => f.classSource === 'XPHB' && f.source === 'XPHB' && f.name === 'Weapon Mastery')
      expect(matches, stem).toHaveLength(1)
      expect(matches[0].level, stem).toBe(1)
    }
  })

  it('Barbarian: Level 1 = 2, Level 4 = 3, Level 10 = 4, unchanged through Level 20, melee-only restriction in the real text', () => {
    const data = loadClassFile('barbarian')
    const cls = data.class.find((c: any) => c.source === 'XPHB')
    const group = cls.classTableGroups.find((g: any) => g.colLabels.includes('Weapon Mastery'))
    const idx = group.colLabels.indexOf('Weapon Mastery')
    const byLevel = group.rows.map((row: any[]) => Number(row[idx]))
    expect(byLevel[0]).toBe(2)
    expect(byLevel[3]).toBe(3)
    expect(byLevel[9]).toBe(4)
    expect(byLevel[19]).toBe(4)
    const feature = data.classFeature.find((f: any) => f.name === 'Weapon Mastery' && f.classSource === 'XPHB')
    const text = JSON.stringify(feature.entries)
    expect(text).toMatch(/melee weapon=sand/)
    expect(text).toMatch(/Martial Melee weapons/)
  })

  it('Fighter: Level 1 = 3, Level 4 = 4, Level 10 = 5, Level 16 = 6, unchanged through Level 20, no melee restriction', () => {
    const data = loadClassFile('fighter')
    const cls = data.class.find((c: any) => c.source === 'XPHB')
    const group = cls.classTableGroups.find((g: any) => g.colLabels.includes('Weapon Mastery'))
    const idx = group.colLabels.indexOf('Weapon Mastery')
    const byLevel = group.rows.map((row: any[]) => Number(row[idx]))
    expect(byLevel[0]).toBe(3)
    expect(byLevel[3]).toBe(4)
    expect(byLevel[9]).toBe(5)
    expect(byLevel[15]).toBe(6)
    expect(byLevel[19]).toBe(6)
    const feature = data.classFeature.find((f: any) => f.name === 'Weapon Mastery' && f.classSource === 'XPHB')
    expect(JSON.stringify(feature.entries)).not.toMatch(/melee weapon=sand/)
  })

  it('Paladin, Ranger, Rogue: Level 1 = 2, no Weapon Mastery column on the Features table (no later increase)', () => {
    for (const stem of ['paladin', 'ranger', 'rogue']) {
      const data = loadClassFile(stem)
      const cls = data.class.find((c: any) => c.source === 'XPHB')
      const hasColumn = (cls.classTableGroups ?? []).some((g: any) => (g.colLabels ?? []).includes('Weapon Mastery'))
      expect(hasColumn, stem).toBe(false)
      const feature = data.classFeature.find((f: any) => f.name === 'Weapon Mastery' && f.classSource === 'XPHB')
      expect(JSON.stringify(feature.entries), stem).toMatch(/with which you have proficiency/)
    }
  })

  it('mandatory decision population: Barbarian 3, Fighter 4, Paladin/Ranger/Rogue 1 each -- total 10 (one decision per positive table delta, or one at Level 1 when no table exists)', () => {
    const deltas = (stem: string, hasTable: boolean) => {
      if (!hasTable) return 1
      const data = loadClassFile(stem)
      const cls = data.class.find((c: any) => c.source === 'XPHB')
      const group = cls.classTableGroups.find((g: any) => g.colLabels.includes('Weapon Mastery'))
      const idx = group.colLabels.indexOf('Weapon Mastery')
      const byLevel = group.rows.map((row: any[]) => Number(row[idx]))
      let previous = 0
      let count = 0
      for (const value of byLevel) {
        if (value - previous > 0) count++
        previous = value
      }
      return count
    }
    const counts = {
      barbarian: deltas('barbarian', true),
      fighter: deltas('fighter', true),
      paladin: deltas('paladin', false),
      ranger: deltas('ranger', false),
      rogue: deltas('rogue', false)
    }
    expect(counts).toEqual({ barbarian: 3, fighter: 4, paladin: 1, ranger: 1, rogue: 1 })
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('the real Long-Rest replacement clause is optional flexibility, never a Milestone-A blocker: the original answer stays legal', () => {
    for (const stem of ['barbarian', 'fighter', 'paladin', 'ranger', 'rogue']) {
      const data = loadClassFile(stem)
      const feature = data.classFeature.find((f: any) => f.name === 'Weapon Mastery' && f.classSource === 'XPHB')
      const text = JSON.stringify(feature.entries)
      expect(text, stem).toMatch(/Long Rest/)
      expect(text, stem).toMatch(/change (one of those weapon choices|the kinds (of weapons )?you (chose|chose\.))/)
    }
  })
})

describe('CONTENT -- 40/40 real XPHB base weapons curated, re-verified against the current dataset', () => {
  const weapons = JSON.parse(readFileSync(`${DATASET_DIR}/items-base.json`, 'utf8')).baseitem
    .filter((i: any) => i.weaponCategory && i.source === 'XPHB')

  it('exactly 40 real XPHB base weapons exist in the dataset, 16 simple and 24 martial', () => {
    expect(weapons).toHaveLength(40)
    expect(weapons.filter((w: any) => w.weaponCategory === 'simple')).toHaveLength(16)
    expect(weapons.filter((w: any) => w.weaponCategory === 'martial')).toHaveLength(24)
  })

  it('every one of the 40 carries exactly one of the 8 real mastery properties', () => {
    const MASTERY_KINDS = new Set(['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'])
    for (const w of weapons) {
      expect(w.mastery, w.name).toHaveLength(1)
      const code = (typeof w.mastery[0] === 'string' ? w.mastery[0] : w.mastery[0].uid).split('|')[0]
      expect(MASTERY_KINDS.has(code), `${w.name}: ${code}`).toBe(true)
    }
  })

  it('exactly 5 martial weapons carry Finesse or Light (Rogue\'s own restricted martial universe)', () => {
    const code = (p: unknown) => (typeof p === 'string' ? p : (p as any).uid).split('|')[0]
    const finesseOrLight = weapons.filter((w: any) => w.weaponCategory === 'martial' && (w.property ?? []).map(code).some((c: string) => c === 'F' || c === 'L'))
    expect(finesseOrLight.map((w: any) => w.name).sort()).toEqual(['Hand Crossbow', 'Rapier', 'Scimitar', 'Shortsword', 'Whip'])
  })

  it('18 martial melee + 6 martial ranged (Barbarian\'s own melee-only universe is 16 simple + 18 martial melee = 34)', () => {
    const martialMelee = weapons.filter((w: any) => w.weaponCategory === 'martial' && w.type.startsWith('M'))
    const martialRanged = weapons.filter((w: any) => w.weaponCategory === 'martial' && w.type.startsWith('R'))
    expect(martialMelee).toHaveLength(18)
    expect(martialRanged).toHaveLength(6)
  })
})

describe('MODEL -- item-mechanics resolver (real weapon shapes)', () => {
  it('resolves a martial melee weapon with Versatile correctly, including its generic proficiencyGroups', () => {
    const mechanics = resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Topple|XPHB'] })
    expect(mechanics).toEqual({
      kind: 'weapon', weaponCategory: 'martial', range: 'melee',
      properties: ['versatile'], masteryProperty: 'Topple', proficiencyGroups: ['martial']
    })
  })

  it('resolves a simple ranged weapon correctly', () => {
    const mechanics = resolveDnd5eItemMechanics({ weaponCategory: 'simple', type: 'R|XPHB', property: ['A|XPHB', 'T|XPHB'], mastery: ['Vex|XPHB'] })
    expect(mechanics).toEqual({
      kind: 'weapon', weaponCategory: 'simple', range: 'ranged',
      properties: ['ammunition', 'thrown'], masteryProperty: 'Vex', proficiencyGroups: ['simple']
    })
  })

  it('a martial weapon with Light derives BOTH martial_light and martial_finesse_light (Monk/Rogue filtered groups)', () => {
    const mechanics = resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'M|XPHB', property: ['L|XPHB'], mastery: ['Nick|XPHB'] })
    expect(mechanics!.proficiencyGroups).toEqual(['martial', 'martial_light', 'martial_finesse_light'])
  })

  it('a martial weapon with Finesse (no Light) derives martial_finesse_light but NOT martial_light', () => {
    const mechanics = resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB'], mastery: ['Sap|XPHB'] })
    expect(mechanics!.proficiencyGroups).toEqual(['martial', 'martial_finesse_light'])
  })

  it('handles the real Lance shape -- a property entry carrying {uid, note}, never a bare string', () => {
    const mechanics = resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'M|XPHB', property: [{ uid: '2H|XPHB', note: 'unless mounted' }, 'R|XPHB'], mastery: ['Topple|XPHB'] })
    expect(mechanics!.properties).toEqual(['two-handed', 'reach'])
  })

  it('fails closed (null) for a non-weapon item', () => {
    expect(resolveDnd5eItemMechanics({ name: 'Rope', weight: 10 })).toBeNull()
  })

  it('fails closed (null) for malformed data', () => {
    expect(resolveDnd5eItemMechanics(null)).toBeNull()
    expect(resolveDnd5eItemMechanics(undefined)).toBeNull()
    expect(resolveDnd5eItemMechanics('nope')).toBeNull()
  })

  // CORPUS FINDING, traced this phase: two of the 40 `weaponCategory`-bearing entries ("Staff",
  // "Wooden Staff") carry `type: 'SCF|XPHB'` (Spellcasting Focus), never `'M|XPHB'`/`'R|XPHB'` --
  // but BOTH still carry a full, real weapon stat block identical to the ordinary Quarterstaff
  // entry (`weaponCategory: 'simple'`, `mastery: ['Topple|XPHB']`, `property: ['V']`, the same
  // damage dice), confirmed by checking every one of the 12 real SCF-typed items in the dataset:
  // the other 10 (Crystal, Orb, Rod, Wand) carry no `weaponCategory` at all. This is RAW's real
  // intent (a Staff/Wooden Staff IS a Quarterstaff-shaped weapon that doubles as a focus), not a
  // data error -- so the resolver treats `weaponCategory` presence as the real "this is a weapon"
  // signal regardless of `type`, with `type` deciding melee/ranged only when it names one
  // explicitly. All 40 weapon-shaped entries resolve.
  it('re-derives all 40 real XPHB base weapons without error, matching the real corpus mastery property 1:1', () => {
    const weapons = JSON.parse(readFileSync(`${DATASET_DIR}/items-base.json`, 'utf8')).baseitem
      .filter((i: any) => i.weaponCategory && i.source === 'XPHB')
    expect(weapons).toHaveLength(40)
    for (const w of weapons) {
      const mechanics = resolveDnd5eItemMechanics(w)
      expect(mechanics, w.name).not.toBeNull()
      const rawCode = (typeof w.mastery[0] === 'string' ? w.mastery[0] : w.mastery[0].uid).split('|')[0]
      expect(mechanics!.masteryProperty, w.name).toBe(rawCode)
      expect(mechanics!.weaponCategory, w.name).toBe(w.weaponCategory)
    }
  })

  it('Staff and Wooden Staff resolve as melee weapons, mechanically identical to Quarterstaff (same mastery property, same category, same Versatile property)', () => {
    const weapons = JSON.parse(readFileSync(`${DATASET_DIR}/items-base.json`, 'utf8')).baseitem
      .filter((i: any) => i.weaponCategory && i.source === 'XPHB')
    const scfTyped = weapons.filter((w: any) => w.type === 'SCF|XPHB')
    expect(scfTyped.map((w: any) => w.name).sort()).toEqual(['Staff', 'Wooden Staff'])
    const quarterstaff = resolveDnd5eItemMechanics(weapons.find((w: any) => w.name === 'Quarterstaff'))!
    for (const w of scfTyped) {
      const mechanics = resolveDnd5eItemMechanics(w)
      expect(mechanics, w.name).toEqual({
        kind: 'weapon', weaponCategory: 'simple', range: 'melee',
        properties: ['versatile'], masteryProperty: 'Topple', proficiencyGroups: ['simple']
      })
      expect(mechanics, w.name).toEqual(quarterstaff)
    }
  })

  it('the OTHER 10 real SCF-typed items (Crystal, Orb, Rod, Wand -- pure foci, no weapon stats) correctly fail closed', () => {
    const data = JSON.parse(readFileSync(`${DATASET_DIR}/items-base.json`, 'utf8'))
    const pureFoci = data.baseitem.filter((i: any) => typeof i.type === 'string' && i.type.startsWith('SCF') && !i.weaponCategory)
    expect(pureFoci.length).toBeGreaterThan(0)
    for (const item of pureFoci) {
      expect(resolveDnd5eItemMechanics(item), item.name).toBeNull()
    }
  })
})

describe('MODEL -- item eligibility (itemFilterVerdict / itemOptionVerdict)', () => {
  const MARTIAL_MELEE = resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] })!
  const MARTIAL_RANGED = resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'R|XPHB', property: [], mastery: ['Vex|XPHB'] })!
  const SIMPLE_MELEE = resolveDnd5eItemMechanics({ weaponCategory: 'simple', type: 'M|XPHB', property: ['L|XPHB'], mastery: ['Slow|XPHB'] })!

  it('no filter -> refused (fail closed, never a free pass)', () => {
    expect(itemFilterVerdict(MARTIAL_MELEE, null)).toEqual({ eligible: false, reason: 'no-filter' })
  })

  it('an unrecognized filter field -> refused, never silently ignored', () => {
    expect(itemFilterVerdict(MARTIAL_MELEE, { itemKind: 'weapon', somethingElse: true } as any)).toEqual({ eligible: false, reason: 'unsupported-filter' })
  })

  it('no mechanics (unresolvable entry) -> refused', () => {
    expect(itemFilterVerdict(null, { itemKind: 'weapon' })).toEqual({ eligible: false, reason: 'no-mechanics' })
  })

  it('meleeOnly: true refuses a ranged weapon, accepts a melee one', () => {
    expect(itemFilterVerdict(MARTIAL_RANGED, { itemKind: 'weapon', meleeOnly: true })).toEqual({ eligible: false, reason: 'wrong-range' })
    expect(itemFilterVerdict(MARTIAL_MELEE, { itemKind: 'weapon', meleeOnly: true })).toEqual({ eligible: true })
  })

  it('a simple-only proficiency actor: can select a legal simple weapon, cannot select a martial one', () => {
    const simpleOnlyProficient = (group: string) => group === 'simple'
    const simpleVerdict = itemOptionVerdict({ mechanics: SIMPLE_MELEE, filter: { itemKind: 'weapon' }, proficient: () => SIMPLE_MELEE.proficiencyGroups.some(simpleOnlyProficient), ownedElsewhere: false })
    expect(simpleVerdict).toEqual({ eligible: true })
    const martialVerdict = itemOptionVerdict({ mechanics: MARTIAL_MELEE, filter: { itemKind: 'weapon' }, proficient: () => MARTIAL_MELEE.proficiencyGroups.some(simpleOnlyProficient), ownedElsewhere: false })
    expect(martialVerdict).toEqual({ eligible: false, reason: 'not-proficient' })
  })

  it('a martial-capable actor: the appropriate martial weapon is legal', () => {
    const martialCapable = (group: string) => group === 'simple' || group === 'martial'
    const verdict = itemOptionVerdict({ mechanics: MARTIAL_MELEE, filter: { itemKind: 'weapon' }, proficient: () => MARTIAL_MELEE.proficiencyGroups.some(martialCapable), ownedElsewhere: false })
    expect(verdict).toEqual({ eligible: true })
  })

  it('already owned elsewhere always disqualifies, regardless of proficiency (no weapon is ever repeatable)', () => {
    const verdict = itemOptionVerdict({ mechanics: MARTIAL_MELEE, filter: { itemKind: 'weapon' }, proficient: () => true, ownedElsewhere: true })
    expect(verdict).toEqual({ eligible: false, reason: 'already-owned' })
  })

  it('P1 composition, never class-name inference: Rogue\'s own restricted proficiency (martial_finesse_light, not plain martial) correctly excludes a Greatsword and includes a Rapier', () => {
    const greatsword = resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'M|XPHB', property: ['H|XPHB', '2H|XPHB'], mastery: ['Graze|XPHB'] })!
    const rapier = resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB'], mastery: ['Vex|XPHB'] })!
    const rogueProficient = (groups: readonly string[]) => groups.some((g) => g === 'simple' || g === 'martial_finesse_light')
    expect(itemOptionVerdict({ mechanics: greatsword, filter: { itemKind: 'weapon' }, proficient: () => rogueProficient(greatsword.proficiencyGroups), ownedElsewhere: false }).eligible).toBe(false)
    expect(itemOptionVerdict({ mechanics: rapier, filter: { itemKind: 'weapon' }, proficient: () => rogueProficient(rapier.proficiencyGroups), ownedElsewhere: false }).eligible).toBe(true)
  })

  it('weaponValueId composes the real P1 Value id from a bare group name, never a class name', () => {
    expect(weaponValueId('simple')).toBe('value:weapon.simple.proficient')
    expect(weaponValueId('martial_finesse_light')).toBe('value:weapon.martial_finesse_light.proficient')
  })
})

describe('FACET AUTHORING -- exactly the five real classes reference the generic primitive, no others', () => {
  const MASTERY_CLASSES: Record<string, { choiceSet: string; progression: string | null }> = {
    'barbarian-xphb': { choiceSet: 'choice:class.weapon-mastery.melee-only', progression: 'progression:class.weapon-mastery-growth-4-10' },
    'fighter-xphb': { choiceSet: 'choice:class.weapon-mastery', progression: 'progression:class.weapon-mastery-growth-4-10-16' },
    'paladin-xphb': { choiceSet: 'choice:class.weapon-mastery', progression: null },
    'ranger-xphb': { choiceSet: 'choice:class.weapon-mastery', progression: null },
    'rogue-xphb': { choiceSet: 'choice:class.weapon-mastery', progression: null }
  }
  const OTHER_CLASSES = ['bard-xphb', 'cleric-xphb', 'druid-xphb', 'monk-xphb', 'sorcerer-xphb', 'warlock-xphb', 'wizard-xphb']

  it('each of the five real classes declares the expected creation choice and growth progression (or none)', () => {
    for (const [classSlug, expectedRefs] of Object.entries(MASTERY_CLASSES)) {
      const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)
      expect(facet, classSlug).not.toBeNull()
      expect(facet!.choices?.some((c) => c.choiceSet === expectedRefs.choiceSet), classSlug).toBe(true)
      if (expectedRefs.progression) {
        expect(facet!.progression, classSlug).toContain(expectedRefs.progression)
      }
    }
  })

  it('Barbarian\'s own creation count is 2, Fighter\'s is 3, Paladin/Ranger/Rogue are each 2', () => {
    const EXPECTED_COUNT: Record<string, number> = { 'barbarian-xphb': 2, 'fighter-xphb': 3, 'paladin-xphb': 2, 'ranger-xphb': 2, 'rogue-xphb': 2 }
    for (const [classSlug, count] of Object.entries(EXPECTED_COUNT)) {
      const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)
      const choice = facet!.choices!.find((c) => c.choiceSet.startsWith('choice:class.weapon-mastery'))!
      expect(choice.count, classSlug).toBe(count)
    }
  })

  it('no other real class references either Weapon Mastery ChoiceSet or either growth ProgressionDefinition', () => {
    for (const classSlug of OTHER_CLASSES) {
      const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)
      expect(facet?.choices?.some((c) => c.choiceSet.startsWith('choice:class.weapon-mastery')) ?? false, classSlug).toBe(false)
      expect(facet?.progression?.some((p) => p.startsWith('progression:class.weapon-mastery-growth')) ?? false, classSlug).toBe(false)
    }
  })
})

describe('REAL RUNTIME -- the package builds successfully with the new Definitions', () => {
  it('createWorldRuntime succeeds and the registry resolves every new Definition id', () => {
    const runtime = loadRealRuntime()
    for (const id of [
      'choice:class.weapon-mastery', 'choice:class.weapon-mastery.melee-only',
      'progression:class.weapon-mastery-growth-4-10', 'progression:class.weapon-mastery-growth-4-10-16'
    ]) {
      expect(runtime.registry.has(id), id).toBe(true)
    }
  })

  it('both ChoiceSets declare the generic item-category selector, distinct, no class/option name in their own id/label/prompt', () => {
    const runtime = loadRealRuntime()
    for (const id of ['choice:class.weapon-mastery', 'choice:class.weapon-mastery.melee-only']) {
      const definition = runtime.registry.getById(id) as any
      expect(definition.kind).toBe('choiceSet')
      expect(definition.from.kind).toBe('fromContentCatalogue')
      expect(definition.from.category).toBe('items')
      expect(definition.from.filter.itemKind).toBe('weapon')
      expect(definition.distinct).toBe(true)
      const serialized = `${definition.id} ${definition.label} ${definition.prompt}`.toLowerCase()
      for (const forbidden of ['barbarian', 'fighter', 'paladin', 'ranger', 'rogue']) {
        expect(serialized).not.toMatch(new RegExp(`\\b${forbidden}\\b`))
      }
    }
    expect((runtime.registry.getById('choice:class.weapon-mastery.melee-only') as any).from.filter.meleeOnly).toBe(true)
    expect((runtime.registry.getById('choice:class.weapon-mastery') as any).from.filter.meleeOnly).toBeUndefined()
  })
})
