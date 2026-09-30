// Character Progression Phase 1C -- CORPUS / CONTENT tests. Exercises the
// REAL 5etools dataset on disk (no fixture), the same "prove it against
// real content" precedent tests/server/utils/content-sources-providers.test.ts
// already established for classes/species/backgrounds.

import { describe, expect, it } from 'vitest'
import { isSubclassFromClassSource } from '../../../server/utils/content-sources/dnd5e/5etools-dataset'
import { preview5eToolsSubclasses } from '../../../app/lib/importers/5etools-subclasses'
import { xphbProvider } from '../../../server/utils/content-sources/dnd5e/xphb'
import { toContentPublicationCandidate } from '../../../server/utils/content-pack-5etools-adapter'

describe('isSubclassFromClassSource', () => {
  it('1. matches on classSource, never source -- the real dataset asymmetry', () => {
    // School of Evocation's own `source` is PHB, never XPHB, even for the
    // row compatible with the 2024 Wizard (classSource: 'XPHB').
    const xphbVariant = { name: 'School of Evocation', source: 'PHB', className: 'Wizard', classSource: 'XPHB' }
    const phbVariant = { name: 'School of Evocation', source: 'PHB', className: 'Wizard', classSource: 'PHB' }

    expect(isSubclassFromClassSource('XPHB')(xphbVariant)).toBe(true)
    expect(isSubclassFromClassSource('XPHB')(phbVariant)).toBe(false)
  })

  it('the OLD isEntryFromSource(\'XPHB\') predicate would have matched zero real subclass rows -- proves the bug this predicate avoids', async () => {
    const { isEntryFromSource } = await import('../../../server/utils/content-sources/dnd5e/5etools-dataset')
    const realRow = { name: 'School of Evocation', source: 'PHB', className: 'Wizard', classSource: 'XPHB' }
    expect(isEntryFromSource('XPHB')(realRow)).toBe(false)
  })
})

describe('preview5eToolsSubclasses -- structural identity, never prose', () => {
  it('2/3. derives stable externalId/slug and structural parentClassSlug from native fields only', () => {
    const raw = { name: 'School of Evocation', source: 'PHB', className: 'Wizard', classSource: 'XPHB', page: 115 }
    const result = preview5eToolsSubclasses([raw])
    expect(result.items).toHaveLength(1)
    const entry = result.items[0]!

    expect(entry.externalId).toBe('School of Evocation__PHB')
    expect(entry.slug).toBe('school-of-evocation-phb')
    // Uses the IDENTICAL slug formula the real class importer already uses
    // for the real Wizard (XPHB) class -- verified elsewhere in this repo
    // this session to be 'wizard-xphb'.
    expect((entry as any).parentClassSlug).toBe('wizard-xphb')
    expect(entry.entityType).toBe('subclass')
  })

  it('5. never derives identity from prose -- a subclass with rich descriptive entries still gets the identical structural identity', () => {
    const raw = {
      name: 'School of Evocation',
      source: 'PHB',
      className: 'Wizard',
      classSource: 'XPHB',
      entries: ['Evokers focus their study on magic that creates powerful elemental effects...', { name: 'Evocation Savant', entries: ['Some long prose here'] }]
    }
    const result = preview5eToolsSubclasses([raw])
    // Identity fields are unaffected by how much prose `entries` contains.
    expect(result.items[0]!.slug).toBe('school-of-evocation-phb')
    expect((result.items[0]! as any).parentClassSlug).toBe('wizard-xphb')
  })
})

describe('xphbProvider -- real dataset, non-Wizard proof', () => {
  it('4. subclasses now enter the Content Source pipeline (previously entirely absent)', async () => {
    const result = await xphbProvider.loadCategory('subclasses')
    expect(result.candidates.length).toBeGreaterThan(0)
  })

  it('1. real Wizard subclass rows are discovered, with stable identity', async () => {
    const result = await xphbProvider.loadCategory('subclasses')
    const wizardSubclasses = result.candidates.filter((c: any) => c.parentClassSlug === 'wizard-xphb')
    expect(wizardSubclasses.length).toBeGreaterThan(0)
    const evocation = wizardSubclasses.find((c) => c.slug === 'school-of-evocation-phb')
    expect(evocation).toBeDefined()
    expect(evocation!.title).toBe('School of Evocation')
  })

  it('4. NON-WIZARD PROOF -- Fighter subclasses are discovered through the IDENTICAL generic pipeline, no class-specific code path', async () => {
    const result = await xphbProvider.loadCategory('subclasses')
    const fighterSubclasses = result.candidates.filter((c: any) => c.parentClassSlug === 'fighter-xphb')
    expect(fighterSubclasses.length).toBeGreaterThan(0)
    const champion = fighterSubclasses.find((c) => c.slug === 'champion-phb')
    expect(champion).toBeDefined()
  })

  it('every discovered subclass candidate carries a non-empty parentClassSlug -- structural parent identity is never absent', async () => {
    const result = await xphbProvider.loadCategory('subclasses')
    for (const candidate of result.candidates) {
      expect((candidate as any).parentClassSlug).toBeTruthy()
    }
  })
})

describe('toContentPublicationCandidate -- parentClassSlug passthrough', () => {
  it('carries parentClassSlug through to the publication candidate when the importer set it', () => {
    const entity: any = {
      systemKey: 'dnd5e', entityType: 'subclass', title: 'School of Evocation',
      slug: 'school-of-evocation-phb', provider: '5etools-json', externalId: 'x',
      blocks: [], raw: {}, parentClassSlug: 'wizard-xphb'
    }
    const candidate = toContentPublicationCandidate(entity)
    expect(candidate.parentClassSlug).toBe('wizard-xphb')
  })

  it('omits parentClassSlug entirely for a category that never sets it (e.g. a class)', () => {
    const entity: any = {
      systemKey: 'dnd5e', entityType: 'class', title: 'Wizard',
      slug: 'wizard-xphb', provider: '5etools-json', externalId: 'x',
      blocks: [], raw: {}
    }
    const candidate = toContentPublicationCandidate(entity)
    expect(candidate).not.toHaveProperty('parentClassSlug')
  })
})
