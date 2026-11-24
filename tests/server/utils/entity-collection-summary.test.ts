// Extracted from server/api/worlds/[id]/entities.get.ts (direct-edit
// consolidation pass) so it can be reused by the Studio editor preview --
// this is the first test coverage this logic has ever had. Behavior is
// unchanged from the pre-extraction version; these tests pin that down.

import { describe, expect, it } from 'vitest'
import { collectionSummaryDisplayType, collectionSummaryFacet, collectionSummaryMetaLines } from '../../../server/utils/entity-collection-summary'

const ITEM_ROW = { entity_type: 'item', slug: 'shortsword-xphb' }
const ITEM_BLOCKS = [
  { block_key: 'item_core', data: { item_type: 'M', rarity: 'none', damage: '1d6', damage_type: 'piercing', weight: 2, value: '10 gp' } }
]

describe('collectionSummaryDisplayType', () => {
  it('maps an item type code to its human label', () => {
    expect(collectionSummaryDisplayType(ITEM_ROW, ITEM_BLOCKS)).toBe('Melee Weapon')
  })

  it('falls back to a title-cased entity type when there is no core block', () => {
    expect(collectionSummaryDisplayType({ entity_type: 'location' }, [])).toBe('Location')
  })
})

describe('collectionSummaryFacet', () => {
  it('reports the item type code label as the facet', () => {
    expect(collectionSummaryFacet(ITEM_ROW, ITEM_BLOCKS)).toBe('Melee Weapon')
  })

  it('reports a spell level label', () => {
    const row = { entity_type: 'spell', slug: 'fireball-xphb' }
    const blocks = [{ block_key: 'spell_core', data: { level: 3 } }]
    expect(collectionSummaryFacet(row, blocks)).toBe('Level 3')
  })
})

describe('collectionSummaryMetaLines', () => {
  it('formats item damage/weight/value/source using the existing formatting, not invented mechanics', () => {
    const lines = collectionSummaryMetaLines(ITEM_ROW, ITEM_BLOCKS)
    expect(lines).toContain('Type: Melee Weapon')
    expect(lines).toContain('Damage: 1d6 Piercing')
    expect(lines).toContain('Weight: 2')
    expect(lines).toContain('Value: 10 gp')
    expect(lines).toContain('Source: XPHB')
  })

  it('omits a line entirely when the underlying field is absent, rather than printing an empty value', () => {
    const lines = collectionSummaryMetaLines({ entity_type: 'item', slug: 'x' }, [{ block_key: 'item_core', data: {} }])
    expect(lines.some((line) => line.startsWith('Damage:'))).toBe(false)
  })

  it('falls back to display type + source for an entity type with no dedicated branch', () => {
    const lines = collectionSummaryMetaLines({ entity_type: 'npc', slug: 'goblin-xmm' }, [])
    expect(lines).toEqual(['Npc', 'Source: XMM'])
  })

  // Species/Class Context Content pass -- these two use block data shaped
  // EXACTLY as app/lib/importers/5etools-species.ts / 5etools-classes.ts
  // now actually produce it (post-fix: primary_ability already a clean
  // label, trait_count populated), proving the full
  // importer -> collectionSummaryMetaLines pipeline the rail actually
  // consumes surfaces useful fields with no raw-JSON leakage, not just the
  // importer's own output in isolation.
  it('surfaces species size/speed/traits/source -- the rail\'s own "useful information"', () => {
    const row = { entity_type: 'species', slug: 'elf-xphb' }
    const blocks = [{ block_key: 'species_core', data: { size: 'M', speed: '30', trait_count: 3 } }]
    const lines = collectionSummaryMetaLines(row, blocks)

    expect(lines).toContain('Size: M')
    expect(lines).toContain('Speed: 30')
    expect(lines).toContain('Traits: 3')
    expect(lines).toContain('Source: XPHB')
    expect(lines.join(' ')).not.toMatch(/[{}]/)
  })

  it('surfaces class hit die/saves/primary ability/source, with primary ability already a clean label (not JSON)', () => {
    const row = { entity_type: 'class', slug: 'fighter-xphb' }
    const blocks = [{
      block_key: 'class_core',
      data: { hit_die: 'd10', saving_throws: 'str, con', primary_ability: 'Strength or Dexterity' }
    }]
    const lines = collectionSummaryMetaLines(row, blocks)

    expect(lines).toContain('Hit Die: d10')
    expect(lines).toContain('Saves: str, con')
    expect(lines).toContain('Primary: Strength or Dexterity')
    expect(lines).toContain('Source: XPHB')
    expect(lines.join(' ')).not.toMatch(/[{}]/)
  })
})
