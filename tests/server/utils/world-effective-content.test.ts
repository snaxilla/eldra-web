// resolveEffectiveContent -- Content Workspaces & Studio Phase 5/6
// (content-workspaces-and-studio.md §8). The no-op theorem (§8.7) is the
// load-bearing guarantee: with today's data (no published pack has ever
// carried contentEntityId/baseRefs/curatedFrom/slugAliases), enabling
// this resolver must be provably indistinguishable from
// resolveWorldContent, not merely "probably fine."

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isEffectiveContentEnabled, resolveEffectiveContent } from '../../../server/utils/world-effective-content'
import { resolveContentPresentation } from '../../../app/lib/content-presentation'

const {
  resolveWorldContentMock,
  listContentPackBindingsForWorldMock,
  listPackageLineagesMock,
  loadWorkspaceAsSourceMock
} = vi.hoisted(() => ({
  resolveWorldContentMock: vi.fn(),
  listContentPackBindingsForWorldMock: vi.fn(),
  listPackageLineagesMock: vi.fn(),
  loadWorkspaceAsSourceMock: vi.fn()
}))

vi.mock('../../../server/utils/world-content-runtime', async () => {
  const actual = await vi.importActual<typeof import('../../../server/utils/world-content-runtime')>('../../../server/utils/world-content-runtime')
  return { ...actual, resolveWorldContent: resolveWorldContentMock }
})
vi.mock('../../../server/utils/world-content-packs', () => ({ listContentPackBindingsForWorld: listContentPackBindingsForWorldMock }))
vi.mock('../../../server/utils/content-package-lineages', () => ({ listPackageLineages: listPackageLineagesMock }))
vi.mock('../../../server/utils/world-content-sources', () => ({ loadWorkspaceAsSource: loadWorkspaceAsSourceMock }))

const WORLD_ID = '4'

function entry(overrides: Record<string, unknown> = {}) {
  return {
    systemKey: 'dnd5e', entityType: 'item', title: 'Shortsword', slug: 'shortsword-xphb',
    externalId: 'Shortsword__XPHB', provider: '5etools', sourceBook: 'XPHB',
    data: { name: 'Shortsword', entries: ['A light blade.'] },
    packageId: 'eldra.solaris.xphb', packageVersion: '1.0.0',
    ...overrides
  }
}

function binding(packageId: string, overrides: Record<string, unknown> = {}) {
  return { id: 'b1', worldId: WORLD_ID, packageId, packageVersion: '1.0.0', packageIntegrity: 'sha256-x', bindingMode: 'pinned' as const, channel: null, workspaceId: null, priority: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides }
}

beforeEach(() => {
  resolveWorldContentMock.mockReset()
  listContentPackBindingsForWorldMock.mockReset()
  listPackageLineagesMock.mockReset()
  loadWorkspaceAsSourceMock.mockReset()
  listPackageLineagesMock.mockResolvedValue([])
  listContentPackBindingsForWorldMock.mockResolvedValue([])
})

describe('isEffectiveContentEnabled', () => {
  it('defaults to false (off) when unset', () => {
    expect(isEffectiveContentEnabled({})).toBe(false)
  })

  it('is true for "true" or "1", false for anything else', () => {
    expect(isEffectiveContentEnabled({ ELDRA_EFFECTIVE_CONTENT: 'true' })).toBe(true)
    expect(isEffectiveContentEnabled({ ELDRA_EFFECTIVE_CONTENT: '1' })).toBe(true)
    expect(isEffectiveContentEnabled({ ELDRA_EFFECTIVE_CONTENT: 'false' })).toBe(false)
    expect(isEffectiveContentEnabled({ ELDRA_EFFECTIVE_CONTENT: 'yes' })).toBe(false)
  })
})

