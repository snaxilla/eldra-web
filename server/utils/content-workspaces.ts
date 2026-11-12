// Content Workspace persistence -- workspaces, their entities, source
// snapshots, and revisions. Content Workspaces & Studio Phase 3
// (content-workspaces-and-studio.md §6/§9).
//
// Storage only, in world-content-packs.ts's idiom: explicit field lists,
// discriminated results, no HTTP and no capability checks. Import lives
// in content-workspace-import.ts; lineage ownership in
// content-package-lineages.ts.
//
// Nothing here is read by content resolution. Worlds keep resolving
// through pinned releases whether or not these collections exist.
//
// There is deliberately no function that updates an entity's payloads,
// a snapshot, or a revision: snapshots and revisions are append-only, and
// entity editing arrives with its typed editor.

import type {
  ContentWorkspace,
  ContentWorkspaceStatus,
  SourceSnapshotSummary,
  WorkspaceEntitySummary,
  WorkspaceRevision,
  WorkspaceRevisionKind
} from '../../app/lib/content-workspaces/types'
import type { ExistingEntity } from '../../app/lib/content-workspaces/import-plan'
import type { PageRequest, WorkspaceCreateInput, WorkspaceEntityListFilter, WorkspacePatchInput } from '../../app/lib/content-workspaces/validation'
import { directusServiceRequest } from './directus'
import { unscopedSourceKey } from './content-workspace-keys'
import { isDirectusUniqueViolation, withWorkspaceSchema } from './content-workspace-schema'

export const CONTENT_WORKSPACES_COLLECTION = 'content_workspaces'
export const CONTENT_WORKSPACE_ENTITIES_COLLECTION = 'content_workspace_entities'
export const CONTENT_ENTITY_SOURCE_SNAPSHOTS_COLLECTION = 'content_entity_source_snapshots'
export const CONTENT_ENTITY_REVISIONS_COLLECTION = 'content_entity_revisions'

const WORKSPACE_FIELDS =
  'id,workspace_key,title,description,system_key,source_game_system_key,source_collection_key,status,owner_account_id,created_at,updated_at'

// Never includes base_data or an override channel.
const ENTITY_SUMMARY_FIELDS =
  'id,workspace_id,content_entity_id,system_key,entity_type,slug,title,origin,state,base_data_hash,base_source_ref,base_missing,base_refs,slug_aliases,created_at,updated_at'

// Never includes previous_base_data or incoming_base_data.
const SNAPSHOT_SUMMARY_FIELDS =
  'id,workspace_id,content_entity_id,disposition,previous_base_data_hash,previous_source_ref,new_base_data_hash,new_source_ref,reconciliation,at,actor_account_id'

const REVISION_FIELDS = 'id,workspace_id,content_entity_id,kind,label,actor_account_id,at,diff'

const IDENTITY_INDEX_PAGE_SIZE = 500

// Directus rows arrive untyped; these readers are the one place a raw
// value becomes a domain value, so no call site below handles `unknown`.
type DirectusRow = Record<string, unknown>
type DirectusResponse = { data?: unknown; meta?: { filter_count?: unknown } }

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : String(value)
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function normalizeWorkspace(row: DirectusRow): ContentWorkspace {
  return {
    id: text(row.id),
    workspaceKey: text(row.workspace_key),
    title: text(row.title),
    description: optionalText(row.description),
    systemKey: text(row.system_key),
    sourceGameSystemKey: optionalText(row.source_game_system_key),
    sourceCollectionKey: optionalText(row.source_collection_key),
    status: row.status === 'archived' ? 'archived' : 'active',
    ownerAccountId: optionalText(row.owner_account_id),
    createdAt: optionalText(row.created_at),
    updatedAt: optionalText(row.updated_at)
  }
}

