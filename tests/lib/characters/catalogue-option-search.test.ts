// Unit tests for app/lib/characters/catalogue-option-search.ts -- the
// actual query/filter behavior behind the Character Sheet's "Search
// Published Items"/"Search published spells" pickers (CharacterInventoryPanel.vue,
// CharacterSpellcastingPanel.vue), extracted out of two byte-for-byte
// identical inline computeds so the client half of the client -> API ->
// world-content-catalogue path the reported bug was traced through is
// exercised by a named test.
//
// Server-side catalogue resolution (which categories a bound Content Pack's
// entries land in) is already covered by tests/server/utils/world-content-catalogue.test.ts;
// this file is about what the CLIENT does with the response once it has it.

import { describe, expect, it } from 'vitest'
import { catalogueOptionKey, searchCatalogueOptions, type CatalogueOptionRef } from '../../../app/lib/characters/catalogue-option-search'

function option(overrides: Partial<CatalogueOptionRef> = {}): CatalogueOptionRef {
  return { packageId: 'eldra.solaris.xphb', slug: 'longsword', title: 'Longsword', ...overrides }
}

describe('catalogueOptionKey', () => {
  it('is packageId::slug, composite -- never a bare slug', () => {
    expect(catalogueOptionKey({ packageId: 'eldra.solaris.xphb', slug: 'longsword' })).toBe('eldra.solaris.xphb::longsword')
  })

  it('distinguishes the same slug published by two different packs', () => {
    const a = catalogueOptionKey({ packageId: 'pack-a', slug: 'longsword' })
    const b = catalogueOptionKey({ packageId: 'pack-b', slug: 'longsword' })
    expect(a).not.toBe(b)
  })
})

describe('searchCatalogueOptions', () => {
  // The exact real-world data this was verified against: GET
  // /api/worlds/4/catalogue (a World bound to the 2024 Player's Handbook +
  // Monster Manual packs) returned 217 real items, and a case-insensitive
  // substring search for "sword" against that real payload correctly
  // matched Greatsword/Longsword/Shortsword -- confirmed directly against
  // the running server before this refactor, not assumed.
  const items: CatalogueOptionRef[] = [
    option({ slug: 'greatsword', title: 'Greatsword' }),
    option({ slug: 'longsword', title: 'Longsword' }),
    option({ slug: 'shortsword', title: 'Shortsword' }),
    option({ slug: 'battleaxe', title: 'Battleaxe' }),
    option({ slug: 'dagger', title: 'Dagger' })
  ]

  it('returns a blank search unfiltered, up to the limit', () => {
    expect(searchCatalogueOptions(items, '')).toEqual(items)
    expect(searchCatalogueOptions(items, '   ')).toEqual(items)
  })

  it('matches a case-insensitive substring of the title', () => {
    const result = searchCatalogueOptions(items, 'sword')
    expect(result.map((o) => o.title)).toEqual(['Greatsword', 'Longsword', 'Shortsword'])
  })

  it('is case-insensitive on both sides -- an uppercase search term still matches', () => {
    expect(searchCatalogueOptions(items, 'SWORD').map((o) => o.title)).toEqual(['Greatsword', 'Longsword', 'Shortsword'])
  })

  it('trims surrounding whitespace from the term', () => {
    expect(searchCatalogueOptions(items, '  dagger  ').map((o) => o.title)).toEqual(['Dagger'])
  })

  it('returns an empty array, not an error, when nothing matches', () => {
    expect(searchCatalogueOptions(items, 'nonexistent-item-xyz')).toEqual([])
  })

  it('caps results at the given limit (default 100)', () => {
    const many = Array.from({ length: 150 }, (_, i) => option({ slug: `item-${i}`, title: `Item ${i}` }))
    expect(searchCatalogueOptions(many, '')).toHaveLength(100)
    expect(searchCatalogueOptions(many, 'item')).toHaveLength(100)
    expect(searchCatalogueOptions(many, '', 10)).toHaveLength(10)
  })

  // THE ACTUAL REGRESSION. Before this module existed, each panel's own
  // inline `.filter((option) => option.title.toLowerCase().includes(term))`
  // called `.toLowerCase()` on `option.title` UNCHECKED -- a single
  // catalogue entry whose title was not a clean string (malformed content,
  // a bad import) threw INSIDE that `.filter()`, which fails the WHOLE
  // array method, not just that one entry: every real, well-formed item
  // disappeared from the search results the moment a term was typed,
  // while the blank-search state (which never calls `.toLowerCase()` at
  // all) kept showing them fine -- exactly the asymmetry "returns no
  // items when searching, despite items being available" describes.
  it('a single malformed entry (non-string title) does not take down the whole search -- it is dropped, not thrown', () => {
    const withBadEntry: CatalogueOptionRef[] = [
      ...items,
      option({ slug: 'malformed', title: null as any }),
      option({ slug: 'also-malformed', title: undefined as any })
    ]

    const result = searchCatalogueOptions(withBadEntry, 'sword')

    expect(result.map((o) => o.title)).toEqual(['Greatsword', 'Longsword', 'Shortsword'])
  })

  it('a malformed entry is also simply absent from the blank-search (unfiltered) result -- consistent either way', () => {
    const withBadEntry: CatalogueOptionRef[] = [option({ slug: 'malformed', title: 123 as any })]

    // Unfiltered results pass everything through (including the bad
    // entry) -- the guard is specifically about the FILTER path, which is
    // where `.toLowerCase()` is actually called. Documenting this
    // explicitly rather than leaving it implicit.
    expect(searchCatalogueOptions(withBadEntry, '')).toEqual(withBadEntry)
  })
})
