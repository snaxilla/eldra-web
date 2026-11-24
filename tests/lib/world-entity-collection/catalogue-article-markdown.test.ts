// Unit tests for app/lib/world-entity-collection/catalogue-article-markdown.ts
// -- Species/Class Context Content pass, owner follow-up ("useful content"
// gap). These functions are a verbatim relocation of what
// WorldEntityInteractivePage.vue's buildClassArticleMarkdown/
// buildSpeciesArticleMarkdown already did (pre-existing, already-correct
// behavior) -- the tests below cover that behavior directly from blocks,
// since it is now also the thing server/api/worlds/[id]/entities.get.ts
// depends on to fill the rail's Summary for species/class rows.

import { describe, expect, it } from 'vitest'
import {
  blockByKey,
  buildClassArticleMarkdownFromBlocks,
  buildSpeciesArticleMarkdownFromBlocks,
  clean5eText,
  formatChoiceList,
  formatClassFeatureRef,
  formatEntriesAsMarkdown,
  importSourceRawJson
} from '../../../app/lib/world-entity-collection/catalogue-article-markdown'

describe('blockByKey / importSourceRawJson', () => {
  it('finds a block by either block_key (server row shape) or blockKey (client preview shape)', () => {
    const blocks = [{ block_key: 'species_core', data: { name: 'Elf' } }]
    expect(blockByKey(blocks, 'species_core')?.data?.name).toBe('Elf')

    const clientBlocks = [{ blockKey: 'species_core', data: { name: 'Elf' } }]
    expect(blockByKey(clientBlocks, 'species_core')?.data?.name).toBe('Elf')
  })

  it('returns null for a missing block or an empty/undefined blocks array', () => {
    expect(blockByKey([], 'species_core')).toBeNull()
    expect(blockByKey(undefined, 'species_core')).toBeNull()
    expect(blockByKey([{ block_key: 'other', data: {} }], 'species_core')).toBeNull()
  })

  it('reads raw_json off the import_source block, or null if absent', () => {
    const blocks = [{ block_key: 'import_source', data: { raw_json: { name: 'Elf' } } }]
    expect(importSourceRawJson(blocks)).toEqual({ name: 'Elf' })
    expect(importSourceRawJson([])).toBeNull()
  })
})

describe('clean5eText', () => {
  it('strips {@tag Display|Source} markup down to its display segment', () => {
    expect(clean5eText('You have {@sense Darkvision|XPHB} out to 60 feet.')).toBe(
      'You have Darkvision out to 60 feet.'
    )
  })

  it('strips a 3-part {@tag Name|Source|Display} tag down to its FIRST segment (not the display text)', () => {
    // clean5eText (the simpler, pre-existing Vue-local cleaner this module
    // relocates verbatim) always keeps the first `|`-segment -- unlike
    // content-presentation/dnd5e.ts's own cleanText, it has no
    // DISPLAY_OVERRIDE_TAGS awareness. Captured as-is since this is
        // existing, already-shipped behavior for the Class Features/Starting
    // Equipment sections, not something this pass changed.
    expect(clean5eText('{@variantrule Long Rest|XPHB|a long rest}')).toBe('Long Rest')
  })

  it('collapses whitespace and trims', () => {
    expect(clean5eText('  a   b\n\nc  ')).toBe('a b c')
  })

  it('returns an empty string for null/undefined', () => {
    expect(clean5eText(null)).toBe('')
    expect(clean5eText(undefined)).toBe('')
  })
})

describe('formatEntriesAsMarkdown', () => {
  it('renders a named { name, entries } section as a heading plus cleaned body text', () => {
    const result = formatEntriesAsMarkdown({
      name: 'Keen Senses',
      entries: ['You have proficiency in the {@skill Insight|XPHB} skill.']
    })
    expect(result).toContain('## Keen Senses')
    expect(result).toContain('You have proficiency in the Insight skill.')
    expect(result).not.toContain('{@')
  })

  it('flattens an array of mixed strings and named sections', () => {
    const result = formatEntriesAsMarkdown(['Intro prose.', { name: 'Detail', entries: ['More.'] }])
    expect(result).toBe('Intro prose.\n\n## Detail\n\nMore.')
  })
})

