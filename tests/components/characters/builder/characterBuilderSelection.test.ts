// Unit tests for app/components/characters/builder/characterBuilderSelection.ts
// -- the pure selection/validation logic behind Character Builder V2
// (create-v2.vue + CharacterBuilderOptionPicker.vue).
//
// The fixture deliberately reproduces the dataset fact that makes this hard,
// and which the previous Builder got wrong: a World with BOTH SRD 5.1 and
// XPHB bound has two "Human" species and two "Fighter" classes, identical in
// title, distinguished only by (packageId, slug). Matching on slug alone can
// resolve to the wrong pack's entry.

import { describe, expect, it } from 'vitest'
import {
  CHOICE_KEYS,
  STEP_KEYS,
  emptyDraft,
  filterOptions,
  findOptionByKey,
  hasAmbiguousTitles,
  isSelectionHidden,
  isDraftComplete,
  isStepComplete,
  missingRequirements,
  nextStep,
  optionKey,
  previousStep,
  toCreatePayload,
  type BuilderCatalogueEntry,
  type CharacterBuilderDraft
} from '../../../../app/components/characters/builder/characterBuilderSelection'

function entry(overrides: Partial<BuilderCatalogueEntry> = {}): BuilderCatalogueEntry {
  return {
    packageId: 'eldra.content.xphb',
    packageVersion: '1.0.0',
    systemKey: 'dnd5e',
    title: 'Human',
    slug: 'human-xphb',
    externalId: 'Human__XPHB',
    provider: '5etools-json',
    sourceBook: 'XPHB',
    sourcePage: '194',
    ...overrides
  }
}

const SRD_HUMAN = entry({
  packageId: 'eldra.content.srd-5.1',
  title: 'Human',
  slug: 'human-phb',
  externalId: 'Human__PHB',
  sourceBook: 'PHB'
})
const XPHB_HUMAN = entry()
const XPHB_ELF = entry({ title: 'Elf', slug: 'elf-xphb', externalId: 'Elf__XPHB' })
const XPHB_FIGHTER = entry({ title: 'Fighter', slug: 'fighter-xphb', externalId: 'Fighter__XPHB' })
const XPHB_ACOLYTE = entry({ title: 'Acolyte', slug: 'acolyte-xphb', externalId: 'Acolyte__XPHB' })

function completeDraft(): CharacterBuilderDraft {
  return { name: 'Aria', species: XPHB_HUMAN, class: XPHB_FIGHTER, background: XPHB_ACOLYTE }
}

describe('optionKey -- composite identity', () => {
  it('joins packageId and slug, matching what the save route resolves on', () => {
    expect(optionKey(XPHB_HUMAN)).toBe('eldra.content.xphb::human-xphb')
  })

  it('distinguishes two same-titled entries from different packs', () => {
    expect(optionKey(SRD_HUMAN)).not.toBe(optionKey(XPHB_HUMAN))
  })

  it('is empty for a null/undefined selection', () => {
    expect(optionKey(null)).toBe('')
    expect(optionKey(undefined)).toBe('')
  })
})

describe('findOptionByKey', () => {
  const options = [SRD_HUMAN, XPHB_HUMAN, XPHB_ELF]

  it('resolves the exact pack entry, never merely the first title match', () => {
    expect(findOptionByKey(options, optionKey(XPHB_HUMAN))).toBe(XPHB_HUMAN)
    expect(findOptionByKey(options, optionKey(SRD_HUMAN))).toBe(SRD_HUMAN)
  })

  it('returns null for an unknown or empty key', () => {
    expect(findOptionByKey(options, 'eldra.content.nope::human-xphb')).toBeNull()
    expect(findOptionByKey(options, '')).toBeNull()
  })
})

describe('filterOptions -- search', () => {
  const options = [SRD_HUMAN, XPHB_HUMAN, XPHB_ELF]

  it('returns everything for an empty or whitespace query', () => {
    expect(filterOptions(options, '')).toHaveLength(3)
    expect(filterOptions(options, '   ')).toHaveLength(3)
  })

  it('matches on title, case-insensitively', () => {
    expect(filterOptions(options, 'elf').map((o) => o.title)).toEqual(['Elf'])
    expect(filterOptions(options, 'ELF').map((o) => o.title)).toEqual(['Elf'])
  })

  it('matches on source book, so a player can narrow to one book', () => {
    expect(filterOptions(options, 'xphb')).toHaveLength(2)
    expect(filterOptions(options, 'phb')).toHaveLength(3)
  })

  it('AND-matches multiple terms in any order -- "human xphb" finds only the XPHB Human', () => {
    expect(filterOptions(options, 'human xphb')).toEqual([XPHB_HUMAN])
    expect(filterOptions(options, 'xphb human')).toEqual([XPHB_HUMAN])
  })

  it('returns nothing when no option matches', () => {
    expect(filterOptions(options, 'tiefling')).toEqual([])
  })

  it('never mutates the input array', () => {
    const original = [...options]
    filterOptions(options, 'elf')
    expect(options).toEqual(original)
  })
})

