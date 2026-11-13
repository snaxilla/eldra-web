// Content Workspace entity editing -- Phase 4.
//
// What matters: a write conditions on expectedRevision via the genuinely
// atomic content-workspace-entity-atomic.ts module (mocked here at that
// boundary -- its own real-Postgres correctness is proven separately in
// tests/integration/content-workspace-entity-atomic.integration.test.ts);
// an invalid path is refused before any read or write is attempted; every
// accepted edit computes the right diff and column; revert removes
// exactly the targeted override(s); a checkpoint never touches the
// entity's payload and stays on the Directus REST path (it mutates no
// revision-gated state, so it needs no atomic gate).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyPresentationEdits,
  createEntityCheckpoint,
  getWorkspaceEntityDetail,
  revertPresentationChannel,
  revertPresentationPath
} from '../../../server/utils/content-workspace-entities'

const { directusServiceRequestMock, writeOverrideAtomicMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  writeOverrideAtomicMock: vi.fn()
}))
vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))
vi.mock('../../../server/utils/content-workspace-entity-atomic', () => ({
  writeWorkspaceEntityOverrideAtomic: writeOverrideAtomicMock
}))

const WORKSPACE_ID = 'a1111111-1111-4111-8111-111111111111'
const CONTENT_ENTITY_ID = 'ce_abcdefghijklmnopqrstuvwxyz'
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function entityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1111111-1111-4111-8111-111111111111',
    workspace_id: WORKSPACE_ID,
    content_entity_id: CONTENT_ENTITY_ID,
    system_key: 'dnd5e',
    entity_type: 'item',
    slug: 'shortsword-xphb',
    title: 'Shortsword',
    origin: 'imported',
    state: 'active',
    revision: 0,
    base_data: { systemKey: 'dnd5e', entityType: 'item', title: 'Shortsword', slug: 'shortsword-xphb', externalId: 'x', provider: '5etools', data: { name: 'Shortsword' } },
    base_data_hash: 'sha256-base',
    base_source_ref: { provider: '5etools', externalId: 'x' },
    base_missing: false,
    base_refs: [],
    slug_aliases: [],
    authored_data: null,
    authored_presentation: [],
    authored_mechanics: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  writeOverrideAtomicMock.mockReset()
})

describe('getWorkspaceEntityDetail', () => {
  it('normalizes a full row, including payload columns the listing deliberately omits', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [entityRow()] })
    const detail = await getWorkspaceEntityDetail(WORKSPACE_ID, CONTENT_ENTITY_ID)
    expect(detail).toMatchObject({ contentEntityId: CONTENT_ENTITY_ID, revision: 0, baseDataHash: 'sha256-base' })
    expect(detail?.authoredPresentation).toEqual([])
  })

  it('returns null when no such entity exists', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [] })
    expect(await getWorkspaceEntityDetail(WORKSPACE_ID, CONTENT_ENTITY_ID)).toBeNull()
  })
})

describe('applyPresentationEdits', () => {
  it('refuses a path outside the presentation allowlist WITHOUT reading or writing anything', async () => {
    const outcome = await applyPresentationEdits(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, [{ path: 'data', value: 'x', baseValueHash: null }], ACCOUNT_ID)
    expect(outcome).toEqual({ ok: false, stage: 'invalid-path', path: 'data' })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
    expect(writeOverrideAtomicMock).not.toHaveBeenCalled()
  })

  it('reports not-found when the entity does not exist -- never even attempts the atomic write', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [] })
    const outcome = await applyPresentationEdits(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, [{ path: 'name', value: 'X', baseValueHash: null }], ACCOUNT_ID)
    expect(outcome).toEqual({ ok: false, stage: 'not-found' })
    expect(writeOverrideAtomicMock).not.toHaveBeenCalled()
  })

  it('reports a conflict, with the current entity, when expectedRevision does not match the just-read value -- and never attempts the atomic write', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [entityRow({ revision: 3 })] })
    const outcome = await applyPresentationEdits(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, [{ path: 'name', value: 'X', baseValueHash: null }], ACCOUNT_ID)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok && outcome.stage === 'conflict') expect(outcome.current.revision).toBe(3)
    expect(writeOverrideAtomicMock).not.toHaveBeenCalled()
  })

  it('on success: calls the atomic writer with the correct column, computed override list, and diff', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [entityRow({ revision: 0 })] })
    writeOverrideAtomicMock.mockResolvedValueOnce({
      ok: true,
      entity: entityRow({ revision: 1, authored_presentation: [{ channel: 'presentation', path: 'name', value: 'Fine Shortsword', authoredBy: ACCOUNT_ID, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] })
    })

    const outcome = await applyPresentationEdits(
      WORKSPACE_ID, CONTENT_ENTITY_ID, 0,
      [{ path: 'name', value: 'Fine Shortsword', baseValueHash: 'sha256-x' }],
      ACCOUNT_ID
    )

    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.entity.revision).toBe(1)

    expect(writeOverrideAtomicMock).toHaveBeenCalledTimes(1)
    const call = writeOverrideAtomicMock.mock.calls[0]![0]
    expect(call.workspaceId).toBe(WORKSPACE_ID)
    expect(call.contentEntityId).toBe(CONTENT_ENTITY_ID)
    expect(call.expectedRevision).toBe(0)
    expect(call.column).toBe('authored_presentation')
    expect(call.newValue).toEqual([{ channel: 'presentation', path: 'name', value: 'Fine Shortsword', authoredBy: ACCOUNT_ID, authoredAt: expect.any(String), baseValueHash: 'sha256-x' }])
    expect(call.revision.kind).toBe('autosave')
    expect(call.revision.diff).toEqual([{ channel: 'presentation', path: 'name', from: undefined, to: 'Fine Shortsword' }])
  })

  it('a conflict reported by the atomic writer itself (a race landed between our read and the write) is surfaced honestly, never a silent success', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [entityRow({ revision: 0 })] })
    writeOverrideAtomicMock.mockResolvedValueOnce({
      ok: false, reason: 'conflict', message: 'stale', current: entityRow({ revision: 1 })
    })

    const outcome = await applyPresentationEdits(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, [{ path: 'name', value: 'X', baseValueHash: null }], ACCOUNT_ID)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok && outcome.stage === 'conflict') expect(outcome.current.revision).toBe(1)
  })

  it('a persistence-unconfigured/failure result from the atomic writer is reported distinctly, never as a conflict or a plain 404', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [entityRow({ revision: 0 })] })
    writeOverrideAtomicMock.mockResolvedValueOnce({ ok: false, reason: 'persistence-unconfigured', message: 'ELDRA_WORKSPACE_DB_URL is not configured' })

    const outcome = await applyPresentationEdits(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, [{ path: 'name', value: 'X', baseValueHash: null }], ACCOUNT_ID)
    expect(outcome).toEqual({ ok: false, stage: 'persistence-unavailable', message: 'ELDRA_WORKSPACE_DB_URL is not configured' })
  })

  it('still succeeds (and the atomic writer still bumps revision) for an edit whose value is identical to the current one', async () => {
    const existing = entityRow({
      revision: 0,
      authored_presentation: [{ channel: 'presentation', path: 'name', value: 'Same', authoredBy: ACCOUNT_ID, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }]
    })
    directusServiceRequestMock.mockResolvedValueOnce({ data: [existing] })
    writeOverrideAtomicMock.mockResolvedValueOnce({ ok: true, entity: { ...existing, revision: 1 } })

    const outcome = await applyPresentationEdits(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, [{ path: 'name', value: 'Same', baseValueHash: null }], ACCOUNT_ID)
    expect(outcome.ok).toBe(true)
    // diff is still computed and handed to the atomic writer -- the module
    // itself writes a history row unconditionally now (see that module's
    // own header), so an empty diff array reaching it is a legitimate,
    // honestly-recorded "nothing textually changed" event, not a reason
    // to skip the call.
    const call = writeOverrideAtomicMock.mock.calls[0]![0]
    expect(call.revision.diff).toEqual([])
  })
})

