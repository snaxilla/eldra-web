import { describe, expect, it } from 'vitest'
import { canOfferShowBackground, shouldRestoreOnEscape } from '../../../app/lib/eldra/world-show-background'

describe('canOfferShowBackground', () => {
  it('offered when a backdrop is actually showing on an ordinary page', () => {
    expect(canOfferShowBackground(true, 'locations')).toBe(true)
    expect(canOfferShowBackground(true, 'species')).toBe(true)
  })

  it('never offered when there is no resolved backdrop to show', () => {
    expect(canOfferShowBackground(false, 'locations')).toBe(false)
  })

  it('never offered on the Character Sheet, even with a resolved backdrop -- the owner\'s explicit exclusion', () => {
    expect(canOfferShowBackground(true, 'character-sheet')).toBe(false)
  })

  it('the World Map never reaches this at all in practice (hasPageBackdrop is already false there), but is harmless either way', () => {
    expect(canOfferShowBackground(false, 'world-map')).toBe(false)
  })
})

describe('shouldRestoreOnEscape', () => {
  it('restores on a bare Escape with nothing else open', () => {
    expect(shouldRestoreOnEscape('Escape', false)).toBe(true)
  })

  it('never restores while another dialog/picker is already open', () => {
    expect(shouldRestoreOnEscape('Escape', true)).toBe(false)
  })

  it('ignores every other key', () => {
    expect(shouldRestoreOnEscape('Enter', false)).toBe(false)
    expect(shouldRestoreOnEscape('a', false)).toBe(false)
  })
})
