// Unit tests for app/components/admin/content-packs/contentPackBuilderSelection.ts
// -- the pure selection-state helpers behind AdminContentPackBuilderPanel.vue's
// Step 6 dynamic-category rework (see
// .github/docs/architecture/content-source-architecture.md). Category keys
// are deliberately arbitrary strings throughout these tests (including an
// XMM-shaped "monsters"-only preview) to prove nothing here assumes the old
// fixed six-key union.

import { describe, expect, it } from 'vitest'
import {
  countSelected,
  replaceCategorySelection,
  selectionFromCategories,
  selectionToPayload,
  toggleEntrySelection,
  totalSelected
} from '../../../../app/components/admin/content-packs/contentPackBuilderSelection'

describe('selectionFromCategories -- default selection on Generate Preview', () => {
  it('selects every entry across arbitrary category keys (SRD/XPHB-shaped, six categories)', () => {
    const selection = selectionFromCategories([
      { key: 'species', entries: [{ externalId: 'human' }, { externalId: 'elf' }] },
      { key: 'classes', entries: [{ externalId: 'fighter' }] }
    ])

    expect(selection.species?.size).toBe(2)
    expect(selection.species?.has('human')).toBe(true)
    expect(selection.classes?.has('fighter')).toBe(true)
  })

  it('selects every entry for a single-category, non-5e-shaped preview (future XMM: monsters only)', () => {
    const selection = selectionFromCategories([
      { key: 'monsters', entries: [{ externalId: 'goblin' }, { externalId: 'owlbear' }] }
    ])

    expect(Object.keys(selection)).toEqual(['monsters'])
    expect(selection.monsters?.size).toBe(2)
  })

  it('produces an empty set (not a missing key) for a category with no entries', () => {
    const selection = selectionFromCategories([{ key: 'feats', entries: [] }])
    expect(selection.feats).toBeInstanceOf(Set)
    expect(selection.feats?.size).toBe(0)
  })

  it('returns an empty selection for zero categories', () => {
    expect(selectionFromCategories([])).toEqual({})
  })
})

describe('toggleEntrySelection', () => {
  it('deselects a currently-selected entry', () => {
    const selection = selectionFromCategories([{ key: 'spells', entries: [{ externalId: 'fireball' }] }])
    const next = toggleEntrySelection(selection, 'spells', 'fireball')
    expect(next.spells?.has('fireball')).toBe(false)
  })

  it('selects a currently-unselected entry', () => {
    const selection = { spells: new Set<string>() }
    const next = toggleEntrySelection(selection, 'spells', 'fireball')
    expect(next.spells?.has('fireball')).toBe(true)
  })

  it('does not mutate the input selection (immutable update)', () => {
    const selection = selectionFromCategories([{ key: 'spells', entries: [{ externalId: 'fireball' }] }])
    toggleEntrySelection(selection, 'spells', 'fireball')
    expect(selection.spells?.has('fireball')).toBe(true)
  })

  it('leaves other categories untouched', () => {
    const selection = selectionFromCategories([
      { key: 'spells', entries: [{ externalId: 'fireball' }] },
      { key: 'items', entries: [{ externalId: 'longsword' }] }
    ])
    const next = toggleEntrySelection(selection, 'spells', 'fireball')
    expect(next.items).toBe(selection.items)
  })
})

describe('replaceCategorySelection -- Select All / Deselect All', () => {
  it('Select All: replaces a category with every provided externalId', () => {
    const selection = { items: new Set<string>() }
    const next = replaceCategorySelection(selection, 'items', ['longsword', 'shield'])
    expect(next.items).toEqual(new Set(['longsword', 'shield']))
  })

  it('Deselect All: replaces a category with an empty set', () => {
    const selection = { items: new Set(['longsword', 'shield']) }
    const next = replaceCategorySelection(selection, 'items', [])
    expect(next.items?.size).toBe(0)
  })

  it('only affects the named category', () => {
    const selection = { items: new Set(['longsword']), spells: new Set(['fireball']) }
    const next = replaceCategorySelection(selection, 'items', [])
    expect(next.spells).toEqual(new Set(['fireball']))
  })
})

describe('countSelected / totalSelected', () => {
  it('countSelected reads one category, 0 for an unknown key', () => {
    const selection = { items: new Set(['longsword', 'shield']) }
    expect(countSelected(selection, 'items')).toBe(2)
    expect(countSelected(selection, 'monsters')).toBe(0)
  })

  it('totalSelected sums across an arbitrary number of categories', () => {
    const selection = {
      species: new Set(['human']),
      classes: new Set(['fighter', 'wizard']),
      monsters: new Set<string>()
    }
    expect(totalSelected(selection)).toBe(3)
  })

  it('totalSelected is 0 for an empty selection', () => {
    expect(totalSelected({})).toBe(0)
  })
})

describe('selectionToPayload -- Publish body', () => {
  it('converts every category to a plain string array, preserving arbitrary category names', () => {
    const selection = {
      monsters: new Set(['goblin', 'owlbear']),
      'future-category': new Set(['whatever'])
    }
    const payload = selectionToPayload(selection)

    expect(payload).toEqual({
      monsters: ['goblin', 'owlbear'],
      'future-category': ['whatever']
    })
  })

  it('includes categories with an empty set as an empty array, not omitted', () => {
    const payload = selectionToPayload({ feats: new Set() })
    expect(payload).toEqual({ feats: [] })
  })

  it('round-trips selectionFromCategories -> selectionToPayload for a six-category SRD/XPHB-shaped preview', () => {
    const categories = [
      { key: 'species', entries: [{ externalId: 'human' }] },
      { key: 'classes', entries: [{ externalId: 'fighter' }] },
      { key: 'backgrounds', entries: [{ externalId: 'acolyte' }] },
      { key: 'feats', entries: [] },
      { key: 'items', entries: [{ externalId: 'longsword' }, { externalId: 'shield' }] },
      { key: 'spells', entries: [{ externalId: 'fireball' }] }
    ]

    const payload = selectionToPayload(selectionFromCategories(categories))

    expect(payload).toEqual({
      species: ['human'],
      classes: ['fighter'],
      backgrounds: ['acolyte'],
      feats: [],
      items: ['longsword', 'shield'],
      spells: ['fireball']
    })
  })
})
