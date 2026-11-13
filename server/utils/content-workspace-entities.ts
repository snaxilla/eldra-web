// Content Workspace entity editing -- Content Workspaces & Studio
// Phase 4 (content-workspaces-and-studio.md §6.2/§7.6/§9). Presentation
// overrides only: mechanics and Rules Facet editing are out of this
// phase's scope (Phase 7/11).
//
// CONCURRENCY MODEL -- genuine atomic compare-and-set, not a Directus
// filtered PATCH. An earlier version of this module conditioned writes on
// `expectedRevision` via Directus's collection-level filtered PATCH
// (`{query:{filter:{id,revision}}, data}`), which is NOT atomic -- Directus
// resolves the matching primary key via a SEPARATE, earlier SELECT, then
// writes `WHERE id IN (keys)`, never re-checking the filter at write time
// (confirmed directly against Directus 11.12.0's own ItemsService source;
// the identical finding character-resource-atomic.ts's own header already
// documents for a different table). Every revision-gated write below now
// goes through content-workspace-entity-atomic.ts instead: one Postgres
// transaction, issued directly against the database Directus itself uses,
// that updates the entity row, writes its history row, and bumps the
// workspace's cache-witness counter together -- see that module's own
// header for the exact statement and the least-privilege
// `eldra_workspace_writer` role it runs as.

import type { FieldOverride, OverrideChannel } from '../../app/lib/content-authoring/overrides'
import { diffOverrides, emptyChannel, isValidOverridePath, removeOverridePath, upsertOverride } from '../../app/lib/content-authoring/overrides'
import type { BaseSourceRef, LegacyBaseRef } from '../../app/lib/content-identity'
import type { WorkspaceEntityOrigin, WorkspaceEntityState } from '../../app/lib/content-workspaces/types'
import { directusServiceRequest } from './directus'
import { CONTENT_WORKSPACE_ENTITIES_COLLECTION } from './content-workspaces'
import { withWorkspaceSchema } from './content-workspace-schema'
import { writeWorkspaceEntityOverrideAtomic } from './content-workspace-entity-atomic'

type DirectusRow = Record<string, unknown>
type DirectusResponse = { data?: unknown }

async function dx(path: string, options: Record<string, unknown>): Promise<DirectusResponse> {
  return await directusServiceRequest(path, options) as DirectusResponse
}

function rows(res: DirectusResponse): DirectusRow[] {
  return Array.isArray(res?.data) ? (res.data as DirectusRow[]) : []
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function overrideList(value: unknown): FieldOverride[] {
  return Array.isArray(value) ? (value as FieldOverride[]) : []
}

// Everything a Phase 4 editor needs about one entity, including its
// payloads -- unlike content-workspaces.ts's WorkspaceEntitySummary, which
// deliberately omits them from the listing response.
export type WorkspaceEntityDetail = {
  id: string
  workspaceId: string
  contentEntityId: string
  systemKey: string
  entityType: string
  slug: string
  title: string
  origin: WorkspaceEntityOrigin
  state: WorkspaceEntityState
  revision: number
  baseData: unknown
  baseDataHash: string | null
  baseSourceRef: BaseSourceRef | null
  baseMissing: boolean
  baseRefs: LegacyBaseRef[]
  slugAliases: string[]
  authoredData: unknown
  authoredPresentation: FieldOverride[]
  authoredMechanics: FieldOverride[]
  createdAt: string | null
  updatedAt: string | null
}

const DETAIL_FIELDS =
  'id,workspace_id,content_entity_id,system_key,entity_type,slug,title,origin,state,revision,'
  + 'base_data,base_data_hash,base_source_ref,base_missing,base_refs,slug_aliases,'
  + 'authored_data,authored_presentation,authored_mechanics,created_at,updated_at'

function normalizeDetail(row: DirectusRow): WorkspaceEntityDetail {
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
    revision: Number.isFinite(Number(row.revision)) ? Number(row.revision) : 0,
    baseData: row.base_data ?? null,
    baseDataHash: row.base_data_hash === null || row.base_data_hash === undefined ? null : String(row.base_data_hash),
    baseSourceRef: (row.base_source_ref as BaseSourceRef | undefined) ?? null,
    baseMissing: row.base_missing === true,
    baseRefs: Array.isArray(row.base_refs) ? (row.base_refs as LegacyBaseRef[]) : [],
    slugAliases: stringList(row.slug_aliases),
    authoredData: row.authored_data ?? null,
    authoredPresentation: overrideList(row.authored_presentation),
    authoredMechanics: overrideList(row.authored_mechanics),
    createdAt: row.created_at === null || row.created_at === undefined ? null : String(row.created_at),
    updatedAt: row.updated_at === null || row.updated_at === undefined ? null : String(row.updated_at)
  }
}