function normalizeEntitySummary(row: DirectusRow): WorkspaceEntitySummary {
  return {
    id: text(row.id),
    workspaceId: text(row.workspace_id),
    contentEntityId: text(row.content_entity_id),
    systemKey: text(row.system_key),
    entityType: text(row.entity_type),
    slug: text(row.slug),
    title: text(row.title),
    origin: row.origin === 'authored' || row.origin === 'derived' ? row.origin : 'imported',
    state: row.state === 'disabled' ? 'disabled' : 'active',
    baseDataHash: optionalText(row.base_data_hash),
    baseSourceRef: (row.base_source_ref as WorkspaceEntitySummary['baseSourceRef']) ?? null,
    baseMissing: row.base_missing === true,
    baseRefs: Array.isArray(row.base_refs) ? (row.base_refs as WorkspaceEntitySummary['baseRefs']) : [],
    slugAliases: stringList(row.slug_aliases),
    createdAt: optionalText(row.created_at),
    updatedAt: optionalText(row.updated_at)
  }
}

function normalizeSnapshot(row: DirectusRow): SourceSnapshotSummary {
  return {
    id: text(row.id),
    workspaceId: text(row.workspace_id),
    contentEntityId: text(row.content_entity_id),
    disposition: row.disposition === 'pending-review' ? 'pending-review' : 'accepted',
    previousBaseDataHash: optionalText(row.previous_base_data_hash),
    previousSourceRef: (row.previous_source_ref as SourceSnapshotSummary['previousSourceRef']) ?? null,
    newBaseDataHash: text(row.new_base_data_hash),
    newSourceRef: row.new_source_ref as SourceSnapshotSummary['newSourceRef'],
    reconciliation: row.reconciliation ?? null,
    at: optionalText(row.at),
    actorAccountId: optionalText(row.actor_account_id)
  }
}

function normalizeRevision(row: DirectusRow): WorkspaceRevision {
  return {
    id: text(row.id),
    workspaceId: text(row.workspace_id),
    contentEntityId: optionalText(row.content_entity_id),
    kind: text(row.kind) as WorkspaceRevisionKind,
    label: optionalText(row.label),
    actorAccountId: optionalText(row.actor_account_id),
    at: optionalText(row.at),
    diff: row.diff ?? null
  }
}

// The one typed entry point to Directus for this module.
// `directusServiceRequest` is deliberately untyped at its own boundary;
// narrowing once here means no call site below handles `unknown`.
async function dx(path: string, options: Record<string, unknown>): Promise<DirectusResponse> {
  return await directusServiceRequest(path, options) as DirectusResponse
}

// The single row a write returns.
function writtenRow(res: DirectusResponse): DirectusRow {
  return (res?.data as DirectusRow) ?? {}
}

function rows(res: DirectusResponse): DirectusRow[] {
  return Array.isArray(res?.data) ? (res.data as DirectusRow[]) : []
}

function filterCount(res: DirectusResponse, fallback: number): number {
  const count = Number(res?.meta?.filter_count)
  return Number.isFinite(count) ? count : fallback
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function listContentWorkspaces(): Promise<ContentWorkspace[]> {
  return await withWorkspaceSchema(CONTENT_WORKSPACES_COLLECTION, async () => {
    const res = await dx(`/items/${CONTENT_WORKSPACES_COLLECTION}`, {
      method: 'GET',
      query: { sort: ['title'], limit: -1, fields: WORKSPACE_FIELDS }
    })
    return rows(res).map(normalizeWorkspace)
  })
}

export async function getContentWorkspace(workspaceId: string): Promise<ContentWorkspace | null> {
  return await withWorkspaceSchema(CONTENT_WORKSPACES_COLLECTION, async () => {
    const res = await dx(`/items/${CONTENT_WORKSPACES_COLLECTION}`, {
      method: 'GET',
      query: { filter: { id: { _eq: workspaceId } }, limit: 1, fields: WORKSPACE_FIELDS }
    })
    const row = rows(res)[0]
    return row ? normalizeWorkspace(row) : null
  })
}

export type CreateWorkspaceResult =
  | { ok: true; workspace: ContentWorkspace }
  | { ok: false; stage: 'key-taken'; workspaceKey: string }

// `workspace_key` is UNIQUE in the database, so the insert itself is the
// check. There is no read-before-write to race.
export async function createContentWorkspace(input: WorkspaceCreateInput, accountId: string | null): Promise<CreateWorkspaceResult> {
  return await withWorkspaceSchema(CONTENT_WORKSPACES_COLLECTION, async () => {
    const now = new Date().toISOString()
    try {
      const res = await dx(`/items/${CONTENT_WORKSPACES_COLLECTION}`, {
        method: 'POST',
        body: {
          workspace_key: input.workspaceKey,
          title: input.title,
          description: input.description,
          system_key: input.systemKey,
          status: 'active',
          owner_account_id: accountId,
          created_at: now,
          updated_at: now
        }
      })
      return { ok: true, workspace: normalizeWorkspace(writtenRow(res)) }
    } catch (error) {
      if (isDirectusUniqueViolation(error)) return { ok: false, stage: 'key-taken', workspaceKey: input.workspaceKey }
      throw error
    }
  })
}

// Takes an already-validated patch (validation.ts's allowlist): title,
// description, and status only.
export async function updateContentWorkspace(workspaceId: string, patch: WorkspacePatchInput): Promise<ContentWorkspace> {
  return await withWorkspaceSchema(CONTENT_WORKSPACES_COLLECTION, async () => {
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.title !== undefined) body.title = patch.title
    if (patch.description !== undefined) body.description = patch.description
    if (patch.status !== undefined) body.status = patch.status satisfies ContentWorkspaceStatus

    const res = await dx(`/items/${CONTENT_WORKSPACES_COLLECTION}/${workspaceId}`, {
      method: 'PATCH',
      body
    })
    return normalizeWorkspace(writtenRow(res))
  })
}

