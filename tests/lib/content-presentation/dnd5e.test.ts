// Unit tests for the D&D 5e Content Presentation Resolver
// (app/lib/content-presentation/*) -- Character Builder / Character Sheet
// Phase 2.
//
// THE FIXTURE IS REAL PUBLISHED CONTENT, NOT INVENTED SHAPES.
// fixtures/5etools-real-rows.json holds rows copied VERBATIM out of the
// 5etools dataset -- and a row in that dataset is byte-identical to what a
// Content Pack stores, because content-pack-5etools-adapter.ts sets
// `candidate.data = entity.raw` (the untouched upstream entry). So these
// tests exercise exactly the bytes the real published XPHB pack contains,
// while keeping the suite independent of /opt/eldra/datasets, which lives
// outside this repo and must not be a test dependency -- the same split
// tests/server/utils/content-sources-providers.test.ts already uses.
//
// Both editions are covered on purpose. XPHB (2024, `edition: 'one'`) is
// what Solaris actually binds; SRD 5.1 (2014) is a differently SHAPED
// pack a World may legitimately bind alongside it, and the resolver has to
// read both without branching on which collection an entry came from.
//
// Pure throughout: no Nuxt, no Directus, no filesystem, no HTTP.

import { describe, expect, it } from 'vitest'

import { resolveContentPresentation } from '../../../app/lib/content-presentation'
import { cleanText, resolveDnd5ePresentation } from '../../../app/lib/content-presentation/dnd5e'
import rows from './fixtures/5etools-real-rows.json'

const xphb = rows.xphb as any
const srd51 = rows.srd51 as any

function factValue(entry: any, label: string): string | undefined {
  return entry.facts.find((fact: any) => fact.label === label)?.value
}

function section(entry: any, title: string) {
  return entry.sections.find((item: any) => item.title === title)
}

describe('cleanText', () => {
  it('uses a tag\'s first segment as its display text', () => {
    expect(cleanText('{@sense Darkvision|XPHB} with a range of 60 feet')).toBe('Darkvision with a range of 60 feet')
    expect(cleanText('{@feat Magic Initiate|XPHB}')).toBe('Magic Initiate')
  })

  it('prefers an explicit third-segment display override on reference tags', () => {
    expect(cleanText('{@item Arrow|XPHB|20 Arrows}')).toBe('20 Arrows')
    expect(cleanText('{@variantrule Hit Points|XPHB|Hit Point} maximum')).toBe('Hit Point maximum')
  })

  it('does NOT treat a @filter tag\'s trailing segments as display text', () => {
    // The regression this guards: @filter's tail is a filter specification,
    // not wording. Reading it as an override renders "property=light" to a
    // player -- which is what the Monk and Rogue weapon proficiency rows,
    // the only two in XPHB that use @filter, would have shown.
    expect(cleanText('Martial weapons that have the {@filter Light|items|type=martial weapon|property=light} property'))
      .toBe('Martial weapons that have the Light property')
  })

  it('strips unresolvable markup and template placeholders rather than printing them', () => {
    expect(cleanText('a {@unknownTag } b')).toBe('a b')
    expect(cleanText('Dragonborn ({{color}})')).toBe('Dragonborn ()')
  })
})