const FULL_DETAIL_PAGE_SIZE = 500

// Every entity in a workspace, WITH payloads -- Phase 6's whole-workspace
// live source materialization. Paginated the same bounded way
// content-workspaces.ts's listWorkspaceEntityIdentities already reads the
// identity-only projection, never an unbounded single fetch.
export async function listAllWorkspaceEntityDetails(workspaceId: string): Promise<WorkspaceEntityDetail[]> {
  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const details: WorkspaceEntityDetail[] = []
    let offset = 0

    while (true) {
      const res = await dx(`/items/${CONTENT_WORKSPACE_ENTITIES_COLLECTION}`, {
        method: 'GET',
        query: {
          filter: { workspace_id: { _eq: workspaceId } },
          sort: ['id'],
          limit: FULL_DETAIL_PAGE_SIZE,
          offset,
          fields: DETAIL_FIELDS
        }
      })

      const page = rows(res)
      for (const row of page) details.push(normalizeDetail(row))

      if (page.length < FULL_DETAIL_PAGE_SIZE) break
      offset += FULL_DETAIL_PAGE_SIZE
    }

    return details
  })
}

export async function getWorkspaceEntityDetail(workspaceId: string, contentEntityId: string): Promise<WorkspaceEntityDetail | null> {
  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const res = await dx(`/items/${CONTENT_WORKSPACE_ENTITIES_COLLECTION}`, {
      method: 'GET',
      query: {
        filter: { _and: [{ workspace_id: { _eq: workspaceId } }, { content_entity_id: { _eq: contentEntityId } }] },
        limit: 1,
        fields: DETAIL_FIELDS
      }
    })
    const row = rows(res)[0]
    return row ? normalizeDetail(row) : null
  })
}

export type EditOutcome =
  | { ok: true; entity: WorkspaceEntityDetail }
  | { ok: false; stage: 'not-found' }
  | { ok: false; stage: 'conflict'; current: WorkspaceEntityDetail }
  | { ok: false; stage: 'invalid-path'; path: string }
  | { ok: false; stage: 'persistence-unavailable'; message: string }

// Applies a conditional write to one channel's override list -- shared by
// edit/revert/revert-all, since all three are "read current, compute a
// new override list, write it atomically conditioned on expectedRevision,
// record a revision" with only the computation step differing. The read
// (to diff against and to hand `compute` its input) still goes through
// Directus's own REST read path -- only the CONDITIONAL WRITE itself needs
// the atomic module, since a read has nothing to race.
async function writeOverrides(
  workspaceId: string,
  contentEntityId: string,
  expectedRevision: number,
  channel: OverrideChannel,
  compute: (current: FieldOverride[]) => FieldOverride[],
  recordKind: 'autosave' | 'revert',
  actorAccountId: string | null,
  label: string | null = null
): Promise<EditOutcome> {
  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const current = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
    if (!current) return { ok: false, stage: 'not-found' }
    if (current.revision !== expectedRevision) return { ok: false, stage: 'conflict', current }

    const beforeList = channel === 'presentation' ? current.authoredPresentation : current.authoredMechanics
    const afterList = compute(beforeList)
    const columnName = channel === 'presentation' ? 'authored_presentation' as const : 'authored_mechanics' as const
    const diff = diffOverrides(beforeList, afterList)

    const result = await writeWorkspaceEntityOverrideAtomic({
      workspaceId,
      contentEntityId,
      expectedRevision,
      column: columnName,
      newValue: afterList,
      revision: { kind: recordKind, label, actorAccountId, diff }
    })

    if (!result.ok) {
      if (result.reason === 'not-found') return { ok: false, stage: 'not-found' }
      if (result.reason === 'conflict') {
        return { ok: false, stage: 'conflict', current: result.current ? normalizeDetail(result.current as unknown as DirectusRow) : current }
      }
      // persistence-unconfigured / persistence-failure -- a deployment or
      // database defect, never reported as a normal "missing"/"conflict"
      // domain outcome a caller could mistake for one.
      return { ok: false, stage: 'persistence-unavailable', message: result.message }
    }

    return { ok: true, entity: normalizeDetail(result.entity as unknown as DirectusRow) }
  })
}

