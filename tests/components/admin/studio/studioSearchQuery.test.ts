// Content Studio Browse query/filter/pagination -- Phase 2.
//
// This repo has no component-rendering harness, so this pure module is
// where Studio's behaviour is actually proven. It must stay
// system-agnostic: nothing below mentions a game system, and the
// catalogue shape it consumes is the one the gameplay surfaces use.

import { describe, expect, it } from 'vitest'

import {
  EMPTY_STUDIO_QUERY,
  STUDIO_CATEGORY_KEYS,
  parseStudioSearchQuery,
  runStudioSearch,
  type StudioSearchQuery
} from '../../../../app/components/admin/studio/studioSearchQuery'

function entry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.solaris.xphb',
    packageVersion: '1.0.38',
    systemKey: 'dnd5e',
    title: 'Shortsword',
    slug: 'shortsword-xphb',
    provider: '5etools',
    sourceBook: 'XPHB',
    sourcePage: '213',
    presentation: { kind: 'item', name: 'Shortsword', description: ['A light blade.'], facts: [], sections: [], notes: [], image: { url: '/img/shortsword.png' } },
    ...overrides
  }
}

function catalogue(overrides: Record<string, unknown[]> = {}) {
  return { items: [entry()], spells: [], ...overrides }
}

function query(overrides: Partial<StudioSearchQuery> = {}): StudioSearchQuery {
  return { ...EMPTY_STUDIO_QUERY, ...overrides }
}

describe('parseStudioSearchQuery', () => {
  it('defaults to a bounded, unfiltered page', () => {
    expect(parseStudioSearchQuery({})).toEqual({ ok: true, value: EMPTY_STUDIO_QUERY })
  })

  it('accepts categories as a comma list or repeated params', () => {
    expect(parseStudioSearchQuery({ category: 'items,spells' })).toMatchObject({ ok: true, value: { categories: ['items', 'spells'] } })
    expect(parseStudioSearchQuery({ category: ['items', 'spells'] })).toMatchObject({ ok: true, value: { categories: ['items', 'spells'] } })
  })

  it('rejects a category that is not a content category', () => {
    const result = parseStudioSearchQuery({ category: 'weapons' })
    expect(result.ok).toBe(false)
    expect((result as { problems: string[] }).problems.join()).toContain("'weapons' is not a content category")
  })

  it('caps the page size', () => {
    expect(parseStudioSearchQuery({ limit: '500' }).ok).toBe(false)
    expect(parseStudioSearchQuery({ limit: 'many' }).ok).toBe(false)
    expect(parseStudioSearchQuery({ limit: '100' }).ok).toBe(true)
  })

  it('rejects an unknown image filter', () => {
    expect(parseStudioSearchQuery({ image: 'maybe' }).ok).toBe(false)
    expect(parseStudioSearchQuery({ image: 'with-image' }).ok).toBe(true)
  })

  it('truncates an overlong search term instead of failing on it', () => {
    expect((parseStudioSearchQuery({ q: 'x'.repeat(500) }) as { value: StudioSearchQuery }).value.q).toHaveLength(120)
  })
})

