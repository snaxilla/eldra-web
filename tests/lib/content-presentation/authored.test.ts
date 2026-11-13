import { describe, expect, it } from 'vitest'
import { hasAuthoredOverride, mergeAuthoredPresentation, type AuthoredPresentation } from '../../../app/lib/content-presentation/authored'
import type { PresentationEntry } from '../../../app/lib/content-presentation/types'

const SOURCE: PresentationEntry = {
  kind: 'item',
  name: 'Shortsword',
  description: ['A light, finesse blade.'],
  facts: [{ label: 'Damage', value: '1d6 piercing' }],
  sections: [],
  notes: [],
  sourceBook: 'XPHB',
  image: { url: '/api/5etools-img/shortsword.webp' }
}

describe('mergeAuthoredPresentation', () => {
  it('an absent key inherits the source-resolved value -- no authored opinion', () => {
    const merged = mergeAuthoredPresentation(SOURCE, {})
    expect(merged).toEqual(SOURCE)
  })

  it('a present key wins over the source-resolved value', () => {
    const overrides: AuthoredPresentation = { name: 'Fine Shortsword' }
    const merged = mergeAuthoredPresentation(SOURCE, overrides)
    expect(merged?.name).toBe('Fine Shortsword')
    expect(merged?.description).toEqual(SOURCE.description) // untouched
  })

  it('image: null is an explicit suppression -- effective image is none, not source image', () => {
    const merged = mergeAuthoredPresentation(SOURCE, { image: null }, { image: null })
    expect(merged?.image).toBeNull()
  })

  it('an authored image ref resolved to a value wins over the source image', () => {
    const merged = mergeAuthoredPresentation(SOURCE, { image: { kind: 'media', fileId: 'f1' } }, { image: { url: '/api/assets/f1' } })
    expect(merged?.image).toEqual({ url: '/api/assets/f1' })
  })

  it('image key absent inherits the source image untouched', () => {
    const merged = mergeAuthoredPresentation(SOURCE, {})
    expect(merged?.image).toEqual(SOURCE.image)
  })

  it('a null fromSource with no overrides is null -- "no details published" is preserved', () => {
    expect(mergeAuthoredPresentation(null, {})).toBeNull()
  })

  it('a null fromSource with authored fields forms the entry from authored fields alone', () => {
    const merged = mergeAuthoredPresentation(null, { name: 'Authored Original', description: ['Hand-written.'] })
    expect(merged).toMatchObject({ name: 'Authored Original', description: ['Hand-written.'], facts: [], sections: [], notes: [] })
  })

  it('merges every documented presentation field independently', () => {
    const overrides: AuthoredPresentation = {
      description: ['New description.'],
      sections: [{ title: 'Lore', paragraphs: ['...'] }],
      notes: ['Note.'],
      facts: [{ label: 'Weight', value: '2 lb' }],
      sourceBook: 'Homebrew',
      sourcePage: '1'
    }
    const merged = mergeAuthoredPresentation(SOURCE, overrides)
    expect(merged).toMatchObject({
      name: SOURCE.name,
      description: ['New description.'],
      sections: [{ title: 'Lore', paragraphs: ['...'] }],
      notes: ['Note.'],
      facts: [{ label: 'Weight', value: '2 lb' }],
      sourceBook: 'Homebrew',
      sourcePage: '1'
    })
  })
})

describe('hasAuthoredOverride', () => {
  it('is false for an empty overlay', () => {
    expect(hasAuthoredOverride({})).toBe(false)
  })

  it('is true once any key is present, including an explicit null', () => {
    expect(hasAuthoredOverride({ image: null })).toBe(true)
    expect(hasAuthoredOverride({ name: 'X' })).toBe(true)
  })
})
