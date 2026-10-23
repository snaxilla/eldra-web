import { describe, expect, it } from 'vitest'
import { heroHighlights } from '../../../app/lib/characters/creator-hero'
import type { PresentationEntry } from '../../../app/lib/content-presentation'

const base = { sourceBook: 'XPHB', notes: [] as string[] }

describe('heroHighlights', () => {
  it('returns nothing for no entry', () => {
    expect(heroHighlights(null)).toEqual({ summary: null, traits: [], facts: [] })
  })

  it('uses section titles as granted traits for a species, capped and de-duplicated', () => {
    const entry: PresentationEntry = {
      ...base, kind: 'species', name: 'Aasimar',
      description: ['', 'Mortals with a spark.'],
      facts: [{ label: 'Size', value: 'Medium' }, { label: 'Speed', value: '' }, { label: 'Senses', value: 'Darkvision 60 ft.' }],
      sections: [
        { title: 'Celestial Resistance', paragraphs: [] },
        { title: 'celestial resistance', paragraphs: [] },
        { title: 'Healing Hands', paragraphs: [] },
        { title: 'Starting Equipment (x)', paragraphs: [] }
      ]
    }
    const h = heroHighlights(entry)
    expect(h.summary).toBe('Mortals with a spark.')
    expect(h.traits).toEqual(['Celestial Resistance', 'Healing Hands'])
    expect(h.facts.map((f) => f.label)).toEqual(['Size', 'Senses'])
  })

  it('reads a class\'s level-1 features from its Class Features section', () => {
    const entry: PresentationEntry = {
      ...base, kind: 'class', name: 'Monk', description: [], facts: [],
      sections: [{ title: 'Class Features', paragraphs: ['Level 1: Martial Arts, Unarmored Defense', 'Level 2: Ki'] }]
    }
    expect(heroHighlights(entry).traits).toEqual(['Martial Arts', 'Unarmored Defense'])
  })

  it('limits facts to four', () => {
    const entry: PresentationEntry = {
      ...base, kind: 'class', name: 'X', description: [], sections: [],
      facts: Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, value: 'v' }))
    }
    expect(heroHighlights(entry).facts).toHaveLength(4)
  })
})
