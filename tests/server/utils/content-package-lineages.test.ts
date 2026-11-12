// Package lineage ownership and the single-writer invariant (R11).
// Content Workspaces & Studio §11.
//
// DIRECTUS IS MOCKED AT THE MODULE BOUNDARY, BUT ITS FAILURES ARE NOT
// INVENTED. Every error shape below was observed against a real Directus
// 11.12.0 before being written here -- a missing collection answers 403
// FORBIDDEN (not 404), and a unique-constraint violation answers 400 with
// extensions.code RECORD_NOT_UNIQUE. Phase 0 shipped a mock that accepted
// a request the real server rejected; these shapes exist so that cannot
// happen to this module.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adoptPackageLineage,
  checkLineagePublication,
  findPackageLineage,
  releasePackageLineage,
  transferPackageLineage
} from '../../../server/utils/content-package-lineages'
import { ContentWorkspaceSchemaError } from '../../../server/utils/content-workspace-schema'

const { directusServiceRequestMock } = vi.hoisted(() => ({ directusServiceRequestMock: vi.fn() }))
vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))

const WORKSPACE = 'a1111111-1111-4111-8111-111111111111'
const OTHER_WORKSPACE = 'b2222222-2222-4222-8222-222222222222'

// Exactly what Directus 11.12.0 returns for a collection that is not in
// the schema, on BOTH /items/<c> and /collections/<c>.
function forbidden() {
  return Object.assign(new Error('You don\'t have permission to access this.'), {
    statusCode: 403,
    data: { errors: [{ message: "You don't have permission to access this.", extensions: { code: 'FORBIDDEN' } }] }
  })
}

function recordNotUnique(field = 'package_id') {
  return Object.assign(new Error('has to be unique'), {
    statusCode: 400,
    data: {
      errors: [{
        message: `Value for field "${field}" has to be unique.`,
        extensions: { collection: 'content_package_lineages', field, code: 'RECORD_NOT_UNIQUE' }
      }]
    }
  })
}

function lineageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    package_id: 'eldra.solaris.xphb',
    owner_workspace_id: null,
    status: 'unadopted',
    supersedes: [],
    adopted_at: null,
    adopted_by_account_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

beforeEach(() => {
  // A BLOCK body on purpose: `mockReset()` returns the mock, and an
  // arrow that implicitly returns it makes Vitest await the mock as a
  // thenable -- which invokes it outside any handler and turns the next
  // rejection into an unhandled one.
  directusServiceRequestMock.mockReset()
})

describe('checkLineagePublication -- before adoption', () => {
  it('allows publication when the lineage has no registry row', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [] })
    await expect(checkLineagePublication('eldra.solaris.xphb')).resolves.toEqual({ allowed: true })
  })

  it('allows publication when the registry collection does not exist at all', async () => {
    // Before Phase 1 provisioning, nothing can have been adopted, so
    // every existing publisher must keep working untouched.
    directusServiceRequestMock
      .mockRejectedValueOnce(forbidden())  // /items/content_package_lineages
      .mockRejectedValueOnce(forbidden())  // /collections/content_package_lineages
    await expect(checkLineagePublication('eldra.solaris.xphb')).resolves.toEqual({ allowed: true })
  })

  it('allows publication for a row that exists but is unadopted', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [lineageRow()] })
    await expect(checkLineagePublication('eldra.solaris.xphb')).resolves.toEqual({ allowed: true })
  })

  it('FAILS CLOSED when the registry exists but cannot be read', async () => {
    // "I could not check who may publish" must never be read as "anyone
    // may publish".
    directusServiceRequestMock
      .mockRejectedValueOnce(forbidden())        // items read refused
      .mockResolvedValueOnce({ data: { collection: 'content_package_lineages' } }) // but the collection IS there
    await expect(checkLineagePublication('eldra.solaris.xphb')).rejects.toThrow(/Cannot verify who may publish/)
  })
})

