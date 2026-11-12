// Content Workspace persistence -- Phase 3.
//
// What matters here: an unprovisioned schema must be an actionable
// error rather than an empty list, listings must stay bounded and must
// never select payload columns, and a metadata update must write only
// what the allowlist let through.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendWorkspaceRevision,
  countWorkspaceEntities,
  createContentWorkspace,
  getContentWorkspace,
  listContentWorkspaces,
  listEntitySourceSnapshots,
  listWorkspaceEntities,
  listWorkspaceEntityIdentities,
  listWorkspaceRevisions,
  updateContentWorkspace
} from '../../../server/utils/content-workspaces'
import { ContentWorkspaceSchemaError } from '../../../server/utils/content-workspace-schema'

const { directusServiceRequestMock } = vi.hoisted(() => ({ directusServiceRequestMock: vi.fn() }))
vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))

const WORKSPACE_ID = 'a1111111-1111-4111-8111-111111111111'

function forbidden() {
  return Object.assign(new Error('forbidden'), {
    statusCode: 403,
    data: { errors: [{ extensions: { code: 'FORBIDDEN' } }] }
  })
}

function workspaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKSPACE_ID,
    workspace_key: 'solaris-xphb',
    title: 'Solaris XPHB',
    description: null,
    system_key: 'dnd5e',
    source_game_system_key: null,
    source_collection_key: null,
    status: 'active',
    owner_account_id: null,
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

describe('missing schema', () => {
  it.each([
    ['listContentWorkspaces', () => listContentWorkspaces()],
    ['getContentWorkspace', () => getContentWorkspace(WORKSPACE_ID)],
    ['countWorkspaceEntities', () => countWorkspaceEntities(WORKSPACE_ID)],
    ['listWorkspaceEntityIdentities', () => listWorkspaceEntityIdentities(WORKSPACE_ID)],
    ['listWorkspaceEntities', () => listWorkspaceEntities(WORKSPACE_ID, { limit: 50, offset: 0 }, { entityType: null, search: null })],
    ['listEntitySourceSnapshots', () => listEntitySourceSnapshots(WORKSPACE_ID, 'ce_abcdefghijklmnopqrstuvwxyz', { limit: 50, offset: 0 })],
    ['listWorkspaceRevisions', () => listWorkspaceRevisions(WORKSPACE_ID, undefined, { limit: 50, offset: 0 })]
  ])('%s raises an actionable error rather than returning empty', async (_name, call) => {
    directusServiceRequestMock.mockImplementation(() => Promise.reject(forbidden()))

    await expect(call()).rejects.toBeInstanceOf(ContentWorkspaceSchemaError)
    await expect(call()).rejects.toThrow(/bootstrap\.mjs/)
  })

  it('names the collection that could not be reached', async () => {
    directusServiceRequestMock.mockImplementation(() => Promise.reject(forbidden()))
    await expect(listContentWorkspaces()).rejects.toMatchObject({ collection: 'content_workspaces' })
  })

  it('lets an unrelated failure propagate untouched', async () => {
    directusServiceRequestMock.mockImplementation(() => Promise.reject(new Error('socket hang up')))
    await expect(listContentWorkspaces()).rejects.toThrow('socket hang up')
  })
})

describe('createContentWorkspace', () => {
  it('writes the workspace with its creator recorded for attribution', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: workspaceRow() })

    const result = await createContentWorkspace(
      { workspaceKey: 'solaris-xphb', title: 'Solaris XPHB', description: null, systemKey: 'dnd5e' },
      'acct-1'
    )

    expect(result).toMatchObject({ ok: true })
    const [, call] = directusServiceRequestMock.mock.calls[0]!
    expect(call.method).toBe('POST')
    expect(call.body).toMatchObject({ workspace_key: 'solaris-xphb', system_key: 'dnd5e', status: 'active', owner_account_id: 'acct-1' })
  })

  it('lets the UNIQUE constraint decide a duplicate key, with no read-before-write to race', async () => {
    directusServiceRequestMock.mockRejectedValueOnce(Object.assign(new Error('not unique'), {
      statusCode: 400,
      data: { errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE', field: 'workspace_key' } }] }
    }))

    await expect(createContentWorkspace(
      { workspaceKey: 'solaris-xphb', title: 'x', description: null, systemKey: 'dnd5e' }, null
    )).resolves.toEqual({ ok: false, stage: 'key-taken', workspaceKey: 'solaris-xphb' })

    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
  })
})

describe('updateContentWorkspace', () => {
  it('writes only the fields the allowlist passed, plus updated_at', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: workspaceRow({ title: 'Renamed' }) })

    await updateContentWorkspace(WORKSPACE_ID, { title: 'Renamed' })

    const [, call] = directusServiceRequestMock.mock.calls[0]!
    expect(Object.keys(call.body).sort()).toEqual(['title', 'updated_at'])
  })

  it('can archive without touching anything else', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: workspaceRow({ status: 'archived' }) })

    const workspace = await updateContentWorkspace(WORKSPACE_ID, { status: 'archived' })

    expect(directusServiceRequestMock.mock.calls[0]![1].body).toMatchObject({ status: 'archived' })
    expect(workspace.status).toBe('archived')
  })
})