describe('isSelectionHidden -- a search must not look like it cleared the choice', () => {
  const options = [SRD_HUMAN, XPHB_HUMAN, XPHB_ELF]

  it('is true when the chosen option is filtered out of the visible list', () => {
    const visible = filterOptions(options, 'elf')
    expect(isSelectionHidden(visible, optionKey(SRD_HUMAN))).toBe(true)
  })

  it('is false when the chosen option is still visible', () => {
    const visible = filterOptions(options, 'human xphb')
    expect(isSelectionHidden(visible, optionKey(XPHB_HUMAN))).toBe(false)
  })

  it('is false when no search is active, since everything is visible', () => {
    const visible = filterOptions(options, '')
    expect(isSelectionHidden(visible, optionKey(SRD_HUMAN))).toBe(false)
  })

  it('is false while nothing is chosen', () => {
    expect(isSelectionHidden(filterOptions(options, 'elf'), '')).toBe(false)
  })

  it('distinguishes the two same-titled Humans -- hiding one does not mask the other', () => {
    const visible = filterOptions(options, 'human xphb')
    expect(isSelectionHidden(visible, optionKey(XPHB_HUMAN))).toBe(false)
    expect(isSelectionHidden(visible, optionKey(SRD_HUMAN))).toBe(true)
  })
})

describe('hasAmbiguousTitles', () => {
  it('is true when two packs contribute the same title', () => {
    expect(hasAmbiguousTitles([SRD_HUMAN, XPHB_HUMAN, XPHB_ELF])).toBe(true)
  })

  it('is false when every title is distinct', () => {
    expect(hasAmbiguousTitles([XPHB_HUMAN, XPHB_ELF])).toBe(false)
  })

  it('is false for an empty catalogue', () => {
    expect(hasAmbiguousTitles([])).toBe(false)
  })
})

describe('validation', () => {
  it('an empty draft is incomplete and reports every requirement', () => {
    const draft = emptyDraft()
    expect(isDraftComplete(draft)).toBe(false)
    expect(missingRequirements(draft)).toEqual([
      'Enter a character name.',
      'Choose a Species.',
      'Choose a Class.',
      'Choose a Background.'
    ])
  })

  it('a whitespace-only name does not satisfy the name requirement', () => {
    const draft = { ...completeDraft(), name: '   ' }
    expect(isDraftComplete(draft)).toBe(false)
    expect(missingRequirements(draft)).toEqual(['Enter a character name.'])
  })

  it('a fully populated draft is complete with nothing outstanding', () => {
    const draft = completeDraft()
    expect(isDraftComplete(draft)).toBe(true)
    expect(missingRequirements(draft)).toEqual([])
  })

  it('reports only the genuinely missing choice', () => {
    const draft = { ...completeDraft(), class: null }
    expect(missingRequirements(draft)).toEqual(['Choose a Class.'])
  })

  it('isStepComplete tracks each step independently', () => {
    const draft = { ...emptyDraft(), name: 'Aria', species: XPHB_HUMAN }
    expect(isStepComplete(draft, 'identity')).toBe(true)
    expect(isStepComplete(draft, 'species')).toBe(true)
    expect(isStepComplete(draft, 'class')).toBe(false)
    expect(isStepComplete(draft, 'review')).toBe(false)
  })
})

describe('toCreatePayload', () => {
  it('sends only (packageId, slug) per choice -- the fields the save route actually reads', () => {
    expect(toCreatePayload(completeDraft())).toEqual({
      title: 'Aria',
      species: { packageId: 'eldra.content.xphb', slug: 'human-xphb' },
      class: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' },
      background: { packageId: 'eldra.content.xphb', slug: 'acolyte-xphb' }
    })
  })

  it('trims the submitted name', () => {
    expect(toCreatePayload({ ...completeDraft(), name: '  Aria  ' })?.title).toBe('Aria')
  })

  it('carries the SRD pack id when the SRD Human is the one chosen', () => {
    const payload = toCreatePayload({ ...completeDraft(), species: SRD_HUMAN })
    expect(payload?.species).toEqual({ packageId: 'eldra.content.srd-5.1', slug: 'human-phb' })
  })

  it('refuses to build a payload from an incomplete draft', () => {
    expect(toCreatePayload(emptyDraft())).toBeNull()
    expect(toCreatePayload({ ...completeDraft(), background: null })).toBeNull()
  })
})

describe('step navigation', () => {
  it('walks the full step order forwards and backwards', () => {
    expect(STEP_KEYS).toEqual(['identity', 'species', 'class', 'background', 'review'])
    expect(nextStep('identity')).toBe('species')
    expect(nextStep('background')).toBe('review')
    expect(previousStep('species')).toBe('identity')
  })

  it('stops at both ends rather than wrapping', () => {
    expect(nextStep('review')).toBeNull()
    expect(previousStep('identity')).toBeNull()
  })

  it('CHOICE_KEYS covers exactly the three catalogue-backed steps', () => {
    expect(CHOICE_KEYS).toEqual(['species', 'class', 'background'])
  })
})