describe('formatClassFeatureRef / formatChoiceList', () => {
  it('reads a pipe-delimited classFeature reference string, with level when present', () => {
    expect(formatClassFeatureRef('Rage|Barbarian||1')).toBe('Level 1: Rage')
    expect(formatClassFeatureRef('Rage|Barbarian')).toBe('Rage')
  })

  it('joins a choice-set { from: [...] } into a comma-separated list', () => {
    expect(formatChoiceList({ from: ['Acrobatics', 'Athletics'] })).toBe('Acrobatics, Athletics')
  })

  it('joins an array of choice values', () => {
    expect(formatChoiceList(['str', 'dex'])).toBe('str, dex')
  })
})

describe('buildClassArticleMarkdownFromBlocks', () => {
  function classBlocks(raw: any) {
    return [{ block_key: 'import_source', data: { raw_json: raw } }]
  }

  it('returns an empty string when there is no import_source raw_json (e.g. a non-catalogue entity)', () => {
    expect(buildClassArticleMarkdownFromBlocks([])).toBe('')
    expect(buildClassArticleMarkdownFromBlocks(undefined)).toBe('')
  })

  it('builds Proficiencies, Starting Equipment, and Class Features sections, tags stripped', () => {
    const markdown = buildClassArticleMarkdownFromBlocks(classBlocks({
      name: 'Fixture Fighter',
      entries: ['A fixture class for testing.'],
      proficiency: ['str', 'con'],
      startingProficiencies: {
        armor: { from: ['light', 'medium', 'heavy', 'shields'] },
        weapons: { from: ['simple', 'martial'] }
      },
      startingEquipment: {
        entries: ['(a) chain mail or (b) leather armor, longbow, and 20 arrows']
      },
      classFeatures: ['Fighting Style|Fighter||1', 'Second Wind|Fighter||1']
    }))

    expect(markdown).toContain('A fixture class for testing.')
    expect(markdown).toContain('## Proficiencies')
    expect(markdown).toContain('**Saving Throw Proficiencies:** STR, CON')
    expect(markdown).toContain('**Armor Training:** light, medium, heavy, shields')
    expect(markdown).toContain('## Starting Equipment')
    expect(markdown).toContain('## Class Features')
    expect(markdown).toContain('- Level 1: Fighting Style')
    expect(markdown).toContain('- Level 1: Second Wind')
    expect(markdown).not.toMatch(/\{@|[{}]/)
  })

  it('omits the Starting Equipment heading when its entries resolve to no body text (e.g. a { defaultData, goldAlternative } shape)', () => {
    const markdown = buildClassArticleMarkdownFromBlocks(classBlocks({
      name: 'Fixture Fighter',
      startingEquipment: {
        entries: [{ defaultData: ['chain mail', 'a longsword'], goldAlternative: '5d4 x 10 gp' }]
      }
    }))

    expect(markdown).not.toContain('## Starting Equipment')
  })

  it('still renders the Starting Equipment heading when its entries resolve to real body text', () => {
    const markdown = buildClassArticleMarkdownFromBlocks(classBlocks({
      name: 'Fixture Fighter',
      startingEquipment: {
        entries: ['(a) chain mail or (b) leather armor, longbow, and 20 arrows']
      }
    }))

    expect(markdown).toContain('## Starting Equipment')
    expect(markdown).toContain('(a) chain mail or (b) leather armor, longbow, and 20 arrows')
  })
})

describe('buildSpeciesArticleMarkdownFromBlocks', () => {
  it('prefers the already-built species_core.traits text when present', () => {
    const blocks = [
      { block_key: 'species_core', data: { traits: '## Darkvision\n\nYou can see in the dark.' } },
      { block_key: 'import_source', data: { raw_json: { entries: ['Should not be used.'] } } }
    ]

    const markdown = buildSpeciesArticleMarkdownFromBlocks(blocks)
    expect(markdown).toBe('## Darkvision\n\nYou can see in the dark.')
  })

  it('falls back to the raw entries when species_core.traits is empty', () => {
    const blocks = [
      { block_key: 'species_core', data: { traits: '' } },
      {
        block_key: 'import_source',
        data: { raw_json: { entries: [{ name: 'Darkvision', entries: ['You have {@sense Darkvision|XPHB}.'] }] } }
      }
    ]

    const markdown = buildSpeciesArticleMarkdownFromBlocks(blocks)
    expect(markdown).toContain('## Darkvision')
    expect(markdown).toContain('You have Darkvision.')
    expect(markdown).not.toContain('{@')
  })

  it('returns an empty string when neither traits nor raw entries are available', () => {
    expect(buildSpeciesArticleMarkdownFromBlocks([])).toBe('')
  })
})