describe('the no-op theorem (§8.7)', () => {
  it('for data with no declared evidence, every group has exactly one member, in the SAME order resolveWorldContent produced', async () => {
    const entries = [
      entry({ slug: 'shortsword-xphb', packageId: 'eldra.solaris.xphb' }),
      entry({ slug: 'longsword-xphb', title: 'Longsword', packageId: 'eldra.solaris.xphb' }),
      entry({ slug: 'fireball-xphb', title: 'Fireball', entityType: 'spell', packageId: 'eldra.solaris.xphb' })
    ]
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [{ ok: true, packageId: 'eldra.solaris.xphb', version: '1.0.0', title: 'XPHB', entryCount: 3 }], entries, byEntityType: {} })
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('eldra.solaris.xphb')])

    const result = await resolveEffectiveContent(WORLD_ID)

    expect(result.entries).toHaveLength(3)
    expect(result.entries.map((e) => e.slug)).toEqual(['shortsword-xphb', 'longsword-xphb', 'fireball-xphb'])
    for (const [i, effective] of result.entries.entries()) {
      const original = entries[i]!
      expect(effective).toMatchObject({
        systemKey: original.systemKey, entityType: original.entityType, title: original.title, slug: original.slug,
        externalId: original.externalId, provider: original.provider, sourceBook: original.sourceBook,
        packageId: original.packageId, packageVersion: original.packageVersion, data: original.data
      })
      expect(effective.customization).toEqual({ customized: false, authoredFields: [], baseLabel: undefined, baseRef: undefined, shadowed: undefined, conflicts: undefined })
    }
  })

  it("every entry's presentation equals resolveContentPresentation directly over its data -- nothing added, nothing dropped", async () => {
    const theEntry = entry()
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], entries: [theEntry], byEntityType: {} })

    const result = await resolveEffectiveContent(WORLD_ID)

    expect(result.entries[0]!.presentation).toEqual(resolveContentPresentation('dnd5e', 'item', theEntry.data))
  })

  it('an empty catalogue resolves to an empty effective catalogue, never an error', async () => {
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], entries: [], byEntityType: {} })
    const result = await resolveEffectiveContent(WORLD_ID)
    expect(result.entries).toEqual([])
    expect(result.byEntityType).toEqual({})
  })
})

