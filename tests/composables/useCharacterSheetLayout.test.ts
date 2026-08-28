// Unit tests for the tab-normalization helper
// (app/composables/useCharacterSheetLayout.ts), per the approved
// Beautification Pass Phase 4 plan's own testing note. Only
// `normalizeCharacterSheetTab`/`CHARACTER_SHEET_TABS` are exercised here
// -- `useCharacterSheetLayout()` itself calls `useRoute`/`useRouter`,
// which this repo's plain-Vitest setup (no Nuxt auto-import/DOM
// integration, see useCharacterSheetRolls.test.ts's own note) cannot
// provide, and the pure helper is exactly what the reactive `activeTab`
// computed inside that composable delegates to.

import { describe, expect, it } from 'vitest'
import { CHARACTER_SHEET_TABS, normalizeCharacterSheetTab } from '../../app/composables/useCharacterSheetLayout'

describe('normalizeCharacterSheetTab', () => {
  it('defaults to "play" when no tab is given', () => {
    expect(normalizeCharacterSheetTab(undefined)).toBe('play')
    expect(normalizeCharacterSheetTab(null)).toBe('play')
    expect(normalizeCharacterSheetTab('')).toBe('play')
  })

  it('accepts every known tab key', () => {
    for (const tab of CHARACTER_SHEET_TABS) {
      expect(normalizeCharacterSheetTab(tab.key)).toBe(tab.key)
    }
  })

  it('falls back to "play" for an unknown tab', () => {
    expect(normalizeCharacterSheetTab('overview')).toBe('play')
    expect(normalizeCharacterSheetTab('bogus')).toBe('play')
  })

  it('takes the first value when Nuxt hands back a query array (repeated ?tab= params)', () => {
    expect(normalizeCharacterSheetTab(['spells', 'notes'])).toBe('spells')
    expect(normalizeCharacterSheetTab(['bogus', 'notes'])).toBe('play')
  })

  it('CHARACTER_SHEET_TABS has exactly the five approved tabs, in order', () => {
    expect(CHARACTER_SHEET_TABS.map((tab) => tab.key)).toEqual([
      'play', 'character', 'spells', 'inventory', 'notes'
    ])
  })
})
