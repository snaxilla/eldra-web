// Direct Content Editing -- the ONE workflow shared by "Items -> Edit"
// and Content Studio's own customization path. No HTTP, no auth here
// (that is the route's job, mirrored in world-content-pack-binding.ts's
// own established split) -- this proves the ORCHESTRATION: resolve ->
// prepare-if-needed (idempotent) -> import exactly one entity -> bind ->
// save, and that opening/resolving alone writes nothing.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  isEffectiveContentEnabledMock,
  resolveEffectiveContentMock,
  bindWorkspaceLiveToWorldMock,
  listWorldsBoundToWorkspaceMock,
  createContentWorkspaceMock,
  getContentWorkspaceByKeyMock,
  listWorkspaceEntityIdentitiesMock,
  importIntoWorkspaceMock,
  applyPresentationEditsMock,
  applyEntityEditsMock,
  getWorkspaceEntityDetailMock,
  resolveBasePresentationMock,
  computePresentationBaseValueHashMock
} = vi.hoisted(() => ({
  isEffectiveContentEnabledMock: vi.fn(),
  resolveEffectiveContentMock: vi.fn(),
  bindWorkspaceLiveToWorldMock: vi.fn(),
  listWorldsBoundToWorkspaceMock: vi.fn(),
  createContentWorkspaceMock: vi.fn(),
  getContentWorkspaceByKeyMock: vi.fn(),
  listWorkspaceEntityIdentitiesMock: vi.fn(),
  importIntoWorkspaceMock: vi.fn(),
  applyPresentationEditsMock: vi.fn(),
  applyEntityEditsMock: vi.fn(),
  getWorkspaceEntityDetailMock: vi.fn(),
  resolveBasePresentationMock: vi.fn(),
  computePresentationBaseValueHashMock: vi.fn()
}))

vi.mock('../../../server/utils/world-effective-content', () => ({
  isEffectiveContentEnabled: isEffectiveContentEnabledMock,
  resolveEffectiveContent: resolveEffectiveContentMock
}))
vi.mock('../../../server/utils/world-content-pack-binding', () => ({
  bindWorkspaceLiveToWorld: bindWorkspaceLiveToWorldMock
}))
vi.mock('../../../server/utils/world-content-packs', () => ({
  listWorldsBoundToWorkspace: listWorldsBoundToWorkspaceMock
}))
vi.mock('../../../server/utils/content-workspaces', () => ({
  createContentWorkspace: createContentWorkspaceMock,
  getContentWorkspaceByKey: getContentWorkspaceByKeyMock,
  listWorkspaceEntityIdentities: listWorkspaceEntityIdentitiesMock
}))
vi.mock('../../../server/utils/content-workspace-import', () => ({
  importIntoWorkspace: importIntoWorkspaceMock
}))
vi.mock('../../../server/utils/content-workspace-entities', () => ({
  applyPresentationEdits: applyPresentationEditsMock,
  applyEntityEdits: applyEntityEditsMock,
  getWorkspaceEntityDetail: getWorkspaceEntityDetailMock
}))
vi.mock('../../../server/utils/content-workspace-presentation', () => ({
  resolveBasePresentation: resolveBasePresentationMock,
  computePresentationBaseValueHash: computePresentationBaseValueHashMock
}))

const { customizeEntityForWorld, resolveDirectEditTarget, prepareWorldLocalWorkspace, worldLocalWorkspaceKey, splitSharedEntityToLocalWorkspace } =
  await import('../../../server/utils/content-entity-direct-edit')

const WORLD_ID = 4
const WORKSPACE = { id: 'ws-1', workspaceKey: worldLocalWorkspaceKey(WORLD_ID), title: 'x', description: null, systemKey: 'dnd5e', sourceGameSystemKey: null, sourceCollectionKey: null, status: 'active' as const, ownerAccountId: null, createdAt: null, updatedAt: null, revision: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  isEffectiveContentEnabledMock.mockReturnValue(true)
  resolveBasePresentationMock.mockReturnValue(null)
  computePresentationBaseValueHashMock.mockReturnValue('hash-1')
})

