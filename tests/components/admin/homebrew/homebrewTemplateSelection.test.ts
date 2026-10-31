// Unit tests for app/components/admin/homebrew/homebrewTemplateSelection.ts
// -- the pure discriminated-identity and deep-link preselection/type-
// fallback helpers behind AdminHomebrewForgePanel.vue, added for
// Contextual Homebrew Authoring Entry Points. No DOM/browser harness exists
// in this repo (see worldEntityHomebrewActions.test.ts's header for the
// same note) -- these tests prove the extracted selection logic directly,
// not that the Forge panel's actual UI preselects visually in a browser.

import { describe, expect, it } from 'vitest'
import {
  deriveHomebrewTemplateSelection,
  findInitialHomebrewTemplate,
  resolveInitialHomebrewType
} from '../../../../app/components/admin/homebrew/homebrewTemplateSelection'

describe('deriveHomebrewTemplateSelection', () => {
  it('derives legacy identity from a legacy template row (numeric id, no catalogueRef)', () => {
    const selection = deriveHomebrewTemplateSelection({ id: '1017', source: 'legacy', title: 'Aid' })

    expect(selection).toEqual({ id: '1017', source: 'legacy', catalogueRef: null })
  })

  it('derives Content Pack catalogue identity from a catalogue template row, never parsing the id', () => {
    const selection = deriveHomebrewTemplateSelection({
      id: 'catalogue:eldra.content.srd-5.1:aid-phb',
      source: 'catalogue',
      packageId: 'eldra.content.srd-5.1',
      packageVersion: '1.0.0',
      slug: 'aid-phb',
      title: 'Aid'
    })

    expect(selection).toEqual({
      id: 'catalogue:eldra.content.srd-5.1:aid-phb',
      source: 'catalogue',
      catalogueRef: { packageId: 'eldra.content.srd-5.1', packageVersion: '1.0.0', slug: 'aid-phb' }
    })
  })

  it('treats a missing/unrecognized source as legacy (matches the panel\'s own pre-existing fallback)', () => {
    expect(deriveHomebrewTemplateSelection({ id: '7' }).source).toBe('legacy')
    expect(deriveHomebrewTemplateSelection(null).source).toBe('legacy')
  })
})

describe('findInitialHomebrewTemplate', () => {
  const templates = [
    { id: '10', title: 'Aid', source: 'legacy' },
    { id: 'catalogue:eldra.content.srd-5.1:aid-phb', title: 'Aid', source: 'catalogue', packageId: 'eldra.content.srd-5.1', packageVersion: '1.0.0', slug: 'aid-phb' }
  ]

  it('finds a legacy template by its exact numeric-string id', () => {
    expect(findInitialHomebrewTemplate(templates, '10')).toBe(templates[0])
  })

  it('finds a Content Pack catalogue template by its exact catalogue:<packageId>:<slug> id', () => {
    expect(findInitialHomebrewTemplate(templates, 'catalogue:eldra.content.srd-5.1:aid-phb')).toBe(templates[1])
  })

  it('returns null for an empty/missing initialTemplateId -- the header action must never accidentally preselect a template', () => {
    expect(findInitialHomebrewTemplate(templates, undefined)).toBeNull()
    expect(findInitialHomebrewTemplate(templates, '')).toBeNull()
  })

  it('returns null for a stale/unknown id rather than throwing or fabricating a row', () => {
    expect(findInitialHomebrewTemplate(templates, 'catalogue:eldra.content.srd-5.1:does-not-exist')).toBeNull()
  })
})

describe('resolveInitialHomebrewType', () => {
  const knownTypes = ['spell', 'item', 'enemy', 'species', 'class', 'feat', 'background'] as const

  it('accepts a known type exactly as given', () => {
    expect(resolveInitialHomebrewType('item', knownTypes, 'spell')).toBe('item')
  })

  it('falls back for a missing type (the header action\'s own ?type=spell case still resolves correctly)', () => {
    expect(resolveInitialHomebrewType('', knownTypes, 'spell')).toBe('spell')
    expect(resolveInitialHomebrewType(undefined, knownTypes, 'spell')).toBe('spell')
  })

  it('falls back for an unrecognized/garbage type rather than erroring', () => {
    expect(resolveInitialHomebrewType('monster-truck', knownTypes, 'spell')).toBe('spell')
  })
})