export type PresentationEdit = { path: string; value: unknown; baseValueHash: string | null }

export async function applyPresentationEdits(
  workspaceId: string,
  contentEntityId: string,
  expectedRevision: number,
  edits: readonly PresentationEdit[],
  actorAccountId: string | null
): Promise<EditOutcome> {
  for (const edit of edits) {
    if (!isValidOverridePath('presentation', edit.path)) return { ok: false, stage: 'invalid-path', path: edit.path }
  }

  return await writeOverrides(
    workspaceId,
    contentEntityId,
    expectedRevision,
    'presentation',
    (currentList) => {
      const now = new Date().toISOString()
      let next = currentList
      for (const edit of edits) {
        next = upsertOverride(next, { channel: 'presentation', path: edit.path, value: edit.value, authoredBy: actorAccountId, baseValueHash: edit.baseValueHash }, now)
      }
      return next
    },
    'autosave',
    actorAccountId
  )
}

export async function revertPresentationPath(
  workspaceId: string,
  contentEntityId: string,
  expectedRevision: number,
  path: string,
  actorAccountId: string | null
): Promise<EditOutcome> {
  if (!isValidOverridePath('presentation', path)) return { ok: false, stage: 'invalid-path', path }
  return await writeOverrides(
    workspaceId,
    contentEntityId,
    expectedRevision,
    'presentation',
    (currentList) => removeOverridePath(currentList, 'presentation', path),
    'revert',
    actorAccountId,
    `Reverted presentation.${path}`
  )
}

export async function revertPresentationChannel(
  workspaceId: string,
  contentEntityId: string,
  expectedRevision: number,
  actorAccountId: string | null
): Promise<EditOutcome> {
  return await writeOverrides(
    workspaceId,
    contentEntityId,
    expectedRevision,
    'presentation',
    (currentList) => emptyChannel(currentList, 'presentation'),
    'revert',
    actorAccountId,
    'Reverted all presentation overrides'
  )
}

export type CheckpointOutcome =
  | { ok: true; revisionId: string }
  | { ok: false; stage: 'not-found' }

// A checkpoint names the CURRENT state as a permanent, never-pruned
// revision -- it writes no payload changes, only a labeled snapshot
// revision referencing the entity as it stands right now (§9.1: "Draft
// checkpoint" is append-only with a snapshot, never a new row elsewhere).
export async function createEntityCheckpoint(
  workspaceId: string,
  contentEntityId: string,
  label: string,
  actorAccountId: string | null
): Promise<CheckpointOutcome> {
  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const entity = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
    if (!entity) return { ok: false, stage: 'not-found' }

    const res = await dx('/items/content_entity_revisions', {
      method: 'POST',
      body: {
        workspace_id: workspaceId,
        content_entity_id: contentEntityId,
        kind: 'checkpoint',
        label,
        actor_account_id: actorAccountId,
        at: new Date().toISOString(),
        diff: [],
        snapshot: {
          revision: entity.revision,
          authoredPresentation: entity.authoredPresentation,
          authoredMechanics: entity.authoredMechanics,
          baseDataHash: entity.baseDataHash
        }
      }
    })

    return { ok: true, revisionId: text(rows(res)[0]?.id ?? '') }
  })
}