describe('checkLineagePublication -- after adoption', () => {
  it('REFUSES the legacy publisher, naming the owning workspace', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({
      data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })]
    })

    const decision = await checkLineagePublication('eldra.solaris.xphb', { kind: 'legacy' })
    expect(decision.allowed).toBe(false)
    if (decision.allowed) return
    expect(decision.ownerWorkspaceId).toBe(WORKSPACE)
    expect(decision.message).toContain(WORKSPACE)
  })

  it('explains the refusal without claiming a workspace re-import happened', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({
      data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })]
    })

    const decision = await checkLineagePublication('eldra.solaris.xphb')
    if (decision.allowed) throw new Error('expected a refusal')
    expect(decision.message).toContain('Nothing was published and nothing was imported')
    expect(decision.message).toMatch(/release it from its workspace/i)
    expect(decision.message).not.toMatch(/re-?imported into the workspace\b(?!.*not)/i)
  })

  it('allows the owning workspace to publish its own lineage', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({
      data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })]
    })
    await expect(checkLineagePublication('eldra.solaris.xphb', { kind: 'workspace', workspaceId: WORKSPACE }))
      .resolves.toEqual({ allowed: true })
  })

  it('refuses a DIFFERENT workspace', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({
      data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })]
    })
    const decision = await checkLineagePublication('eldra.solaris.xphb', { kind: 'workspace', workspaceId: OTHER_WORKSPACE })
    expect(decision.allowed).toBe(false)
  })

  it('refuses EVERY publisher for a frozen lineage, the owner included', async () => {
    for (const publisher of [{ kind: 'legacy' as const }, { kind: 'workspace' as const, workspaceId: WORKSPACE }]) {
      directusServiceRequestMock.mockResolvedValueOnce({
        data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'frozen' })]
      })
      const decision = await checkLineagePublication('eldra.solaris.xphb', publisher)
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) expect(decision.message).toContain('frozen')
    }
  })
})

describe('adoptPackageLineage', () => {
  it('inserts a registry row for an unknown lineage', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' }) })

    const result = await adoptPackageLineage({ packageId: 'eldra.solaris.xphb', workspaceId: WORKSPACE, accountId: 'acct-1' })
    expect(result).toMatchObject({ ok: true, changed: true })

    const [, insert] = directusServiceRequestMock.mock.calls[1]!
    expect(insert.method).toBe('POST')
    expect(insert.body).toMatchObject({ package_id: 'eldra.solaris.xphb', owner_workspace_id: WORKSPACE, status: 'adopted' })
  })

  it('REFUSES a lineage another workspace owns, naming the owner', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({
      data: [lineageRow({ owner_workspace_id: OTHER_WORKSPACE, status: 'adopted' })]
    })

    await expect(adoptPackageLineage({ packageId: 'eldra.solaris.xphb', workspaceId: WORKSPACE, accountId: null }))
      .resolves.toEqual({ ok: false, stage: 'owned-by-other', ownerWorkspaceId: OTHER_WORKSPACE })
  })

  it('is idempotent for the workspace that already owns it, and writes nothing', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({
      data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })]
    })

    const result = await adoptPackageLineage({ packageId: 'eldra.solaris.xphb', workspaceId: WORKSPACE, accountId: null })
    expect(result).toMatchObject({ ok: true, changed: false })
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
  })

  it('lets the DATABASE arbitrate a simultaneous adoption, then reports the loser honestly', async () => {
    // Two adopters, no row yet. Both insert; the unique constraint on
    // package_id decides. The loser reads back the winner rather than
    // retrying or overwriting.
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(recordNotUnique())
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: OTHER_WORKSPACE, status: 'adopted' })] })

    await expect(adoptPackageLineage({ packageId: 'eldra.solaris.xphb', workspaceId: WORKSPACE, accountId: null }))
      .resolves.toEqual({ ok: false, stage: 'owned-by-other', ownerWorkspaceId: OTHER_WORKSPACE })
  })

  it('claims an existing unowned row and confirms the claim by reading it back', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [lineageRow()] })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })] })

    await expect(adoptPackageLineage({ packageId: 'eldra.solaris.xphb', workspaceId: WORKSPACE, accountId: null }))
      .resolves.toMatchObject({ ok: true, changed: true })
  })

  it('reports the real owner when the read-back shows someone else won the claim', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [lineageRow()] })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: OTHER_WORKSPACE, status: 'adopted' })] })

    await expect(adoptPackageLineage({ packageId: 'eldra.solaris.xphb', workspaceId: WORKSPACE, accountId: null }))
      .resolves.toEqual({ ok: false, stage: 'owned-by-other', ownerWorkspaceId: OTHER_WORKSPACE })
  })

  it('refuses to adopt a frozen lineage', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [lineageRow({ status: 'frozen', owner_workspace_id: WORKSPACE })] })
    await expect(adoptPackageLineage({ packageId: 'eldra.solaris.xphb', workspaceId: WORKSPACE, accountId: null }))
      .resolves.toEqual({ ok: false, stage: 'frozen' })
  })

  it('reports an unprovisioned schema as an actionable error, never as "not adopted"', async () => {
    directusServiceRequestMock.mockRejectedValueOnce(forbidden())
    await expect(adoptPackageLineage({ packageId: 'eldra.solaris.xphb', workspaceId: WORKSPACE, accountId: null }))
      .rejects.toBeInstanceOf(ContentWorkspaceSchemaError)
  })
})