describe('resolveDnd5ePresentation -- species (XPHB)', () => {
  it('surfaces creature type, size, speed and senses as stated, computing nothing', () => {
    const dwarf = resolveDnd5ePresentation('species', xphb.species.Dwarf)!

    expect(dwarf.kind).toBe('species')
    expect(dwarf.name).toBe('Dwarf')
    expect(dwarf.sourceBook).toBe('XPHB')
    expect(dwarf.sourcePage).toBe('188')
    expect(factValue(dwarf, 'Creature Type')).toBe('Humanoid')
    expect(factValue(dwarf, 'Speed')).toBe('30 ft.')
    // Darkvision is LISTED, not modelled -- the range is restated verbatim.
    expect(factValue(dwarf, 'Senses')).toBe('Darkvision 120 ft.')
    expect(factValue(dwarf, 'Resistances')).toBe('Poison')
  })

  it('prefers the book\'s own fuller size wording when the entry carries it', () => {
    expect(factValue(resolveDnd5ePresentation('species', xphb.species.Elf)!, 'Size'))
      .toBe('Medium (about 5-6 feet tall)')
  })

  it('renders each trait as its own named section with its prose intact', () => {
    const dwarf = resolveDnd5ePresentation('species', xphb.species.Dwarf)!

    expect(dwarf.sections.map((item) => item.title))
      .toEqual(['Darkvision', 'Dwarven Resilience', 'Dwarven Toughness', 'Stonecunning'])
    expect(section(dwarf, 'Dwarven Resilience')!.paragraphs[0])
      .toBe('You have Resistance to Poison damage. You also have Advantage on saving throws you make to avoid or end the Poisoned condition.')
  })

  it('lists a species\' variants from literal _versions names, parent name stripped', () => {
    expect(factValue(resolveDnd5ePresentation('species', xphb.species.Elf)!, 'Variants'))
      .toBe('Drow Lineage, High Elf Lineage, Wood Elf Lineage')
  })

  it('lists variants from the templated _abstract/_implementations form too', () => {
    // Dragonborn is the only XPHB species using this shape. A resolver that
    // handles only the literal form renders "Dragonborn ({{color}})".
    expect(factValue(resolveDnd5ePresentation('species', xphb.species.Dragonborn)!, 'Variants'))
      .toBe('Black, Blue, Brass, Bronze, Copper, Gold, Green, Red, Silver, White')
  })

  it('states a choice offered as a choice, without resolving it', () => {
    expect(factValue(resolveDnd5ePresentation('species', xphb.species.Elf)!, 'Skill Proficiencies'))
      .toBe('Choose 1 of Insight, Perception, Survival')
    expect(factValue(resolveDnd5ePresentation('species', xphb.species.Human)!, 'Skill Proficiencies'))
      .toBe('Choose any 1')
    expect(factValue(resolveDnd5ePresentation('species', xphb.species.Human)!, 'Feat'))
      .toBe('Choose 1 Origin')
  })

  it('omits Languages for 2024 species, which genuinely grant none, and adds no note about it', () => {
    const human = resolveDnd5ePresentation('species', xphb.species.Human)!

    expect(factValue(human, 'Languages')).toBeUndefined()
    expect(human.notes.join(' ')).not.toContain('anguage')
  })

  it('reports the absent description rather than inventing or hiding it', () => {
    const elf = resolveDnd5ePresentation('species', xphb.species.Elf)!

    expect(elf.description).toEqual([])
    expect(elf.notes).toHaveLength(1)
    expect(elf.notes[0]).toContain('does not publish descriptive text')
  })

  it('reads a fluff join the day a pack publishes one, with no further change', () => {
    const withFluff = {
      ...xphb.species.Dwarf,
      fluff: { entries: [{ type: 'entries', entries: ['Dwarves were raised from the earth.'] }] }
    }
    const resolved = resolveDnd5ePresentation('species', withFluff)!

    expect(resolved.description).toEqual(['Dwarves were raised from the earth.'])
    expect(resolved.notes).toEqual([])
  })

  it('reads the REAL fluff-races.json join (fixture: fluff join follow-up task) for Dwarf', () => {
    // Verified: species fluff never carries a `name` on its entries wrapper
    // (unlike class fluff below), so this needed no resolver change -- this
    // test is the proof, not just a claim.
    const withFluff = { ...xphb.species.Dwarf, fluff: xphb.fluff.species.Dwarf }
    const resolved = resolveDnd5ePresentation('species', withFluff)!

    expect(resolved.description[0]).toContain('Dwarves were raised from the earth in the elder days')
    expect(resolved.notes).toEqual([])
  })
})