describe('runStudioSearch', () => {
  it('covers every catalogue category', () => {
    const everything = Object.fromEntries(STUDIO_CATEGORY_KEYS.map((key) => [key, [entry({ slug: `${key}-sample`, title: `${key} sample` })]]))
    const result = runStudioSearch(everything, query({ limit: 100 }))
    expect(result.total).toBe(STUDIO_CATEGORY_KEYS.length)
    expect(new Set(result.rows.map((row) => row.category)).size).toBe(STUDIO_CATEGORY_KEYS.length)
  })

  it('gives every row a stable, lineage-scoped address', () => {
    const [row] = runStudioSearch(catalogue(), query()).rows
    expect(row!.address).toBe('legacy:eldra.solaris.xphb::dnd5e::item::shortsword-xphb')
  })

  it('MINTS NOTHING for a legacy entry -- browsing creates no identity', () => {
    const [row] = runStudioSearch(catalogue(), query()).rows
    expect(row!.contentEntityId).toBeNull()
  })

  it('surfaces a contentEntityId the entry already carries', () => {
    const carried = 'ce_abcdefghijklmnopqrstuvwxyz'
    const [row] = runStudioSearch(catalogue({ items: [entry({ contentEntityId: carried })] }), query()).rows
    expect(row!.contentEntityId).toBe(carried)
  })

  it('skips an entry whose address cannot be formed rather than inventing one', () => {
    expect(runStudioSearch(catalogue({ items: [entry({ packageId: 'nodots' })] }), query()).total).toBe(0)
  })

  it('searches title, slug, and source book', () => {
    const many = catalogue({ items: [entry(), entry({ title: 'Longsword', slug: 'longsword-xphb' })] })
    expect(runStudioSearch(many, query({ q: 'long' })).total).toBe(1)
    expect(runStudioSearch(many, query({ q: 'longsword-xphb' })).total).toBe(1)
    expect(runStudioSearch(many, query({ q: 'xphb' })).total).toBe(2)
    expect(runStudioSearch(many, query({ q: 'nothing-matches' })).total).toBe(0)
  })

  it('filters by category and by source package', () => {
    const mixed = catalogue({
      items: [entry()],
      spells: [entry({ title: 'Fireball', slug: 'fireball-xphb', packageId: 'eldra.other.pack' })]
    })
    expect(runStudioSearch(mixed, query({ categories: ['spells'] })).total).toBe(1)
    expect(runStudioSearch(mixed, query({ packageIds: ['eldra.other.pack'] })).total).toBe(1)
    expect(runStudioSearch(mixed, query({ categories: ['items'], packageIds: ['eldra.other.pack'] })).total).toBe(0)
  })

  it('filters by whether artwork resolved', () => {
    const mixed = catalogue({ items: [entry(), entry({ title: 'Club', slug: 'club-xphb', presentation: { kind: 'item', name: 'Club', description: [], facts: [], sections: [], notes: [], image: null } })] })
    expect(runStudioSearch(mixed, query({ image: 'with-image' })).total).toBe(1)
    expect(runStudioSearch(mixed, query({ image: 'without-image' })).total).toBe(1)
    expect(runStudioSearch(mixed, query({ image: 'any' })).total).toBe(2)
  })

  it('paginates deterministically, with total describing the whole match set', () => {
    const items = Array.from({ length: 7 }, (_, index) => entry({ title: `Item ${index}`, slug: `item-${index}` }))
    const first = runStudioSearch(catalogue({ items }), query({ limit: 3, offset: 0 }))
    const second = runStudioSearch(catalogue({ items }), query({ limit: 3, offset: 3 }))

    expect(first.total).toBe(7)
    expect(first.rows).toHaveLength(3)
    expect(second.rows).toHaveLength(3)
    expect(new Set([...first.rows, ...second.rows].map((row) => row.address)).size).toBe(6)
  })

  it('counts category facets against the other filters but not its own dimension', () => {
    // Selecting one category must not drive the other categories' counts
    // to zero -- that would make the rail a one-way door.
    const mixed = catalogue({ items: [entry()], spells: [entry({ title: 'Fireball', slug: 'fireball-xphb' })] })
    const result = runStudioSearch(mixed, query({ categories: ['items'] }))
    expect(result.total).toBe(1)
    expect(result.categoryFacets.find((facet) => facet.key === 'spells')?.count).toBe(1)
  })

  it('omits a category facet with no matches at all', () => {
    expect(runStudioSearch(catalogue(), query()).categoryFacets.map((facet) => facet.key)).toEqual(['items'])
  })

  it('carries the already-computed presentation through for the detail rail', () => {
    const [row] = runStudioSearch(catalogue(), query()).rows
    expect(row!.presentation).toMatchObject({ kind: 'item', name: 'Shortsword' })
    expect(row!.imageUrl).toBe('/img/shortsword.png')
    expect(row!.description).toBe('A light blade.')
  })

  it('tolerates a category the resolver does not present', () => {
    const [row] = runStudioSearch(catalogue({ items: [entry({ presentation: null })] }), query()).rows
    expect(row!.presentation).toBeNull()
    expect(row!.imageUrl).toBeNull()
  })

  it('reports nothing customized -- Pass A has no override channels', () => {
    expect(runStudioSearch(catalogue(), query()).rows.every((row) => row.customized === false)).toBe(true)
  })

  it('handles an empty catalogue without inventing rows or facets', () => {
    expect(runStudioSearch({}, query())).toMatchObject({ total: 0, rows: [], categoryFacets: [], packageFacets: [] })
  })
})
