// Unit tests for the 5etools Importer -> Content Pack Publication Adapter
// (server/utils/content-pack-5etools-adapter.ts). This is the one module
// allowed to know about both EldraImportPreviewEntity (the importer's
// World-entity-shaped output) and ContentPublicationCandidate (the
// publisher's own contract) -- these tests exist specifically to prove the
// translation drops `blocks` and never leaks a presentation structure into
// the candidate it produces.

import { describe, expect, it } from 'vitest'
import { toContentPublicationCandidate, toContentPublicationCandidates } from '../../../server/utils/content-pack-5etools-adapter'
import type { EldraImportPreviewEntity, EldraImportPreviewResult } from '../../../app/lib/importers/types'

function entity(overrides: Partial<EldraImportPreviewEntity> = {}): EldraImportPreviewEntity {
  return {
    systemKey: 'dnd5e',
    entityType: 'item',
    title: 'Longsword',
    slug: 'longsword-phb',
    provider: '5etools-json',
    externalId: 'item__Longsword__PHB',
    sourceBook: 'PHB',
    sourcePage: '149',
    blocks: [
      { blockKey: 'item_core', label: 'Item', repeatable: false, sort: 0, data: { name: 'Longsword', damage: '1d8' } },
      { blockKey: 'import_source', label: 'Import Source', repeatable: false, sort: 1, data: { provider: '5etools-json' } }
    ],
    raw: { name: 'Longsword', source: 'PHB', page: 149, dmg1: '1d8' },
    ...overrides
  }
}

describe('toContentPublicationCandidate -- identity and provenance', () => {
  it('carries identity fields across unchanged', () => {
    const candidate = toContentPublicationCandidate(entity())

    expect(candidate.systemKey).toBe('dnd5e')
    expect(candidate.entityType).toBe('item')
    expect(candidate.title).toBe('Longsword')
    expect(candidate.slug).toBe('longsword-phb')
    expect(candidate.externalId).toBe('item__Longsword__PHB')
  })

  it('carries provenance fields across unchanged', () => {
    const candidate = toContentPublicationCandidate(entity())

    expect(candidate.provider).toBe('5etools-json')
    expect(candidate.sourceBook).toBe('PHB')
    expect(candidate.sourcePage).toBe('149')
  })
})

describe('toContentPublicationCandidate -- the seam', () => {
  it('uses raw as data, never blocks', () => {
    const candidate = toContentPublicationCandidate(entity())
    expect(candidate.data).toEqual({ name: 'Longsword', source: 'PHB', page: 149, dmg1: '1d8' })
  })

  it('never exposes a "blocks" field on the resulting candidate', () => {
    const candidate = toContentPublicationCandidate(entity()) as any
    expect(candidate.blocks).toBeUndefined()
  })

  it('produces no key whose value is block-shaped (blockKey/label/repeatable/sort/data)', () => {
    const candidate = toContentPublicationCandidate(entity())
    const serialized = JSON.stringify(candidate)
    expect(serialized).not.toContain('blockKey')
    expect(serialized).not.toContain('repeatable')
  })

  it('the candidate shape has exactly the documented fields, nothing importer-internal', () => {
    const candidate = toContentPublicationCandidate(entity())
    expect(Object.keys(candidate).sort()).toEqual(
      ['data', 'entityType', 'externalId', 'provider', 'slug', 'sourceBook', 'sourcePage', 'systemKey', 'title'].sort()
    )
  })
})

describe('toContentPublicationCandidates -- batch translation', () => {
  function result(overrides: Partial<EldraImportPreviewResult> = {}): EldraImportPreviewResult {
    return {
      provider: '5etools-json',
      systemKey: 'dnd5e',
      entityType: 'item',
      count: 1,
      items: [entity()],
      warnings: [],
      ...overrides
    }
  }

  it('maps every item in a preview result to a candidate, in order', () => {
    const candidates = toContentPublicationCandidates(
      result({ items: [entity({ slug: 'a' }), entity({ slug: 'b' })] })
    )

    expect(candidates.map((c) => c.slug)).toEqual(['a', 'b'])
  })

  it('returns an empty array for a preview result with no items', () => {
    expect(toContentPublicationCandidates(result({ items: [] }))).toEqual([])
  })
})
