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
})