describe('resolveDirectEditTarget', () => {
  it('reports resolver-disabled without reading anything else', async () => {
    isEffectiveContentEnabledMock.mockReturnValue(false)
    const result = await resolveDirectEditTarget(WORLD_ID, 'item', 'shortsword-xphb')
    expect(result).toEqual({ mode: 'resolver-disabled' })
    expect(resolveEffectiveContentMock).not.toHaveBeenCalled()
  })

  it('reports not-found when the slug does not resolve in this World', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [] } })
    const result = await resolveDirectEditTarget(WORLD_ID, 'item', 'shortsword-xphb')
    expect(result).toEqual({ mode: 'not-found' })
  })

  it('reports needs-preparation for a pinned (non-workspace) winner', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37', presentation: null, data: { name: 'Shortsword' } }] }
    })
    const result = await resolveDirectEditTarget(WORLD_ID, 'item', 'shortsword-xphb')
    expect(result).toEqual({
      mode: 'needs-preparation',
      packageId: 'eldra.solaris.xphb',
      packageVersion: '1.0.37',
      entityType: 'item',
      slug: 'shortsword-xphb',
      presentation: null,
      data: { name: 'Shortsword' }
    })
    expect(listWorldsBoundToWorkspaceMock).not.toHaveBeenCalled()
  })

  it('reports existing-workspace scope "local" when bound only to this World', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-1', contentEntityId: 'ce_abc' }] }
    })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID)])
    const result = await resolveDirectEditTarget(WORLD_ID, 'item', 'shortsword-xphb')
    expect(result).toEqual({ mode: 'existing-workspace', workspaceId: 'ws-1', contentEntityId: 'ce_abc', scope: 'local', sharedWithWorldCount: 0 })
  })

  it('reports scope "shared" and the count when bound to other Worlds too', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-1', contentEntityId: 'ce_abc' }] }
    })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID), '6', '9'])
    const result = await resolveDirectEditTarget(WORLD_ID, 'item', 'shortsword-xphb')
    expect(result).toMatchObject({ mode: 'existing-workspace', scope: 'shared', sharedWithWorldCount: 2 })
  })
})

describe('prepareWorldLocalWorkspace', () => {
  it('reuses an existing local workspace without creating a second one', async () => {
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    const workspace = await prepareWorldLocalWorkspace(WORLD_ID, null, 'dnd5e')
    expect(workspace).toBe(WORKSPACE)
    expect(createContentWorkspaceMock).not.toHaveBeenCalled()
  })

  it('creates one when none exists yet, keyed deterministically by World id', async () => {
    getContentWorkspaceByKeyMock.mockResolvedValueOnce(null)
    createContentWorkspaceMock.mockResolvedValue({ ok: true, workspace: WORKSPACE })
    const workspace = await prepareWorldLocalWorkspace(WORLD_ID, null, 'dnd5e')
    expect(workspace).toBe(WORKSPACE)
    expect(createContentWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceKey: worldLocalWorkspaceKey(WORLD_ID), systemKey: 'dnd5e' }),
      null
    )
  })

  it('a concurrent-creation race (key-taken) re-reads rather than erroring', async () => {
    getContentWorkspaceByKeyMock.mockResolvedValueOnce(null).mockResolvedValueOnce(WORKSPACE)
    createContentWorkspaceMock.mockResolvedValue({ ok: false, stage: 'key-taken', workspaceKey: worldLocalWorkspaceKey(WORLD_ID) })
    const workspace = await prepareWorldLocalWorkspace(WORLD_ID, null, 'dnd5e')
    expect(workspace).toBe(WORKSPACE)
  })
})

