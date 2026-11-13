// Entity presentation preview -- composes the pure resolver/merge layer
// with the one impure step (image World-scope resolution). What matters:
// the base/source-resolved presentation is computed from the RAW base
// payload with no authored overlay (so it's a sound baseValueHash input);
// the preview applies the authored overlay on top; an authored-only
// (origin: 'authored') entity with no base still gets a preview.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computePresentationBaseValueHash, previewEntityPresentation, resolveBasePresentation } from '../../../server/utils/content-workspace-presentation'
import type { WorkspaceEntityDetail } from '../../../server/utils/content-workspace-entities'

const { directusServiceRequestMock } = vi.hoisted(() => ({ directusServiceRequestMock: vi.fn() }))
vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))

const WORLD_ID = '4'

function detail(overrides: Partial<WorkspaceEntityDetail> = {}): WorkspaceEntityDetail {
  return {
    id: 'e1', workspaceId: 'w1', contentEntityId: 'ce_x', systemKey: 'dnd5e', entityType: 'item',
    slug: 'shortsword-xphb', title: 'Shortsword', origin: 'imported', state: 'active', revision: 0,
    baseData: { systemKey: 'dnd5e', entityType: 'item', title: 'Shortsword', slug: 'shortsword-xphb', externalId: 'x', provider: '5etools', data: { name: 'Shortsword', entries: ['A fine blade.'] } },
    baseDataHash: 'sha256-base', baseSourceRef: null, baseMissing: false, baseRefs: [], slugAliases: [],
    authoredData: null, authoredPresentation: [], authoredMechanics: [], createdAt: null, updatedAt: null,
    ...overrides
  }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('resolveBasePresentation', () => {
  it('resolves from base_data.data for an imported entity with a known entityType', () => {
    const base = resolveBasePresentation(detail())
    expect(base).not.toBeNull()
    expect(base?.kind).toBe('item')
  })

  it('returns null for an entityType with no presentation resolver (e.g. a feat)', () => {
    expect(resolveBasePresentation(detail({ entityType: 'feat' }))).toBeNull()
  })

  it('reads authored_data instead of base_data for an authored-origin entity', () => {
    const base = resolveBasePresentation(detail({
      origin: 'authored',
      baseData: null,
      authoredData: { systemKey: 'dnd5e', entityType: 'item', data: { name: 'Original Dagger', entries: [] } }
    }))
    expect(base).not.toBeNull()
  })
})

describe('computePresentationBaseValueHash', () => {
  it('hashes the base value at a known field', () => {
    const base = resolveBasePresentation(detail())
    const hash = computePresentationBaseValueHash(base, 'name')
    expect(hash).toMatch(/^sha256-/)
  })

  it('is null for an authored-only field with no base concept (tags, attribution)', () => {
    const base = resolveBasePresentation(detail())
    expect(computePresentationBaseValueHash(base, 'tags')).toBeNull()
    expect(computePresentationBaseValueHash(base, 'attribution')).toBeNull()
  })

  it('is stable (same input, same hash) and distinguishes different values', () => {
    const base = resolveBasePresentation(detail())
    const h1 = computePresentationBaseValueHash(base, 'name')
    const h1Again = computePresentationBaseValueHash(base, 'name')
    const h2 = computePresentationBaseValueHash(base, 'description')
    expect(h1).toBe(h1Again)
    expect(h1).not.toBe(h2)
  })
})

describe('previewEntityPresentation', () => {
  it('with no authored overlay, the effective preview equals the base presentation', async () => {
    const preview = await previewEntityPresentation(detail(), { worldId: WORLD_ID })
    expect(preview.effectivePresentation).toEqual(preview.basePresentation)
    expect(preview.imageUnavailable).toBe(false)
    expect(directusServiceRequestMock).not.toHaveBeenCalled() // no image key present -> no lookup
  })

  it('applies an authored name override on top of the base presentation', async () => {
    const entity = detail({
      authoredPresentation: [{ channel: 'presentation', path: 'name', value: 'Fine Shortsword', authoredBy: 'acct-1', authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }]
    })
    const preview = await previewEntityPresentation(entity, { worldId: WORLD_ID })
    expect(preview.effectivePresentation?.name).toBe('Fine Shortsword')
  })

  it('resolves an authored image ref against the given World, surfacing unavailability rather than a broken image', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: { id: 'f1', world_id: Number(WORLD_ID) } })
    const entity = detail({
      authoredPresentation: [{ channel: 'presentation', path: 'image', value: { kind: 'media', fileId: 'f1' }, authoredBy: 'acct-1', authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }]
    })
    const preview = await previewEntityPresentation(entity, { worldId: WORLD_ID })
    expect(preview.effectivePresentation?.image).toEqual({ url: '/api/assets/f1' })
    expect(preview.imageUnavailable).toBe(false)
  })

  it('an authored-only entity with no base still produces a preview', async () => {
    const entity = detail({
      origin: 'authored',
      baseData: null,
      authoredData: null,
      authoredPresentation: [{ channel: 'presentation', path: 'name', value: 'Brand New Thing', authoredBy: 'acct-1', authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }]
    })
    const preview = await previewEntityPresentation(entity, { worldId: WORLD_ID })
    expect(preview.basePresentation).toBeNull()
    expect(preview.effectivePresentation?.name).toBe('Brand New Thing')
  })
})