describe('resolveDnd5ePresentation -- class (XPHB)', () => {
  it('displays the hit die as printed and derives no hit points from it', () => {
    expect(factValue(resolveDnd5ePresentation('class', xphb.classes.Fighter)!, 'Hit Die')).toBe('1d10')
    expect(factValue(resolveDnd5ePresentation('class', xphb.classes.Bard)!, 'Hit Die')).toBe('1d8')
  })

  it('reads a primary-ability CHOICE as "or" and a required PAIR as "and"', () => {
    // Fighter: [{str},{dex}] -- either one. Monk: [{dex, wis}] -- both.
    expect(factValue(resolveDnd5ePresentation('class', xphb.classes.Fighter)!, 'Primary Ability'))
      .toBe('Strength or Dexterity')
    expect(factValue(resolveDnd5ePresentation('class', xphb.classes.Monk)!, 'Primary Ability'))
      .toBe('Dexterity and Wisdom')
  })

  it('surfaces saving throws, armor training, weapon and skill proficiencies', () => {
    const fighter = resolveDnd5ePresentation('class', xphb.classes.Fighter)!

    expect(factValue(fighter, 'Saving Throw Proficiencies')).toBe('Strength, Constitution')
    expect(factValue(fighter, 'Armor Training')).toBe('Light, Medium, Heavy, Shield')
    expect(factValue(fighter, 'Weapon Proficiencies')).toBe('Simple, Martial')
    expect(factValue(fighter, 'Skill Choices'))
      .toBe('Choose 2 of Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Persuasion, Perception, Survival')
  })

  it('reads weapon prose containing a @filter tag without leaking the filter spec', () => {
    expect(factValue(resolveDnd5ePresentation('class', xphb.classes.Monk)!, 'Weapon Proficiencies'))
      .toBe('Simple, Martial weapons that have the Light property')
  })

  it('prefers the book\'s tool prose over the coded form when a class carries both', () => {
    // Bard carries tools: ['Choose three {@item Musical Instrument|...}']
    // AND toolProficiencies: [{anyMusicalInstrument: 3}].
    expect(factValue(resolveDnd5ePresentation('class', xphb.classes.Bard)!, 'Tool Proficiencies'))
      .toBe('Choose three Musical Instruments')
  })

  it('surfaces spellcasting ability only for classes that have one', () => {
    expect(factValue(resolveDnd5ePresentation('class', xphb.classes.Bard)!, 'Spellcasting Ability')).toBe('Charisma')
    expect(factValue(resolveDnd5ePresentation('class', xphb.classes.Fighter)!, 'Spellcasting Ability')).toBeUndefined()
  })

  it('lists class features by level -- names and levels only, with the missing prose noted', () => {
    const fighter = resolveDnd5ePresentation('class', xphb.classes.Fighter)!
    const features = section(fighter, 'Class Features')!

    expect(features.paragraphs[0]).toBe('Level 1: Fighting Style, Second Wind, Weapon Mastery')
    expect(features.paragraphs[1]).toBe('Level 2: Action Surge, Tactical Mind')
    // Ascending, never reordered by the order refs happened to appear in.
    const levels = features.paragraphs.map((line) => Number(/^Level (\d+):/.exec(line)![1]))
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
    expect(fighter.notes.some((note) => note.includes('not their rules text'))).toBe(true)
  })

  it('surfaces the printed starting equipment paragraph', () => {
    const equipment = section(resolveDnd5ePresentation('class', xphb.classes.Fighter)!, 'Starting Equipment')!

    expect(equipment.paragraphs[0]).toContain('Chain Mail')
    expect(equipment.paragraphs[0]).toContain('20 Arrows')
    expect(equipment.paragraphs[0]).not.toContain('{@')
  })

  it('reads the REAL class fluff join (fixture: fluff join follow-up task) WITHOUT leaking the "Fighter:" label', () => {
    // The regression this guards: class fluff's own wrapper is
    // {type:'section', name:'Fighter', entries:[...]} -- the SAME
    // {name, entries} shape flattenEntries otherwise treats as a labelled
    // fact ("Label: body"). Reading it naively would have rendered
    // description as ["Fighter: <every paragraph joined into one line>"],
    // losing paragraph breaks and repeating the card's own heading.
    const withFluff = { ...xphb.classes.Fighter, fluff: xphb.fluff.classes.Fighter }
    const resolved = resolveDnd5ePresentation('class', withFluff)!

    expect(resolved.description.length).toBeGreaterThan(1)
    expect(resolved.description[0]).not.toMatch(/^Fighter:/)
    expect(resolved.description.every((paragraph) => !paragraph.startsWith('Fighter:'))).toBe(true)
    expect(resolved.description[0]).toContain('Fighters rule many battlefields')
  })
})

