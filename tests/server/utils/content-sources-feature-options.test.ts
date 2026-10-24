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
      factLabel: 'Damage Type',
      definitionIdFor: (name) => `source:draconic-ancestry.${name.toLowerCase()}`
    })

    expect(result.items).toHaveLength(2)
    const black = result.items.find((item) => item.title === 'Dragonborn: Black')!
    expect((black as any).definitionId).toBe('source:draconic-ancestry.black')
    expect(black.entityType).toBe('featureOption')
    expect((black.raw as any).facts).toEqual([{ label: 'Damage Type', value: 'Acid' }])
    // Both shared sections' real prose carried into every option's own entries, never only one.
    const names = (black.raw as any).entries.map((entry: any) => entry.name)
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
  it('discovers Dragonborn\'s 10 real Draconic Ancestry colors and Warlock\'s 5 real Level-1 invocations', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const definitionIds = result.candidates.map((c: any) => c.definitionId).sort()

    const expectedAncestryColors = ['black', 'blue', 'brass', 'bronze', 'copper', 'gold', 'green', 'red', 'silver', 'white']
    for (const color of expectedAncestryColors) {
      expect(definitionIds).toContain(`source:draconic-ancestry.${color}`)
    }

    const expectedInvocations = ['armor_of_shadows', 'eldritch_mind', 'pact_of_the_blade', 'pact_of_the_chain', 'pact_of_the_tome']
    for (const invocation of expectedInvocations) {
      expect(definitionIds).toContain(`value:invocation.${invocation}.known`)
    }

    expect(result.candidates.length).toBe(expectedAncestryColors.length + expectedInvocations.length)
  })

  it('every discovered candidate carries a non-empty definitionId and real, non-fabricated description text', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    for (const candidate of result.candidates) {
      expect((candidate as any).definitionId).toBeTruthy()
      expect((candidate.data as any).entries).toBeTruthy()
    }
  })

  it('the real Dragonborn Black candidate carries the real Breath Weapon/Damage Resistance prose and its own Damage Type fact', async () => {
    const result = await xphbProvider.loadCategory('feature-options')
    const black = result.candidates.find((c: any) => c.definitionId === 'source:draconic-ancestry.black')!
    expect(black).toBeDefined()
    const raw = black.data as any
    expect(raw.facts).toEqual([{ label: 'Damage Type', value: 'Acid' }])
    const sectionNames = raw.entries.map((entry: any) => entry.name)
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
