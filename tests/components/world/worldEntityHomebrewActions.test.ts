// Unit tests for app/components/world/worldEntityHomebrewActions.ts -- the
// pure authorization-gating and route-building helpers behind the
// Contextual Homebrew Authoring Entry Points added to the Spells page
// (header "Create New Spell from Template" action, per-card
// "Create New Spell From: ..." action). WorldEntityInteractivePage.vue
// itself has no DOM/browser test harness in this repo (no @vue/test-utils,
// no jsdom/happy-dom dependency), so this is the established pattern
// (see tests/components/admin/content-packs/* for the sibling-file
// precedent) for testing logic extracted out of a .vue file: it proves the
// gating/route-payload logic directly, not that the actual <button> v-if
// renders in a browser -- that remains an unverified visual check, called
// out explicitly in the final report.

import { describe, expect, it } from 'vitest'
import { buildHomebrewForgeRoute, shouldShowSpellHomebrewActions } from '../../../app/components/world/worldEntityHomebrewActions'

describe('shouldShowSpellHomebrewActions', () => {
  it('shows the actions for a GameMaster/Admin on the Spells page', () => {
    expect(shouldShowSpellHomebrewActions('spell', ['world.homebrew.manage', 'world.entity.edit'])).toBe(true)
  })

  it('is case/whitespace-insensitive on entityType, matching this component\'s own normalizeEntityType', () => {
    expect(shouldShowSpellHomebrewActions(' Spell ', ['world.homebrew.manage'])).toBe(true)
  })

  it('hides the actions for an ordinary player (no world.homebrew.manage capability) even on the Spells page', () => {
    expect(shouldShowSpellHomebrewActions('spell', ['world.entity.view'])).toBe(false)
  })

  it('hides the actions when capabilities is missing/not an array (unauthenticated or still loading)', () => {
    expect(shouldShowSpellHomebrewActions('spell', undefined)).toBe(false)
    expect(shouldShowSpellHomebrewActions('spell', null)).toBe(false)
  })

  it('hides the actions on every non-Spell asset page for an otherwise-authorized GM/Admin', () => {
    const capabilities = ['world.homebrew.manage']

    expect(shouldShowSpellHomebrewActions('item', capabilities)).toBe(false)
    expect(shouldShowSpellHomebrewActions('species', capabilities)).toBe(false)
    expect(shouldShowSpellHomebrewActions('class', capabilities)).toBe(false)
    expect(shouldShowSpellHomebrewActions('feat', capabilities)).toBe(false)
    expect(shouldShowSpellHomebrewActions('enemy', capabilities)).toBe(false)
    expect(shouldShowSpellHomebrewActions('character', capabilities)).toBe(false)
    expect(shouldShowSpellHomebrewActions('location', capabilities)).toBe(false)
  })
})

describe('buildHomebrewForgeRoute', () => {
  it('builds the header action\'s target: Spell type selected, no templateId key at all', () => {
    const route = buildHomebrewForgeRoute('42')

    expect(route.path).toBe('/worlds/42/homebrew/create')
    expect(route.query).toEqual({ type: 'spell' })
    expect('templateId' in route.query).toBe(false)
  })

  it('builds the per-card action\'s target for a legacy (numeric) template id', () => {
    const route = buildHomebrewForgeRoute('42', 1017)

    expect(route.query).toEqual({ type: 'spell', templateId: '1017' })
  })

  it('builds the per-card action\'s target for a Content Pack catalogue template id, preserved verbatim', () => {
    const route = buildHomebrewForgeRoute('42', 'catalogue:eldra.content.srd-5.1:aid-phb')

    expect(route.query).toEqual({ type: 'spell', templateId: 'catalogue:eldra.content.srd-5.1:aid-phb' })
  })

  it('omits templateId for an empty/whitespace-only id rather than sending a blank query param', () => {
    expect('templateId' in buildHomebrewForgeRoute('42', '').query).toBe(false)
    expect('templateId' in buildHomebrewForgeRoute('42', '   ').query).toBe(false)
  })
})