describe('customizeEntityForWorld -- the one workflow', () => {
  const input = {
    worldId: WORLD_ID,
    entityType: 'item',
    slug: 'shortsword-xphb',
    edits: [{ channel: 'presentation' as const, path: 'description', value: ['A fine blade.'] }],
    actorAccountId: 'acct-1',
    expectedRevision: null
  }

  it('resolver-disabled is reported before anything is prepared', async () => {
    isEffectiveContentEnabledMock.mockReturnValue(false)
    const result = await customizeEntityForWorld(input, 'dnd5e')
    expect(result).toMatchObject({ ok: false, stage: 'resolver-disabled' })
    expect(createContentWorkspaceMock).not.toHaveBeenCalled()
    expect(importIntoWorkspaceMock).not.toHaveBeenCalled()
  })

  it('needs-preparation: prepares the local workspace, imports exactly one entity, SAVES, then activates (binds) last', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37' }] }
    })
    getContentWorkspaceByKeyMock.mockResolvedValue(null)
    createContentWorkspaceMock.mockResolvedValue({ ok: true, workspace: WORKSPACE })
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_new', entityType: 'item', slug: 'shortsword-xphb' }])
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: true })
    getWorkspaceEntityDetailMock.mockResolvedValue({ revision: 0, entityType: 'item' })
    applyEntityEditsMock.mockResolvedValue({ ok: true, entity: { revision: 1 } })

    const result = await customizeEntityForWorld(input, 'dnd5e')

    expect(importIntoWorkspaceMock).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: 'entity', packageId: 'eldra.solaris.xphb', version: '1.0.37', entityType: 'item', slug: 'shortsword-xphb' },
      dryRun: false
    }))
    expect(bindWorkspaceLiveToWorldMock).toHaveBeenCalledWith(WORLD_ID, 'ws-1')
    expect(applyEntityEditsMock).toHaveBeenCalledWith('ws-1', 'ce_new', 0, 'item', expect.any(Array), 'acct-1')
    expect(result).toEqual({ ok: true, workspaceId: 'ws-1', contentEntityId: 'ce_new', entity: { revision: 1 } })

    // Ordering, not just presence: save must happen BEFORE bind.
    const saveOrder = applyEntityEditsMock.mock.invocationCallOrder[0]
    const bindOrder = bindWorkspaceLiveToWorldMock.mock.invocationCallOrder[0]
    expect(saveOrder).toBeLessThan(bindOrder)
  })

  it('a mechanics-only first edit is accepted, serialized with a null baseValueHash (no prior presentation to hash)', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37' }] }
    })
    getContentWorkspaceByKeyMock.mockResolvedValue(null)
    createContentWorkspaceMock.mockResolvedValue({ ok: true, workspace: WORKSPACE })
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_new', entityType: 'item', slug: 'shortsword-xphb' }])
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: true })
    getWorkspaceEntityDetailMock.mockResolvedValue({ revision: 0, entityType: 'item' })
    applyEntityEditsMock.mockResolvedValue({ ok: true, entity: { revision: 1 } })

    const mechanicsInput = {
      ...input,
      edits: [{ channel: 'mechanics' as const, path: 'damage', value: { dice: '2d12', damageType: 'P' } }]
    }
    const result = await customizeEntityForWorld(mechanicsInput, 'dnd5e')

    expect(applyEntityEditsMock).toHaveBeenCalledWith(
      'ws-1', 'ce_new', 0, 'item',
      [{ channel: 'mechanics', path: 'damage', value: { dice: '2d12', damageType: 'P' }, baseValueHash: null }],
      'acct-1'
    )
    expect(result).toMatchObject({ ok: true })
  })

  it('a mixed presentation + mechanics first edit saves BOTH in one combined call', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37' }] }
    })
    getContentWorkspaceByKeyMock.mockResolvedValue(null)
    createContentWorkspaceMock.mockResolvedValue({ ok: true, workspace: WORKSPACE })
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_new', entityType: 'item', slug: 'shortsword-xphb' }])
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: true })
    getWorkspaceEntityDetailMock.mockResolvedValue({ revision: 0, entityType: 'item' })
    applyEntityEditsMock.mockResolvedValue({ ok: true, entity: { revision: 1 } })

    const mixedInput = {
      ...input,
      edits: [
        { channel: 'presentation' as const, path: 'description', value: ['A fine blade.'] },
        { channel: 'mechanics' as const, path: 'rarity', value: 'rare' }
      ]
    }
    await customizeEntityForWorld(mixedInput, 'dnd5e')

    expect(applyEntityEditsMock).toHaveBeenCalledTimes(1)
    expect(applyEntityEditsMock).toHaveBeenCalledWith(
      'ws-1', 'ce_new', 0, 'item',
      [
        { channel: 'presentation', path: 'description', value: ['A fine blade.'], baseValueHash: 'hash-1' },
        { channel: 'mechanics', path: 'rarity', value: 'rare', baseValueHash: null }
      ],
      'acct-1'
    )
  })

  it('save succeeds, activation (bind) fails: reported as "saved but not yet live," never a false success, and the saved entity is returned', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37' }] }
    })
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_new', entityType: 'item', slug: 'shortsword-xphb' }])
    getWorkspaceEntityDetailMock.mockResolvedValue({ revision: 0, entityType: 'item' })
    applyEntityEditsMock.mockResolvedValue({ ok: true, entity: { revision: 1, contentEntityId: 'ce_new' } })
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: false, stage: 'workspace-not-found' })

    const result = await customizeEntityForWorld(input, 'dnd5e')

    expect(result).toEqual({
      ok: false,
      stage: 'activation-failed',
      message: expect.stringContaining('saved'),
      retrySafe: true,
      workspaceId: 'ws-1',
      contentEntityId: 'ce_new',
      entity: { revision: 1, contentEntityId: 'ce_new' }
    })
    // The save genuinely happened -- this is not reported as import-failed
    // or conflict, which would wrongly suggest the edit itself was lost.
    expect(applyEntityEditsMock).toHaveBeenCalled()
  })

  it('existing-workspace (already local): reuses it, never re-imports or re-binds', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-1', contentEntityId: 'ce_existing' }] }
    })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID)])
    getWorkspaceEntityDetailMock.mockResolvedValue({ revision: 2, entityType: 'item' })
    applyEntityEditsMock.mockResolvedValue({ ok: true, entity: { revision: 3 } })

    const result = await customizeEntityForWorld({ ...input, expectedRevision: 2 }, 'dnd5e')

    expect(createContentWorkspaceMock).not.toHaveBeenCalled()
    expect(importIntoWorkspaceMock).not.toHaveBeenCalled()
    expect(bindWorkspaceLiveToWorldMock).not.toHaveBeenCalled()
    expect(applyEntityEditsMock).toHaveBeenCalledWith('ws-1', 'ce_existing', 2, 'item', expect.any(Array), 'acct-1')
    expect(result).toMatchObject({ ok: true, workspaceId: 'ws-1', contentEntityId: 'ce_existing' })
  })

  it('existing-workspace with no expectedRevision is refused, not silently applied', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-1', contentEntityId: 'ce_existing' }] }
    })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID)])

    const result = await customizeEntityForWorld(input, 'dnd5e') // expectedRevision: null

    expect(result).toMatchObject({ ok: false, stage: 'conflict' })
    expect(applyEntityEditsMock).not.toHaveBeenCalled()
  })

  it('an import failure is reported, never silently treated as success', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37' }] }
    })
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    importIntoWorkspaceMock.mockResolvedValue({ ok: false, stage: 'write-failed', message: 'connection reset', progress: {}, retrySafe: true })

    const result = await customizeEntityForWorld(input, 'dnd5e')

    expect(result).toEqual({ ok: false, stage: 'import-failed', message: 'connection reset', retrySafe: true })
    expect(applyEntityEditsMock).not.toHaveBeenCalled()
  })

  it('a save conflict from the atomic module is surfaced as a conflict, not a generic failure', async () => {
    resolveEffectiveContentMock.mockResolvedValue({
      byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-1', contentEntityId: 'ce_existing' }] }
    })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID)])
    getWorkspaceEntityDetailMock.mockResolvedValue({ revision: 2, entityType: 'item' })
    applyEntityEditsMock.mockResolvedValue({ ok: false, stage: 'conflict', current: { revision: 5 } })

    const result = await customizeEntityForWorld({ ...input, expectedRevision: 2 }, 'dnd5e')

    expect(result).toEqual({ ok: false, stage: 'conflict', message: expect.any(String), current: { revision: 5 } })
  })
})