describe('bounded listings', () => {
  it('passes the caller\'s page through and asks Directus for the real total', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [], meta: { filter_count: 1234 } })

    const result = await listWorkspaceEntities(WORKSPACE_ID, { limit: 25, offset: 50 }, { entityType: null, search: null })

    const [, call] = directusServiceRequestMock.mock.calls[0]!
    expect(call.query).toMatchObject({ limit: 25, offset: 50, meta: 'filter_count' })
    expect(result.total).toBe(1234)
  })

  it('NEVER selects a payload column in the entity listing', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } })
    await listWorkspaceEntities(WORKSPACE_ID, { limit: 50, offset: 0 }, { entityType: null, search: null })

    const fields = String(directusServiceRequestMock.mock.calls[0]![1].query.fields).split(',')
    for (const payload of ['base_data', 'authored_presentation', 'authored_mechanics', 'authored_facet', 'authored_data']) {
      expect(fields).not.toContain(payload)
    }
    // The HASH is selected; the payload it summarizes is not.
    expect(fields).toContain('base_data_hash')
  })

  it('NEVER selects a stored payload in the snapshot listing', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } })
    await listEntitySourceSnapshots(WORKSPACE_ID, 'ce_abcdefghijklmnopqrstuvwxyz', { limit: 50, offset: 0 })

    const fields = String(directusServiceRequestMock.mock.calls[0]![1].query.fields).split(',')
    expect(fields).not.toContain('previous_base_data')
    expect(fields).not.toContain('incoming_base_data')
    expect(fields).toContain('previous_base_data_hash')
  })

  it('always scopes a listing to its own workspace', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } })
    await listWorkspaceEntities(WORKSPACE_ID, { limit: 50, offset: 0 }, { entityType: 'item', search: 'sword' })

    const conditions = directusServiceRequestMock.mock.calls[0]![1].query.filter._and
    expect(conditions).toContainEqual({ workspace_id: { _eq: WORKSPACE_ID } })
    expect(conditions).toContainEqual({ entity_type: { _eq: 'item' } })
    expect(conditions).toContainEqual({ title: { _icontains: 'sword' } })
  })

  it('pages the identity index instead of asking for every row at once', async () => {
    // 500 is the page size; a full page must trigger a second request.
    const page = Array.from({ length: 500 }, (_, index) => ({
      content_entity_id: `ce_${String(index).padStart(26, 'a')}`,
      system_key: 'dnd5e', entity_type: 'item', slug: `item-${index}`, title: `Item ${index}`,
      source_key: null, base_data_hash: null
    }))
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: page })
      .mockResolvedValueOnce({ data: [] })

    const identities = await listWorkspaceEntityIdentities(WORKSPACE_ID)

    expect(identities).toHaveLength(500)
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(2)
    expect(directusServiceRequestMock.mock.calls[1]![1].query.offset).toBe(500)
  })

  it('strips the workspace prefix from a stored source key so the planner sees the upstream address', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({
      data: [{
        content_entity_id: 'ce_abcdefghijklmnopqrstuvwxyz', system_key: 'dnd5e', entity_type: 'item',
        slug: 'shortsword-xphb', title: 'Shortsword',
        source_key: `${WORKSPACE_ID}::release:eldra.solaris.xphb::dnd5e::item::shortsword-xphb`,
        base_data_hash: 'sha256-a'
      }]
    })

    const [identity] = await listWorkspaceEntityIdentities(WORKSPACE_ID)
    expect(identity!.sourceKey).toBe('release:eldra.solaris.xphb::dnd5e::item::shortsword-xphb')
  })
})

describe('revisions', () => {
  it('appends an auditable row with the actor and the time', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: { id: 'rev-1', kind: 'adopt' } })

    await appendWorkspaceRevision({
      workspaceId: WORKSPACE_ID, contentEntityId: null, kind: 'adopt',
      actorAccountId: 'acct-1', label: 'Adopted', diff: [{ channel: 'lineage', path: 'p', from: null, to: 'w' }]
    })

    const [, call] = directusServiceRequestMock.mock.calls[0]!
    expect(call.method).toBe('POST')
    expect(call.body).toMatchObject({ workspace_id: WORKSPACE_ID, kind: 'adopt', actor_account_id: 'acct-1', label: 'Adopted' })
    expect(typeof call.body.at).toBe('string')
  })

  it('can list only workspace-level events', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } })
    await listWorkspaceRevisions(WORKSPACE_ID, null, { limit: 50, offset: 0 })

    expect(directusServiceRequestMock.mock.calls[0]![1].query.filter._and)
      .toContainEqual({ content_entity_id: { _null: true } })
  })
})
