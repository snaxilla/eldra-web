// Unit tests for the section model in app/composables/useCharacterSheetLayout.ts
// (Phase 4B). Only the pure helpers are exercised -- `useCharacterSheetLayout()`
// itself calls `useRoute`/`useRouter`, which this repo's plain-Vitest setup
// cannot provide, and its reactive `activeTab` delegates to these helpers.

import { describe, expect, it } from 'vitest'
import {
  CHARACTER_SHEET_SECTIONS,
  availableCharacterSheetSections,
  normalizeCharacterSheetTab
} from '../../app/composables/useCharacterSheetLayout'

describe('normalizeCharacterSheetTab', () => {
  it('defaults to "actions" when no tab is given', () => {
    expect(normalizeCharacterSheetTab(undefined)).toBe('actions')
    expect(normalizeCharacterSheetTab(null)).toBe('actions')
    expect(normalizeCharacterSheetTab('')).toBe('actions')
  })

  it('accepts every known section key', () => {
    for (const section of CHARACTER_SHEET_SECTIONS) {
      expect(normalizeCharacterSheetTab(section.key)).toBe(section.key)
    }
  })

  it('keeps the five-tab era deep links working through aliases', () => {
    expect(normalizeCharacterSheetTab('play')).toBe('actions')
    expect(normalizeCharacterSheetTab('character')).toBe('features')
    expect(normalizeCharacterSheetTab('spells')).toBe('spells')
    expect(normalizeCharacterSheetTab('inventory')).toBe('inventory')
    expect(normalizeCharacterSheetTab('notes')).toBe('notes')
  })

  it('falls back to "actions" for an unknown tab', () => {
    expect(normalizeCharacterSheetTab('overview')).toBe('actions')
  })

  it('takes the first value when Nuxt hands back a query array (repeated ?tab= params)', () => {
    expect(normalizeCharacterSheetTab(['spells', 'notes'])).toBe('spells')
    expect(normalizeCharacterSheetTab(['play', 'notes'])).toBe('actions')
  })
})

describe('CHARACTER_SHEET_SECTIONS', () => {
  it('orders sections Stats, Actions, Spells, Inventory first', () => {
    expect(CHARACTER_SHEET_SECTIONS.map((section) => section.key)).toEqual([
      'stats', 'actions', 'spells', 'inventory', 'skills', 'features', 'notes', 'details'
    ])
  })

  it('places only Stats and Skills in the reference columns', () => {
    expect(CHARACTER_SHEET_SECTIONS.filter((section) => section.placement === 'reference').map((section) => section.key))
      .toEqual(['stats', 'skills'])
  })
})

describe('availableCharacterSheetSections', () => {
  it('drops a section the character does not have, keeping order', () => {
    expect(availableCharacterSheetSections({ spells: false, skills: false }).map((section) => section.key)).toEqual([
      'stats', 'actions', 'inventory', 'features', 'notes', 'details'
    ])
  })

  it('keeps every section the page does not rule out', () => {
    expect(availableCharacterSheetSections({})).toHaveLength(CHARACTER_SHEET_SECTIONS.length)
  })
})
