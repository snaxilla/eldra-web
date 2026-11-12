// Unit tests for the Game Admin IA (app/components/admin/gameAdminSections.ts)
// -- Process 2.0: GAME ADMIN IA & PLAYER OPERATIONS. This repo has no
// component-rendering test harness, so this is the real proof that the
// agreed rail order/labels/key-mapping are exactly what was agreed, not
// just what admin.vue's own template happens to render today.

import { describe, expect, it } from 'vitest'
import { GAME_ADMIN_SECTIONS, type GameAdminPanelKey } from '../../../app/components/admin/gameAdminSections'

describe('GAME_ADMIN_SECTIONS', () => {
  it('is exactly the eleven agreed sections, in the agreed order, with the agreed labels', () => {
    expect(GAME_ADMIN_SECTIONS.map((section) => ({ key: section.key, label: section.label }))).toEqual([
      { key: 'overview', label: 'Overview' },
      { key: 'player', label: 'Player Management' },
      { key: 'inventory', label: 'Inventory Management' },
      { key: 'homebrew', label: 'Homebrew Lab' },
      { key: 'accounts', label: 'User Accounts' },
      { key: 'relationships', label: 'Relationships' },
      { key: 'rules', label: 'Rules' },
      { key: 'content-packs', label: 'Content Packs' },
      { key: 'content-studio', label: 'Content Studio' },
      { key: 'health', label: 'Project Health' },
      { key: 'setup', label: 'Page Setup' }
    ])
  })

  it('has exactly eleven sections -- Grants and Transfers merged into one, never left as two, plus Content Studio', () => {
    expect(GAME_ADMIN_SECTIONS).toHaveLength(11)
  })

  it('every key is unique -- no section collides with another in the v-else-if chain it drives', () => {
    const keys = GAME_ADMIN_SECTIONS.map((section) => section.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every section carries a real icon -- never falls back to AdminSectionRail.vue\'s own default silently', () => {
    for (const section of GAME_ADMIN_SECTIONS) {
      expect(section.icon).toBeTruthy()
    }
  })

  // The exact renames this task asked for, each checked individually so a future
  // accidental revert of just one (e.g. "Player Management" quietly drifting back
  // to "Party / Cast") fails here instead of only being caught by eye in review.
  it('renames Party/Cast to Player Management', () => {
    expect(GAME_ADMIN_SECTIONS.find((s) => s.key === 'player')?.label).toBe('Player Management')
  })

  it('renames Members to User Accounts', () => {
    expect(GAME_ADMIN_SECTIONS.find((s) => s.key === 'accounts')?.label).toBe('User Accounts')
  })

  it('renames Homebrew to Homebrew Lab', () => {
    expect(GAME_ADMIN_SECTIONS.find((s) => s.key === 'homebrew')?.label).toBe('Homebrew Lab')
  })

  it('merges Grants and Transfers into one Inventory Management section -- neither survives as its own key', () => {
    const keys = GAME_ADMIN_SECTIONS.map((s) => s.key)
    expect(keys).toContain('inventory')
    expect(keys).not.toContain('grants')
    expect(keys).not.toContain('transfers')
  })

  it('leaves Overview, Relationships, Rules, Content Packs, Project Health, and Page Setup as their own separate sections', () => {
    const untouched: GameAdminPanelKey[] = ['overview', 'relationships', 'rules', 'content-packs', 'health', 'setup']
    for (const key of untouched) {
      expect(GAME_ADMIN_SECTIONS.some((s) => s.key === key)).toBe(true)
    }
  })
})