export async function touchContentWorkspace(workspaceId: string): Promise<void> {
  await withWorkspaceSchema(CONTENT_WORKSPACES_COLLECTION, async () => {
    await dx(`/items/${CONTENT_WORKSPACES_COLLECTION}/${workspaceId}`, {
      method: 'PATCH',
      body: { updated_at: new Date().toISOString() }
    })
  })
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export async function listWorkspaceEntities(
  workspaceId: string,
  page: PageRequest,
  filter: WorkspaceEntityListFilter
): Promise<{ entities: WorkspaceEntitySummary[]; total: number }> {
  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const conditions: Record<string, unknown>[] = [{ workspace_id: { _eq: workspaceId } }]
    if (filter.entityType) conditions.push({ entity_type: { _eq: filter.entityType } })
    if (filter.search) conditions.push({ title: { _icontains: filter.search } })

    const res = await dx(`/items/${CONTENT_WORKSPACE_ENTITIES_COLLECTION}`, {
      method: 'GET',
      query: {
        filter: { _and: conditions },
        sort: ['title', 'id'],
        limit: page.limit,
        offset: page.offset,
        fields: ENTITY_SUMMARY_FIELDS,
        meta: 'filter_count'
      }
    })

    const entities = rows(res).map(normalizeEntitySummary)
    return { entities, total: filterCount(res, entities.length) }
  })
}

export async function getWorkspaceEntity(workspaceId: string, contentEntityId: string): Promise<WorkspaceEntitySummary | null> {
  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const res = await dx(`/items/${CONTENT_WORKSPACE_ENTITIES_COLLECTION}`, {
      method: 'GET',
      query: {
        filter: { _and: [{ workspace_id: { _eq: workspaceId } }, { content_entity_id: { _eq: contentEntityId } }] },
        limit: 1,
        fields: ENTITY_SUMMARY_FIELDS
      }
    })
    const row = rows(res)[0]
    return row ? normalizeEntitySummary(row) : null
  })
}

export async function countWorkspaceEntities(workspaceId: string): Promise<number> {
  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const res = await dx(`/items/${CONTENT_WORKSPACE_ENTITIES_COLLECTION}`, {
      method: 'GET',
      query: { filter: { workspace_id: { _eq: workspaceId } }, limit: 0, fields: 'id', meta: 'filter_count' }
    })
    return filterCount(res, 0)
  })
}