describe('revertPresentationPath / revertPresentationChannel', () => {
  it('revertPresentationPath computes the override list with exactly the targeted path removed', async () => {
    const existing = entityRow({
      revision: 0,
      authored_presentation: [
        { channel: 'presentation', path: 'name', value: 'Fine Shortsword', authoredBy: ACCOUNT_ID, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null },
        { channel: 'presentation', path: 'sourceBook', value: 'Homebrew', authoredBy: ACCOUNT_ID, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }
      ]
    })
    directusServiceRequestMock.mockResolvedValueOnce({ data: [existing] })
    writeOverrideAtomicMock.mockResolvedValueOnce({
      ok: true,
      entity: { ...existing, authored_presentation: [existing.authored_presentation[1]], revision: 1 }
    })

    const outcome = await revertPresentationPath(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, 'name', ACCOUNT_ID)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.entity.authoredPresentation.map((o) => o.path)).toEqual(['sourceBook'])

    const call = writeOverrideAtomicMock.mock.calls[0]![0]
    expect(call.newValue).toEqual([existing.authored_presentation[1]])
    expect(call.revision.kind).toBe('revert')
  })

  it('revertPresentationChannel computes an empty override list in one call', async () => {
    const existing = entityRow({
      revision: 0,
      authored_presentation: [{ channel: 'presentation', path: 'name', value: 'Fine Shortsword', authoredBy: ACCOUNT_ID, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }]
    })
    directusServiceRequestMock.mockResolvedValueOnce({ data: [existing] })
    writeOverrideAtomicMock.mockResolvedValueOnce({ ok: true, entity: { ...existing, authored_presentation: [], revision: 1 } })

    const outcome = await revertPresentationChannel(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, ACCOUNT_ID)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.entity.authoredPresentation).toEqual([])
    expect(writeOverrideAtomicMock.mock.calls[0]![0].newValue).toEqual([])
  })
})

describe('createEntityCheckpoint', () => {
  it('writes a checkpoint revision carrying a snapshot, and touches no entity payload (never calls the atomic writer)', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [entityRow({ revision: 2 })] })
      .mockResolvedValueOnce({ data: [{ id: 'rev-1' }] })

    const outcome = await createEntityCheckpoint(WORKSPACE_ID, CONTENT_ENTITY_ID, 'Before the big revision', ACCOUNT_ID)
    expect(outcome).toEqual({ ok: true, revisionId: 'rev-1' })

    expect(directusServiceRequestMock).toHaveBeenCalledTimes(2) // read + revision write only; never a PATCH to the entity
    expect(writeOverrideAtomicMock).not.toHaveBeenCalled()
    const revisionCall = directusServiceRequestMock.mock.calls[1]
    expect(revisionCall[1].body.kind).toBe('checkpoint')
    expect(revisionCall[1].body.label).toBe('Before the big revision')
    expect(revisionCall[1].body.snapshot).toMatchObject({ revision: 2 })
  })

  it('reports not-found rather than writing a checkpoint for a nonexistent entity', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [] })
    expect(await createEntityCheckpoint(WORKSPACE_ID, CONTENT_ENTITY_ID, 'label', ACCOUNT_ID)).toEqual({ ok: false, stage: 'not-found' })
  })
})