describe('splitSharedEntityToLocalWorkspace -- "Customize for this World" from a shared entity', () => {
  const splitInput = { worldId: WORLD_ID, entityType: 'item', slug: 'shortsword-xphb', actorAccountId: 'acct-1' }

  it('refuses when the target is not actually a shared workspace entity', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'eldra.solaris.xphb', packageVersion: '1.0.0', presentation: null, data: {} }] } })
    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')
    expect(result).toMatchObject({ ok: false, stage: 'not-found' })
  })

  it('refuses when the workspace is bound only to this World (scope local, not shared)', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-1', contentEntityId: 'ce_1' }] } })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID)])
    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')
    expect(result).toMatchObject({ ok: false, stage: 'not-shared' })
    expect(importIntoWorkspaceMock).not.toHaveBeenCalled()
  })

  it('refuses when the shared entity has no base release reference (authored-origin, nothing to re-import)', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-shared', contentEntityId: 'ce_1' }] } })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID), '6'])
    getWorkspaceEntityDetailMock.mockResolvedValue({ baseSourceRef: null, authoredPresentation: [], authoredMechanics: [] })

    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')
    expect(result).toMatchObject({ ok: false, stage: 'no-base-reference' })
    expect(importIntoWorkspaceMock).not.toHaveBeenCalled()
  })

  it('imports from the ORIGINAL release, seeds the shared entity\'s CURRENT overrides, then binds the local workspace', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-shared', contentEntityId: 'ce_shared' }] } })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID), '6'])
    getWorkspaceEntityDetailMock
      .mockResolvedValueOnce({ // the SHARED entity's own detail
        baseSourceRef: { packageId: 'eldra.solaris.xphb', version: '1.0.37' },
        authoredPresentation: [{ path: 'description', value: ['Shared edit.'] }],
        authoredMechanics: []
      })
      .mockResolvedValueOnce({ revision: 0, entityType: 'item' }) // the fresh local entity, right after import
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_local', entityType: 'item', slug: 'shortsword-xphb' }])
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: true })
    applyEntityEditsMock.mockResolvedValue({ ok: true, entity: { revision: 1 } })

    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')

    expect(importIntoWorkspaceMock).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: 'entity', packageId: 'eldra.solaris.xphb', version: '1.0.37', entityType: 'item', slug: 'shortsword-xphb' }
    }))
    expect(applyEntityEditsMock).toHaveBeenCalledWith(
      'ws-1', 'ce_local', 0, 'item',
      [{ channel: 'presentation', path: 'description', value: ['Shared edit.'], baseValueHash: 'hash-1' }],
      'acct-1'
    )
    expect(bindWorkspaceLiveToWorldMock).toHaveBeenCalledWith(WORLD_ID, 'ws-1')
    expect(result).toEqual({ ok: true, workspaceId: 'ws-1', contentEntityId: 'ce_local', entity: { revision: 1 } })

    // ORDER: seed before bind -- the seed call's own expectedRevision (0)
    // is the revision from right after import, proving it ran before any
    // bind-driven re-read, and the bind call happens strictly after the
    // seed call resolves (both are awaited sequentially in the function;
    // invocationCallOrder proves this is not incidental).
    const seedOrder = applyEntityEditsMock.mock.invocationCallOrder[0]!
    const bindOrder = bindWorkspaceLiveToWorldMock.mock.invocationCallOrder[0]!
    expect(seedOrder).toBeLessThan(bindOrder)

    // Required regression evidence: the SHARED workspace ('ws-shared',
    // bound to WORLD_ID and '6' both) and its own entity ('ce_shared')
    // are never passed to any write primitive -- every write targets
    // ONLY the brand-new LOCAL workspace/entity ('ws-1'/'ce_local'). B
    // (World '6') and the shared source are therefore structurally
    // unreachable from this call, not merely unaffected by coincidence.
    expect(bindWorkspaceLiveToWorldMock).not.toHaveBeenCalledWith(expect.anything(), 'ws-shared')
    expect(applyEntityEditsMock).not.toHaveBeenCalledWith('ws-shared', expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything())
    expect(applyEntityEditsMock).not.toHaveBeenCalledWith(expect.anything(), 'ce_shared', expect.anything(), expect.anything(), expect.anything(), expect.anything())
  })

  it('an entity with NO current overrides is imported, seeding is skipped (nothing to seed), and it still binds', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-shared', contentEntityId: 'ce_shared' }] } })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID), '6'])
    getWorkspaceEntityDetailMock
      .mockResolvedValueOnce({ baseSourceRef: { packageId: 'eldra.solaris.xphb', version: '1.0.37' }, authoredPresentation: [], authoredMechanics: [] })
      .mockResolvedValueOnce({ revision: 0, entityType: 'item' })
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_local', entityType: 'item', slug: 'shortsword-xphb' }])
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: true })

    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')

    expect(applyEntityEditsMock).not.toHaveBeenCalled()
    expect(bindWorkspaceLiveToWorldMock).toHaveBeenCalledWith(WORLD_ID, 'ws-1')
    expect(result).toEqual({ ok: true, workspaceId: 'ws-1', contentEntityId: 'ce_local', entity: { revision: 0, entityType: 'item' } })
  })

  // Items Mechanics Editing, release one -- the fix: a shared entity's
  // authoredMechanics is now carried over to the new local copy, exactly
  // like authoredPresentation already was. Confirmed missing before this
  // release (see this release's own investigation).
  it('seeds presentation AND mechanics overrides together in ONE combined applyEntityEdits call', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-shared', contentEntityId: 'ce_shared' }] } })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID), '6'])
    getWorkspaceEntityDetailMock
      .mockResolvedValueOnce({ // the SHARED entity's own detail
        baseSourceRef: { packageId: 'eldra.solaris.xphb', version: '1.0.37' },
        authoredPresentation: [{ path: 'description', value: ['Shared edit.'] }],
        authoredMechanics: [{ path: 'rarity', value: 'rare' }]
      })
      .mockResolvedValueOnce({ revision: 0, entityType: 'item' }) // the fresh local entity, right after import
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_local', entityType: 'item', slug: 'shortsword-xphb' }])
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: true })
    applyEntityEditsMock.mockResolvedValue({ ok: true, entity: { revision: 1 } })

    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')

    // ONE call, not two -- both channels in the same edits array.
    expect(applyEntityEditsMock).toHaveBeenCalledTimes(1)
    expect(applyEntityEditsMock).toHaveBeenCalledWith(
      'ws-1', 'ce_local', 0, 'item',
      expect.arrayContaining([
        { channel: 'presentation', path: 'description', value: ['Shared edit.'], baseValueHash: 'hash-1' },
        { channel: 'mechanics', path: 'rarity', value: 'rare', baseValueHash: null }
      ]),
      'acct-1'
    )
    expect(result).toEqual({ ok: true, workspaceId: 'ws-1', contentEntityId: 'ce_local', entity: { revision: 1 } })
  })

  // The core fix this pass makes: a seed failure must NEVER leave an
  // already-bound, incompletely-customized local copy live for players.
  // Proven here by showing bind is never even attempted once the combined
  // seed write fails.
  it('a seed failure NEVER binds the local workspace to the World -- nothing becomes apparently successful', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-shared', contentEntityId: 'ce_shared' }] } })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID), '6'])
    getWorkspaceEntityDetailMock
      .mockResolvedValueOnce({
        baseSourceRef: { packageId: 'eldra.solaris.xphb', version: '1.0.37' },
        authoredPresentation: [{ path: 'description', value: ['Shared edit.'] }],
        authoredMechanics: [{ path: 'rarity', value: 'rare' }]
      })
      .mockResolvedValueOnce({ revision: 0, entityType: 'item' })
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_local', entityType: 'item', slug: 'shortsword-xphb' }])
    applyEntityEditsMock.mockResolvedValue({ ok: false, stage: 'conflict', current: { revision: 1 } })

    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')

    expect(result).toMatchObject({ ok: false, stage: 'import-failed', retrySafe: true })
    expect(bindWorkspaceLiveToWorldMock).not.toHaveBeenCalled()
  })

  it('a seed persistence-unavailable failure is reported distinctly and still never binds', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-shared', contentEntityId: 'ce_shared' }] } })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID), '6'])
    getWorkspaceEntityDetailMock
      .mockResolvedValueOnce({
        baseSourceRef: { packageId: 'eldra.solaris.xphb', version: '1.0.37' },
        authoredPresentation: [],
        authoredMechanics: [{ path: 'rarity', value: 'rare' }]
      })
      .mockResolvedValueOnce({ revision: 0, entityType: 'item' })
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_local', entityType: 'item', slug: 'shortsword-xphb' }])
    applyEntityEditsMock.mockResolvedValue({ ok: false, stage: 'persistence-unavailable', message: 'ELDRA_WORKSPACE_DB_URL is not configured' })

    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')

    expect(result).toEqual({ ok: false, stage: 'persistence-unavailable', message: 'ELDRA_WORKSPACE_DB_URL is not configured' })
    expect(bindWorkspaceLiveToWorldMock).not.toHaveBeenCalled()
  })

  it('a bind failure after a successful seed is reported as failure (the local copy stays unbound, harmless)', async () => {
    resolveEffectiveContentMock.mockResolvedValue({ byEntityType: { item: [{ slug: 'shortsword-xphb', packageId: 'workspace.ws-shared', contentEntityId: 'ce_shared' }] } })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([String(WORLD_ID), '6'])
    getWorkspaceEntityDetailMock
      .mockResolvedValueOnce({
        baseSourceRef: { packageId: 'eldra.solaris.xphb', version: '1.0.37' },
        authoredPresentation: [{ path: 'description', value: ['Shared edit.'] }],
        authoredMechanics: []
      })
      .mockResolvedValueOnce({ revision: 0, entityType: 'item' })
    getContentWorkspaceByKeyMock.mockResolvedValue(WORKSPACE)
    importIntoWorkspaceMock.mockResolvedValue({ ok: true, applied: true, progress: { entitiesCreated: 1 } })
    listWorkspaceEntityIdentitiesMock.mockResolvedValue([{ contentEntityId: 'ce_local', entityType: 'item', slug: 'shortsword-xphb' }])
    applyEntityEditsMock.mockResolvedValue({ ok: true, entity: { revision: 1 } })
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: false, stage: 'workspace-not-found' })

    const result = await splitSharedEntityToLocalWorkspace(splitInput, 'dnd5e')

    expect(applyEntityEditsMock).toHaveBeenCalledTimes(1) // seeding still ran, correctly, before the bind attempt
    expect(result).toMatchObject({ ok: false, stage: 'import-failed', retrySafe: true })
  })
})