describe('resolveDnd5ePresentation -- background (XPHB)', () => {
  it('surfaces skills, tools, origin feat, ability options and equipment', () => {
    const acolyte = resolveDnd5ePresentation('background', xphb.backgrounds.Acolyte)!

    expect(acolyte.name).toBe('Acolyte')
    expect(factValue(acolyte, 'Skill Proficiencies')).toBe('Insight, Religion')
    expect(factValue(acolyte, 'Tool Proficiencies')).toBe("Calligrapher's Supplies")
    // The 2024 Origin Feat, taken from the printed line so the parenthetical
    // subject survives -- the coded key is "magic initiate; cleric|xphb".
    expect(factValue(acolyte, 'Origin Feat')).toBe('Magic Initiate (Cleric)')
    // Ability scores are DISPLAYED because the book prints them. Nothing is
    // chosen, weighted, or applied.
    expect(factValue(acolyte, 'Ability Scores')).toBe('Intelligence, Wisdom, Charisma')
    expect(section(acolyte, 'Equipment')!.paragraphs[0])
      .toContain("Choose A or B: (A) Calligrapher's Supplies, Book (prayers)")
  })

  it('does not repeat the printed summary list as a section, since its lines are already facts', () => {
    const acolyte = resolveDnd5ePresentation('background', xphb.backgrounds.Acolyte)!

    expect(acolyte.sections.map((item) => item.title)).toEqual(['Equipment'])
  })

  it('reads the REAL background fluff join (fixture: fluff join follow-up task) for Acolyte', () => {
    // Background fluff never carries a `name` on its entries array (unlike
    // class fluff) -- verified against every XPHB row -- so this needed no
    // resolver change; this test is the proof.
    const withFluff = { ...xphb.backgrounds.Acolyte, fluff: xphb.fluff.backgrounds.Acolyte }
    const resolved = resolveDnd5ePresentation('background', withFluff)!

    expect(resolved.description[0]).toContain('You devoted yourself to service in a temple')
    expect(resolved.notes).toEqual([])
  })
})

describe('resolveDnd5ePresentation -- SRD 5.1 (2014 shapes)', () => {
  it('reads 2014 species, where languages ARE granted and are surfaced', () => {
    const elf = resolveDnd5ePresentation('species', srd51.species.Elf)!

    expect(elf.sourceBook).toBe('PHB')
    expect(factValue(elf, 'Speed')).toBe('30 ft.')
    expect(factValue(elf, 'Languages')).toBe('Common, Elvish')
    expect(elf.sections.length).toBeGreaterThan(0)
  })

  it('reads 2014 classes, which carry no primaryAbility and a differently shaped weapon list', () => {
    const wizard = resolveDnd5ePresentation('class', srd51.classes.Wizard)!

    expect(factValue(wizard, 'Hit Die')).toBe('1d6')
    expect(factValue(wizard, 'Saving Throw Proficiencies')).toBe('Intelligence, Wisdom')
    expect(factValue(wizard, 'Spellcasting Ability')).toBe('Intelligence')
    expect(factValue(wizard, 'Primary Ability')).toBeUndefined()
    expect(factValue(wizard, 'Weapon Proficiencies')).not.toContain('{@')
  })

  it('reads 2014 backgrounds, whose details are named blocks rather than a printed list', () => {
    const acolyte = resolveDnd5ePresentation('background', srd51.backgrounds.Acolyte)!

    expect(factValue(acolyte, 'Skill Proficiencies')).toBe('Insight, Religion')
    expect(factValue(acolyte, 'Languages')).toBe('Choose any 2 Standard')
    expect(acolyte.sections.map((item) => item.title)).toContain('Equipment')
  })
})

describe('every XPHB row resolves to something a player can read', () => {
  const cases: Array<[any, any]> = [
    ...Object.values(xphb.species).map((row) => ['species', row] as [any, any]),
    ...Object.values(xphb.classes).map((row) => ['class', row] as [any, any]),
    ...Object.values(xphb.backgrounds).map((row) => ['background', row] as [any, any])
  ]

  it.each(cases)('%s row resolves with a name, at least one fact, and no leaked markup', (kind, row) => {
    const resolved = resolveDnd5ePresentation(kind, row)!

    expect(resolved.name).toBeTruthy()
    expect(resolved.facts.length).toBeGreaterThan(0)

    const rendered = JSON.stringify(resolved)
    expect(rendered).not.toContain('{@')
    expect(rendered).not.toContain('{{')
  })
})

describe('resolveContentPresentation -- the system seam', () => {
  it('dispatches dnd5e to the 5e resolver', () => {
    expect(resolveContentPresentation('dnd5e', 'species', xphb.species.Dwarf)?.name).toBe('Dwarf')
  })

  it('returns null for a game system with no resolver rather than throwing', () => {
    expect(resolveContentPresentation('pf2e', 'species', xphb.species.Dwarf)).toBeNull()
  })

  it('returns null for unusable data rather than throwing', () => {
    for (const data of [null, undefined, 'a string', 42, ['an', 'array']]) {
      expect(resolveContentPresentation('dnd5e', 'class', data)).toBeNull()
    }
  })

  it('returns an entry, not an error, for an object with none of the fields it looks for', () => {
    const resolved = resolveContentPresentation('dnd5e', 'species', { name: 'Mystery' })!

    expect(resolved.name).toBe('Mystery')
    expect(resolved.facts).toEqual([])
    expect(resolved.sections).toEqual([])
    expect(resolved.description).toEqual([])
  })
})