// Every entity's identity fields, for import planning. Read in bounded
// pages and never with a payload column.
export async function listWorkspaceEntityIdentities(workspaceId: string): Promise<ExistingEntity[]> {
  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const identities: ExistingEntity[] = []
    let offset = 0

    while (true) {
      const res = await dx(`/items/${CONTENT_WORKSPACE_ENTITIES_COLLECTION}`, {
        method: 'GET',
        query: {
          filter: { workspace_id: { _eq: workspaceId } },
          sort: ['id'],
          limit: IDENTITY_INDEX_PAGE_SIZE,
          offset,
          fields: 'content_entity_id,system_key,entity_type,slug,title,source_key,base_data_hash'
        }
      })

      const page = rows(res)
      for (const row of page) {
        identities.push({
          contentEntityId: String(row.content_entity_id ?? ''),
          systemKey: String(row.system_key ?? ''),
          entityType: String(row.entity_type ?? ''),
          slug: String(row.slug ?? ''),
          title: String(row.title ?? ''),
          sourceKey: unscopedSourceKey(workspaceId, optionalText(row.source_key)),
          baseDataHash: optionalText(row.base_data_hash)
        })
      }

      if (page.length < IDENTITY_INDEX_PAGE_SIZE) break
      offset += IDENTITY_INDEX_PAGE_SIZE
    }

    return identities
  })
}

// ---------------------------------------------------------------------------
// Source snapshots and revisions -- read and append only
// ---------------------------------------------------------------------------

export async function listEntitySourceSnapshots(
  workspaceId: string,
  contentEntityId: string,
  page: PageRequest
): Promise<{ snapshots: SourceSnapshotSummary[]; total: number }> {
  return await withWorkspaceSchema(CONTENT_ENTITY_SOURCE_SNAPSHOTS_COLLECTION, async () => {
    const res = await dx(`/items/${CONTENT_ENTITY_SOURCE_SNAPSHOTS_COLLECTION}`, {
      method: 'GET',
      query: {
        filter: { _and: [{ workspace_id: { _eq: workspaceId } }, { content_entity_id: { _eq: contentEntityId } }] },
        sort: ['-at', 'id'],
        limit: page.limit,
        offset: page.offset,
        fields: SNAPSHOT_SUMMARY_FIELDS,
        meta: 'filter_count'
      }
    })
    const snapshots = rows(res).map(normalizeSnapshot)
    return { snapshots, total: filterCount(res, snapshots.length) }
  })
}

// `contentEntityId` undefined lists the whole workspace's history; null
// lists only workspace-level events.
export async function listWorkspaceRevisions(
  workspaceId: string,
  contentEntityId: string | null | undefined,
  page: PageRequest
): Promise<{ revisions: WorkspaceRevision[]; total: number }> {
  return await withWorkspaceSchema(CONTENT_ENTITY_REVISIONS_COLLECTION, async () => {
    const conditions: Record<string, unknown>[] = [{ workspace_id: { _eq: workspaceId } }]
    if (contentEntityId === null) conditions.push({ content_entity_id: { _null: true } })
    else if (contentEntityId !== undefined) conditions.push({ content_entity_id: { _eq: contentEntityId } })

    const res = await dx(`/items/${CONTENT_ENTITY_REVISIONS_COLLECTION}`, {
      method: 'GET',
      query: {
        filter: { _and: conditions },
        sort: ['-at', 'id'],
        limit: page.limit,
        offset: page.offset,
        fields: REVISION_FIELDS,
        meta: 'filter_count'
      }
    })
    const revisions = rows(res).map(normalizeRevision)
    return { revisions, total: filterCount(res, revisions.length) }
  })
}

export async function appendWorkspaceRevision(input: {
  workspaceId: string
  contentEntityId: string | null
  kind: WorkspaceRevisionKind
  actorAccountId: string | null
  diff: unknown
  label?: string | null
}): Promise<WorkspaceRevision> {
  return await withWorkspaceSchema(CONTENT_ENTITY_REVISIONS_COLLECTION, async () => {
    const res = await dx(`/items/${CONTENT_ENTITY_REVISIONS_COLLECTION}`, {
      method: 'POST',
      body: {
        workspace_id: input.workspaceId,
        content_entity_id: input.contentEntityId,
        kind: input.kind,
        label: input.label ?? null,
        actor_account_id: input.actorAccountId,
        at: new Date().toISOString(),
        diff: input.diff
      }
    })
    return normalizeRevision(writtenRow(res))
  })
}