describe('transferPackageLineage', () => {
  it('moves ownership and confirms it by reading the row back', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })] })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: OTHER_WORKSPACE, status: 'adopted' })] })

    await expect(transferPackageLineage({ packageId: 'eldra.solaris.xphb', toWorkspaceId: OTHER_WORKSPACE, accountId: null }))
      .resolves.toMatchObject({ ok: true, previousOwnerWorkspaceId: WORKSPACE })
  })

  it('refuses to transfer a lineage nobody owns', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [lineageRow()] })
    await expect(transferPackageLineage({ packageId: 'eldra.solaris.xphb', toWorkspaceId: OTHER_WORKSPACE, accountId: null }))
      .resolves.toEqual({ ok: false, stage: 'not-adopted' })
  })

  it('reports a conflict instead of overwriting an owner that changed mid-transfer', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })] })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: 'c3333333-3333-4333-8333-333333333333', status: 'adopted' })] })

    await expect(transferPackageLineage({ packageId: 'eldra.solaris.xphb', toWorkspaceId: OTHER_WORKSPACE, accountId: null }))
      .resolves.toMatchObject({ ok: false, stage: 'conflict' })
  })
})

describe('releasePackageLineage -- the escape hatch', () => {
  it('deletes the row so the next adoption is arbitrated by the unique constraint again', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted' })] })
      .mockResolvedValueOnce({ data: null })

    await expect(releasePackageLineage('eldra.solaris.xphb')).resolves.toEqual({ ok: true, previousOwnerWorkspaceId: WORKSPACE })
    expect(directusServiceRequestMock.mock.calls[1]![1].method).toBe('DELETE')
  })

  it('keeps a row that carries supersedes relations, blanking only the ownership', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [lineageRow({ owner_workspace_id: WORKSPACE, status: 'adopted', supersedes: ['eldra.old.pack'] })] })
      .mockResolvedValueOnce({ data: {} })

    await expect(releasePackageLineage('eldra.solaris.xphb')).resolves.toMatchObject({ ok: true })
    const [, call] = directusServiceRequestMock.mock.calls[1]!
    expect(call.method).toBe('PATCH')
    expect(call.body).toMatchObject({ owner_workspace_id: null, status: 'unadopted' })
  })

  it('refuses when nothing is adopted', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [] })
    await expect(releasePackageLineage('eldra.solaris.xphb')).resolves.toEqual({ ok: false, stage: 'not-adopted' })
  })
})

describe('findPackageLineage', () => {
  it('normalizes an unknown status to unadopted rather than trusting the stored string', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [lineageRow({ status: 'nonsense' })] })
    await expect(findPackageLineage('eldra.solaris.xphb')).resolves.toMatchObject({ status: 'unadopted' })
  })

  it('returns null for a lineage with no row', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [] })
    await expect(findPackageLineage('eldra.solaris.xphb')).resolves.toBeNull()
  })
})
