// Character Creator V3 -- Selected Option Explanations. CORPUS / CONTENT
// tests. Exercises the REAL 5etools dataset on disk (no fixture), the same
// "prove it against real content" precedent
// tests/server/utils/content-sources-subclasses.test.ts already established.

import { describe, expect, it } from 'vitest'
import {
  preview5eToolsClassOptions,
  preview5eToolsSpeciesFeatureOptions
} from '../../../app/lib/importers/5etools-feature-options'
import { xphbProvider } from '../../../server/utils/content-sources/dnd5e/xphb'
import { toContentPublicationCandidate } from '../../../server/utils/content-pack-5etools-adapter'

describe('preview5eToolsSpeciesFeatureOptions -- structural identity, never prose', () => {
  it('one preview entry per table row, with the real shared-section prose carried verbatim and a structural definitionId per color', () => {
    const dragonborn = {
      name: 'Dragonborn',
      source: 'XPHB',
      page: 187,
      entries: [
        {
          type: 'entries',
          name: 'Draconic Ancestry',
          entries: [
            'Choose the kind of dragon from the Draconic Ancestors table.',
            {
              type: 'table',
              caption: 'Draconic Ancestors',
              colLabels: ['Dragon', 'Damage Type'],
              rows: [['Black', 'Acid'], ['Blue', 'Lightning']]
            }
          ]
        },
        {
          type: 'entries',
          name: 'Breath Weapon',
          entries: ['When you take the Attack action...']
        },
        {
          type: 'entries',
          name: 'Damage Resistance',
          entries: ['You have Resistance to the damage type determined by your Draconic Ancestry trait.']
        }
      ]
    }

    const result = preview5eToolsSpeciesFeatureOptions(dragonborn, {
      tableSectionName: 'Draconic Ancestry',
      sharedSectionNames: ['Breath Weapon', 'Damage Resistance'],
      definitionIdFor: (name) => `source:draconic-ancestry.${name.toLowerCase()}`
    })

    expect(result.items).toHaveLength(2)
    const black = result.items.find((item) => item.title === 'Dragonborn: Black')!
    expect((black as any).definitionId).toBe('source:draconic-ancestry.black')
    expect(black.entityType).toBe('featureOption')
    expect((black.raw as any).facts).toEqual([{ label: 'Damage Type', value: 'Acid' }])
    // COMPLETE OPTION-DESCRIPTION COVERAGE FOLLOW-UP -- the section's own real lead-in prose
    // (everything before the table node) comes first, verbatim.
    expect((black.raw as any).entries[0]).toBe('Choose the kind of dragon from the Draconic Ancestors table.')
    // Both shared sections' real prose carried into every option's own entries, never only one.
    const names = (black.raw as any).entries.slice(1).map((entry: any) => entry.name)
    expect(names).toEqual(['Breath Weapon', 'Damage Resistance'])

    const blue = result.items.find((item) => item.title === 'Dragonborn: Blue')!
    expect((blue as any).definitionId).toBe('source:draconic-ancestry.blue')
    expect((blue.raw as any).facts).toEqual([{ label: 'Damage Type', value: 'Lightning' }])
  })

  it('warns rather than throws when the named table section is absent', () => {
    const result = preview5eToolsSpeciesFeatureOptions({ name: 'Nothing Here', source: 'XPHB', entries: [] }, {
      tableSectionName: 'Draconic Ancestry',
      definitionIdFor: (name) => `source:x.${name}`
    })
    expect(result.items).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  // COMPLETE OPTION-DESCRIPTION COVERAGE -- a table with MORE than one extra column (Elf's Elven
  // Lineages, Tiefling's Fiendish Legacies: Lineage/Legacy | Level 1 | Level 3 | Level 5) folds
  // every extra column into the option's own `entries` as a labeled section, using the table's
  // own real column headers -- never a single hardcoded `factLabel`.
  it('a multi-column table folds every extra column into entries, labeled by the table\'s own real headers', () => {
    const elf = {
      name: 'Elf',
      source: 'XPHB',
      page: 189,
      entries: [
        {
          type: 'entries',
          name: 'Elven Lineage',
          entries: [
            {
              type: 'table',
              colLabels: ['Lineage', 'Level 1', 'Level 3', 'Level 5'],
              rows: [
                ['Drow', 'The range of your Darkvision increases to 120 feet.', '{@spell Faerie Fire|XPHB}', '{@spell Darkness|XPHB}']
              ]
            }
          ]
        }
      ]
    }

    const result = preview5eToolsSpeciesFeatureOptions(elf, {
      tableSectionName: 'Elven Lineage',
      definitionIdFor: (name) => `source:elven-lineage.${name.toLowerCase()}`
    })

    expect(result.items).toHaveLength(1)
    const drow = result.items[0]!
    expect((drow as any).definitionId).toBe('source:elven-lineage.drow')
    expect((drow.raw as any).facts).toEqual([])
    const sections = (drow.raw as any).entries
    expect(sections.map((s: any) => s.name)).toEqual(['Level 1', 'Level 3', 'Level 5'])
    expect(sections[1].entries).toBe('{@spell Faerie Fire|XPHB}')
  })

  // Goliath's Giant Ancestry / Gnome's Gnomish Lineage: a {type:'list', items:[{name,entries}]}
  // shape, structurally different from a table -- each item's own `entries` IS the option's
  // complete description, nothing extracted from a row. Also proves parenthetical stripping:
  // "Cloud's Jaunt (Cloud Giant)" must derive the id from "Cloud's Jaunt" alone (matching the real
  // hand-authored `source:giant-ancestry.clouds-jaunt`), while surfacing "Cloud Giant" as a real,
  // non-fabricated fact rather than silently dropping it.
  it('a named-list section uses each item\'s own entries directly, and strips a parenthetical variant tag before deriving the id', () => {
    const goliath = {
      name: 'Goliath',
      source: 'XPHB',
      page: 192,
      entries: [
        {
          type: 'entries',
          name: 'Giant Ancestry',
          entries: [
            {
              type: 'list',
              items: [
                { type: 'item', name: "Cloud's Jaunt (Cloud Giant)", entries: ['As a Bonus Action, you magically teleport up to 30 feet.'] }
              ]
            }
          ]
        }
      ]
    }

    const result = preview5eToolsSpeciesFeatureOptions(goliath, {
      tableSectionName: 'Giant Ancestry',
      definitionIdFor: (name) => `source:giant-ancestry.${name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-')}`
    })

    expect(result.items).toHaveLength(1)
    const cloudsJaunt = result.items[0]!
    expect((cloudsJaunt as any).definitionId).toBe('source:giant-ancestry.clouds-jaunt')
    expect((cloudsJaunt.raw as any).entries).toEqual(['As a Bonus Action, you magically teleport up to 30 feet.'])
    expect((cloudsJaunt.raw as any).facts).toEqual([{ label: 'Variant', value: 'Cloud Giant' }])
  })
})

describe('preview5eToolsClassOptions -- each row is already a complete entry', () => {
  it('derives a structural definitionId from the row\'s own name and carries its entries verbatim', () => {
    const rows = [
      { name: 'Armor of Shadows', source: 'XPHB', page: 155, entries: ['You can cast Mage Armor on yourself without expending a spell slot.'] }
    ]
    const result = preview5eToolsClassOptions(rows, (name) => `value:invocation.${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.known`)
    expect(result.items).toHaveLength(1)
    const entry = result.items[0]!
    expect(entry.title).toBe('Armor of Shadows')
    expect((entry as any).definitionId).toBe('value:invocation.armor_of_shadows.known')
    expect((entry.raw as any).entries).toEqual(rows[0]!.entries)
  })
})

describe('xphbProvider -- real dataset, feature-options category', () => {
  it('discovers all 33 real Identity/Class Definition ids this phase authors (5 species families + Warlock + Cleric + Druid)', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const definitionIds = result.candidates.map((c: any) => c.definitionId).sort()

    const expected = [
      ...['black', 'blue', 'brass', 'bronze', 'copper', 'gold', 'green', 'red', 'silver', 'white'].map((c) => `source:draconic-ancestry.${c}`),
      ...['drow', 'high', 'wood'].map((c) => `source:elven-lineage.${c}`),
      ...['clouds-jaunt', 'fires-burn', 'frosts-chill', 'hills-tumble', 'stones-endurance', 'storms-thunder'].map((c) => `source:giant-ancestry.${c}`),
      ...['forest-gnome', 'rock-gnome'].map((c) => `source:gnomish-lineage.${c}`),
      ...['abyssal', 'chthonic', 'infernal'].map((c) => `source:fiendish-legacy.${c}`),
      ...['armor_of_shadows', 'eldritch_mind', 'pact_of_the_blade', 'pact_of_the_chain', 'pact_of_the_tome'].map((c) => `value:invocation.${c}.known`),
      'source:divine-order.protector', 'source:divine-order.thaumaturge',
      'source:primal-order.magician', 'source:primal-order.warden'
    ].sort()

    expect(definitionIds).toEqual(expected)
    expect(result.candidates.length).toBe(33)
  })

  it('every discovered candidate carries a non-empty definitionId and real, non-fabricated description text', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    for (const candidate of result.candidates) {
      expect((candidate as any).definitionId).toBeTruthy()
      expect((candidate.data as any).entries).toBeTruthy()
    }
  })

  it('the real Dragonborn Black candidate carries the real lead-in prose, Breath Weapon/Damage Resistance sections, and its own Damage Type fact', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const black = result.candidates.find((c: any) => c.definitionId === 'source:draconic-ancestry.black')!
    expect(black).toBeDefined()
    const raw = black.data as any
    expect(raw.facts).toEqual([{ label: 'Damage Type', value: 'Acid' }])
    // COMPLETE OPTION-DESCRIPTION COVERAGE FOLLOW-UP -- the real "what is Draconic Ancestry"
    // lead-in sentence, previously dropped entirely, now comes first.
    expect(raw.entries[0]).toContain('Your lineage stems from a dragon progenitor')
    const sectionNames = raw.entries.slice(1).map((entry: any) => entry.name)
    expect(sectionNames).toEqual(['Breath Weapon', 'Damage Resistance'])
  })

  it('the real Armor of Shadows candidate carries its own real entries, unmodified', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const armorOfShadows = result.candidates.find((c: any) => c.definitionId === 'value:invocation.armor_of_shadows.known')!
    expect(armorOfShadows).toBeDefined()
    expect(armorOfShadows.title).toBe('Armor of Shadows')
    expect((armorOfShadows.data as any).entries).toEqual([
      'You can cast {@spell Mage Armor|XPHB} on yourself without expending a spell slot.'
    ])
  })

  it('the real Elf Drow candidate (High Elf/Wood Elf suffix stripped per the real authored ids) carries its Level 1/3/5 sections', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const drow = result.candidates.find((c: any) => c.definitionId === 'source:elven-lineage.drow')!
    const highElf = result.candidates.find((c: any) => c.definitionId === 'source:elven-lineage.high')!
    const woodElf = result.candidates.find((c: any) => c.definitionId === 'source:elven-lineage.wood')!
    expect(drow).toBeDefined()
    expect(highElf).toBeDefined()
    expect(woodElf).toBeDefined()

    // COMPLETE OPTION-DESCRIPTION COVERAGE FOLLOW-UP -- the real "what is an Elven Lineage, how
    // do levels 3/5 work, which ability casts it" lead-in prose (THREE real sentences here,
    // unlike Dragonborn's one), previously dropped entirely, now comes first, verbatim.
    expect((drow.data as any).entries[0]).toContain('You are part of a lineage that grants you supernatural abilities')
    expect((drow.data as any).entries[1]).toContain('When you reach character levels 3 and 5')
    expect((drow.data as any).entries[2]).toContain('Intelligence, Wisdom, or Charisma is your spellcasting ability')
    const sections = (drow.data as any).entries.slice(3).map((s: any) => s.name)
    expect(sections).toEqual(['Level 1', 'Level 3', 'Level 5'])
  })

  it('the real Goliath Giant Ancestry candidates carry their own real lead-in + per-benefit prose and a Variant fact from the real parenthetical', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const cloudsJaunt = result.candidates.find((c: any) => c.definitionId === 'source:giant-ancestry.clouds-jaunt')!
    expect(cloudsJaunt).toBeDefined()
    expect((cloudsJaunt.data as any).facts).toEqual([{ label: 'Variant', value: 'Cloud Giant' }])
    // COMPLETE OPTION-DESCRIPTION COVERAGE FOLLOW-UP -- the real "what is Giant Ancestry, how the
    // Proficiency-Bonus-per-Long-Rest use count works" lead-in sentence, previously dropped.
    expect((cloudsJaunt.data as any).entries).toEqual([
      'You are descended from Giants. Choose one of the following benefits—a supernatural boon from your ancestry; you can use the chosen benefit a number of times equal to your {@variantrule Proficiency|XPHB|Proficiency Bonus}, and you regain all expended uses when you finish a {@variantrule Long Rest|XPHB}:',
      'As a {@variantrule Bonus Action|XPHB}, you magically teleport up to 30 feet to an unoccupied space you can see.'
    ])
  })

  it('the real Gnome Gnomish Lineage candidates carry their own real lead-in + entries, no Variant fact (no parenthetical in the real names)', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const forestGnome = result.candidates.find((c: any) => c.definitionId === 'source:gnomish-lineage.forest-gnome')!
    expect(forestGnome).toBeDefined()
    expect((forestGnome.data as any).facts).toEqual([])
    expect((forestGnome.data as any).entries[0]).toContain('You are part of a lineage that grants you supernatural abilities')
    expect((forestGnome.data as any).entries[1]).toContain('Minor Illusion')
  })

  it('the real Tiefling Fiendish Legacy candidates carry their real lead-in prose and Level 1/3/5 sections', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const abyssal = result.candidates.find((c: any) => c.definitionId === 'source:fiendish-legacy.abyssal')!
    expect(abyssal).toBeDefined()
    // COMPLETE OPTION-DESCRIPTION COVERAGE FOLLOW-UP -- the real "what is a Fiendish Legacy, how
    // levels 3/5 work" lead-in prose (TWO sentences here, unlike Elf's one), previously dropped.
    expect((abyssal.data as any).entries[0]).toContain('You are the recipient of a legacy that grants you supernatural abilities')
    expect((abyssal.data as any).entries[1]).toContain('When you reach character levels 3 and 5')
    const sections = (abyssal.data as any).entries.slice(2).map((s: any) => s.name)
    expect(sections).toEqual(['Level 1', 'Level 3', 'Level 5'])
  })

  it('the real Cleric Divine Order / Druid Primal Order candidates carry the real parent-feature lead-in prose, then their own entries', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const protector = result.candidates.find((c: any) => c.definitionId === 'source:divine-order.protector')!
    const thaumaturge = result.candidates.find((c: any) => c.definitionId === 'source:divine-order.thaumaturge')!
    const magician = result.candidates.find((c: any) => c.definitionId === 'source:primal-order.magician')!
    const warden = result.candidates.find((c: any) => c.definitionId === 'source:primal-order.warden')!
    expect(protector).toBeDefined()
    expect(protector.title).toBe('Protector')
    // COMPLETE OPTION-DESCRIPTION COVERAGE FOLLOW-UP -- Divine Order's own real parent intro
    // ("You have dedicated yourself to one of the following sacred roles of your choice."),
    // previously never read at all, now comes first for BOTH of its children; Protector's own
    // real text ("Martial weapons"/"Heavy armor") follows, unmodified.
    expect((protector.data as any).entries[0]).toContain('dedicated yourself to one of the following sacred roles')
    expect((protector.data as any).entries[1]).toContain('Martial weapons')
    expect((thaumaturge.data as any).entries[0]).toContain('dedicated yourself to one of the following sacred roles')

    expect(warden).toBeDefined()
    expect(warden.title).toBe('Warden')
    expect((warden.data as any).entries[0]).toContain('dedicated yourself to one of the following sacred roles')
    expect((warden.data as any).entries[1]).toContain('Medium armor')
    expect((magician.data as any).entries[0]).toContain('dedicated yourself to one of the following sacred roles')
  })
})

describe('toContentPublicationCandidate -- definitionId passthrough', () => {
  it('carries definitionId through to the publication candidate when the importer set it', () => {
    const entity: any = {
      systemKey: 'dnd5e', entityType: 'featureOption', title: 'Dragonborn: Black',
      slug: 'dragonborn-black-xphb', provider: '5etools-json', externalId: 'x',
      blocks: [], raw: {}, definitionId: 'source:draconic-ancestry.black'
    }
    const candidate = toContentPublicationCandidate(entity)
    expect(candidate.definitionId).toBe('source:draconic-ancestry.black')
  })

  it('omits definitionId entirely for a category that never sets it (e.g. a class)', () => {
    const entity: any = {
      systemKey: 'dnd5e', entityType: 'class', title: 'Wizard',
      slug: 'wizard-xphb', provider: '5etools-json', externalId: 'x',
      blocks: [], raw: {}
    }
    const candidate = toContentPublicationCandidate(entity)
    expect(candidate).not.toHaveProperty('definitionId')
  })
})
