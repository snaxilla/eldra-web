// Unit tests for app/lib/world-entity-collection/server-meta-lines.ts.
//
// Items Admin Detail Rail Regression -- the reported bug: the item card in
// WorldEntityInteractivePage.vue showed mechanics (Type/Rarity/Damage/...)
// for a catalogue-sourced item (e.g. the XPHB Shortsword), but its own
// detail rail showed only Title/Type/Slug for the exact same item. Root
// cause: `summary=1` entity list responses (server/api/worlds/[id]/
// entities.get.ts) never send `.blocks`, but DO send server-precomputed
// `collectionMetaLines` -- the card read that field first; the rail instead
// read `.blocks` directly (via item_core), which a catalogue-sourced row
// never has, and the richer per-entity fetch is skipped for catalogue rows
// (no backing `entities/:id` row to fetch). The fix makes the rail go
// through the same `serverMetaLines` priority the card already used.
//
// These tests pin exactly that priority: server-provided lines win when
// present (the catalogue-sourced/summary-mode case this bug was about),
// and an empty/absent server field correctly signals "fall back to a
// blocks-derived projection" rather than fabricating anything.

import { describe, expect, it } from 'vitest'
import {
  itemCodeLabel,
  normalizeServerMetaLine,
  readableText,
  serverMetaLines
} from '../../../app/lib/world-entity-collection/server-meta-lines'

describe('serverMetaLines', () => {
  it('returns the server-precomputed lines when present, even with no .blocks on the entity', () => {
    // Shape of a catalogue-sourced row from entities.get.ts's summary=1
    // branch: no `blocks` key at all, but `collectionMetaLines` populated.
    const catalogueSummaryRow = {
      id: 'catalogue:eldra.solaris.xphb:shortsword-xphb',
      title: 'Shortsword',
      entity_type: 'item',
      collectionMetaLines: ['Type: M|XPHB', 'Rarity: None', 'Damage: 1d6 piercing', 'Weight: 2 lb.']
    }

    const lines = serverMetaLines(catalogueSummaryRow, true)

    expect(lines.length).toBeGreaterThan(0)
    expect(lines).toContain('Rarity: None')
    expect(lines).toContain('Damage: 1d6 piercing')
  })

  it('maps a raw item type code line through itemCodeLabel when isItemContext is true', () => {
    const entity = { collectionMetaLines: ['Type: M|XPHB'] }

    const lines = serverMetaLines(entity, true)

    expect(lines).toEqual(['Type: Melee Weapon'])
  })

  it('leaves a Type line untouched when isItemContext is false (e.g. a Spell page)', () => {
    const entity = { collectionMetaLines: ['Type: M|XPHB'] }

    const lines = serverMetaLines(entity, false)

    expect(lines).toEqual(['Type: M|XPHB'])
  })

  it('returns an empty array when the server sent no collectionMetaLines field, signalling the caller to fall back', () => {
    const legacyRowWithOnlyBlocks = {
      id: 42,
      title: 'Homebrew Dagger',
      blocks: [{ block_key: 'item_core', data: { item_type: 'Weapon', damage: '1d4' } }]
    }

    expect(serverMetaLines(legacyRowWithOnlyBlocks, true)).toEqual([])
  })

  it('accepts the snake_case/alternate field names the server/client have both used', () => {
    expect(serverMetaLines({ collection_meta_lines: ['Rarity: Common'] }, true)).toEqual(['Rarity: Common'])
    expect(serverMetaLines({ metaLines: ['Rarity: Common'] }, true)).toEqual(['Rarity: Common'])
    expect(serverMetaLines({ meta_lines: ['Rarity: Common'] }, true)).toEqual(['Rarity: Common'])
  })

  it('filters out blank/object-stringified lines rather than rendering them', () => {
    const entity = { collectionMetaLines: ['', '   ', '[object Object]', 'Damage: 1d6 piercing'] }

    expect(serverMetaLines(entity, true)).toEqual(['Damage: 1d6 piercing'])
  })

  it('returns [] (not a throw) when collectionMetaLines is present but not an array', () => {
    expect(serverMetaLines({ collectionMetaLines: 'not-an-array' }, true)).toEqual([])
  })
})

describe('normalizeServerMetaLine', () => {
  it('passes through a non-Type line unchanged', () => {
    expect(normalizeServerMetaLine('Weight: 2 lb.', true)).toBe('Weight: 2 lb.')
  })

  it('resolves a known 5etools item type code to its display label', () => {
    expect(normalizeServerMetaLine('Type: P|XPHB', true)).toBe('Type: Potion')
  })
})

describe('itemCodeLabel', () => {
  it('maps known 5etools item type codes to display labels', () => {
    expect(itemCodeLabel('M')).toBe('Melee Weapon')
    expect(itemCodeLabel('R|XPHB')).toBe('Ranged Weapon')
    expect(itemCodeLabel('P')).toBe('Potion')
  })

  it('falls back to title-casing the raw value for an unrecognized code', () => {
    expect(itemCodeLabel('some-custom-type')).toBe('Some Custom Type')
  })
})

describe('readableText', () => {
  it('extracts a readable label from a nested object shape', () => {
    expect(readableText({ name: 'Shortsword' })).toBe('Shortsword')
  })

  it('returns an empty string for null/undefined/stringified-object junk', () => {
    expect(readableText(null)).toBe('')
    expect(readableText(undefined)).toBe('')
    expect(readableText('[object Object]')).toBe('')
  })
})