describe('evidence-based collapse (§7.4/§8.2)', () => {
  it('two packs sharing systemKey::entityType::slug with NO declared evidence both remain visible', async () => {
    const entries = [
      entry({ packageId: 'eldra.pack-a', slug: 'dragon-blade' }),
      entry({ packageId: 'eldra.pack-b', slug: 'dragon-blade' })
    ]
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], entries, byEntityType: {} })
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('eldra.pack-a'), binding('eldra.pack-b')])

    const result = await resolveEffectiveContent(WORLD_ID)

    expect(result.entries).toHaveLength(2)
    expect(result.entries.map((e) => e.packageId).sort()).toEqual(['eldra.pack-a', 'eldra.pack-b'])
  })

  it('E3: a workspace entity declaring baseRefs naming a bound pinned entry collapses onto it -- one entity, not two', async () => {
    const pinnedEntry = entry({ packageId: 'eldra.solaris.xphb', slug: 'shortsword-xphb' })
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], entries: [pinnedEntry], byEntityType: {} })
    listContentPackBindingsForWorldMock.mockResolvedValue([
      binding('eldra.solaris.xphb'),
      binding('workspace.w1', { bindingMode: 'workspace', workspaceId: 'w1', packageVersion: 'live', packageIntegrity: null })
    ])
    loadWorkspaceAsSourceMock.mockResolvedValue({
      ok: true,
      workspaceTitle: 'Curated',
      entries: [{
        systemKey: 'dnd5e', entityType: 'item', title: 'Fine Shortsword', slug: 'shortsword-xphb',
        externalId: 'ce_1', provider: 'workspace', data: { name: 'Fine Shortsword' },
        contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', baseRefs: [{ packageId: 'eldra.solaris.xphb', systemKey: 'dnd5e', entityType: 'item', slug: 'shortsword-xphb' }],
        packageId: 'workspace.w1', packageVersion: 'live', state: 'active',
        presentation: { kind: 'item', name: 'Fine Shortsword', description: [], facts: [], sections: [], notes: [] }
      }]
    })

    const result = await resolveEffectiveContent(WORLD_ID)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ packageId: 'workspace.w1', title: 'Fine Shortsword' })
    expect(result.entries[0]!.customization.customized).toBe(true)
    expect(result.entries[0]!.customization.shadowed).toEqual([{ packageId: 'eldra.solaris.xphb', version: '1.0.0' }])
  })

  it('a workspace winner uses its PRE-RESOLVED presentation, not one recomputed from raw data', async () => {
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], entries: [], byEntityType: {} })
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('workspace.w1', { bindingMode: 'workspace', workspaceId: 'w1', packageVersion: 'live', packageIntegrity: null })])
    const preResolved = { kind: 'item' as const, name: 'Authored Name Nobody Could Derive From Data', description: [], facts: [], sections: [], notes: [] }
    loadWorkspaceAsSourceMock.mockResolvedValue({
      ok: true, workspaceTitle: 'Curated',
      entries: [{ systemKey: 'dnd5e', entityType: 'item', title: 'X', slug: 'x', externalId: 'ce_1', provider: 'workspace', data: { name: 'something else entirely' }, packageId: 'workspace.w1', packageVersion: 'live', state: 'active', presentation: preResolved }]
    })

    const result = await resolveEffectiveContent(WORLD_ID)
    expect(result.entries[0]!.presentation).toEqual(preResolved)
  })

  it('two live workspace sources claiming the same base produce ONE entity plus a surfaced conflict', async () => {
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], entries: [], byEntityType: {} })
    listContentPackBindingsForWorldMock.mockResolvedValue([
      binding('workspace.w1', { bindingMode: 'workspace', workspaceId: 'w1', packageVersion: 'live', packageIntegrity: null }),
      binding('workspace.w2', { bindingMode: 'workspace', workspaceId: 'w2', packageVersion: 'live', packageIntegrity: null, createdAt: '2026-02-01T00:00:00Z' })
    ])
    const shared = { packageId: 'eldra.base', systemKey: 'dnd5e', entityType: 'item', slug: 'contested' }
    loadWorkspaceAsSourceMock.mockImplementation(async (workspaceId: string) => ({
      ok: true, workspaceTitle: workspaceId,
      entries: [{ systemKey: 'dnd5e', entityType: 'item', title: 'Contested', slug: 'contested', externalId: `ce_${workspaceId}`, provider: 'workspace', data: {}, baseRefs: [shared], packageId: `workspace.${workspaceId}`, packageVersion: 'live', state: 'active', presentation: null }]
    }))

    const result = await resolveEffectiveContent(WORLD_ID)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.customization.conflicts).toEqual([{ kind: 'two-live-sources', packageIds: ['workspace.w1', 'workspace.w2'].sort() }])
  })

  it('a disabled (suppressed) workspace entity is still returned, flagged, with no data/presentation -- consumers decide to filter it, not the resolver', async () => {
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], entries: [], byEntityType: {} })
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('workspace.w1', { bindingMode: 'workspace', workspaceId: 'w1', packageVersion: 'live', packageIntegrity: null })])
    loadWorkspaceAsSourceMock.mockResolvedValue({
      ok: true, workspaceTitle: 'Curated',
      entries: [{ systemKey: 'dnd5e', entityType: 'item', title: 'Suppressed Thing', slug: 'suppressed', externalId: 'ce_1', provider: 'workspace', data: { name: 'x' }, packageId: 'workspace.w1', packageVersion: 'live', state: 'disabled', presentation: null }]
    })

    const result = await resolveEffectiveContent(WORLD_ID)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ data: null, presentation: null })
    expect(result.entries[0]!.customization.suppressed).toBe(true)
  })

  it('a broken workspace source (workspace deleted after binding) is reported in packs, loudly, never silently dropped', async () => {
    resolveWorldContentMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], entries: [], byEntityType: {} })
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('workspace.w1', { bindingMode: 'workspace', workspaceId: 'w1', packageVersion: 'live', packageIntegrity: null })])
    loadWorkspaceAsSourceMock.mockResolvedValue({ ok: false, failure: { reason: 'workspace-not-found', message: 'gone' } })

    const result = await resolveEffectiveContent(WORLD_ID)

    expect(result.entries).toEqual([])
    // Reported through WorldContentPackResolution's own existing
    // 'not-found' failure stage, not a parallel shape -- see
    // WorkspaceSourceResolution's header in world-effective-content.ts.
    expect(result.packs).toEqual([{ ok: false, packageId: 'workspace.w1', version: 'live', failure: { stage: 'not-found', packageId: 'workspace.w1', version: 'live' } }])
  })
})
