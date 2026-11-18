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
//
// PRODUCTION CACHE-COHERENCY HOTFIX -- `getWorkspaceEntityDetail` below
// reads the SAME row directly too now (`readWorkspaceEntityRowAtomic`),
// never through Directus's REST API. It used to call `directusServiceRequest`
// -- harmless for a page that only ever displays an entity, but every
// write path here ALSO calls this function to fetch "the current
// revision" to condition its own atomic write on, and "the current
// override lists" to compute the new one from. Directus's own response
// cache invalidates only as a side effect of its OWN ItemsService writes,
// never as a side effect of the direct-Postgres write above -- so a GET
// through Directus could keep returning a stale, pre-write snapshot
// (stale revision included) for as long as nothing else flushed that
// cache, producing a 409 that never clears on retry even though no other
// editor ever touched the entity. See content-workspace-entity-atomic.ts's
// own "WHY THE READ ALSO LIVES HERE NOW" header for the full account
// (mirrors a previously-fixed, documented production incident in
// character-resource-atomic.ts for a different table).

import type { FieldOverride, OverrideChannel } from '../../app/lib/content-authoring/overrides'
import { diffOverrides, emptyChannel, isValidOverridePath, removeOverridePath, upsertOverride } from '../../app/lib/content-authoring/overrides'
import { isItemMechanicsOverridePath } from '../../app/lib/item-mechanics'
import type { BaseSourceRef, LegacyBaseRef } from '../../app/lib/content-identity'
import type { WorkspaceEntityOrigin, WorkspaceEntityState } from '../../app/lib/content-workspaces/types'
import { directusServiceRequest } from './directus'
import { CONTENT_WORKSPACE_ENTITIES_COLLECTION } from './content-workspaces'
import { ContentWorkspacePersistenceUnavailableError, withWorkspaceSchema } from './content-workspace-schema'
import {
  readWorkspaceEntityRowAtomic,
  readWorkspaceEntityRowsPageAtomic,
  writeWorkspaceEntityOverrideAtomic,
  type WorkspaceOverrideColumn
} from './content-workspace-entity-atomic'

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
// live source materialization, consumed by world-content-sources.ts's
// catalogue-building `loadWorkspaceAsSource` (gameplay-adjacent: feeds
// character sheets/the catalogue for every World bound to this workspace,
// not only the editor). Paginated the same bounded way
// content-workspaces.ts's listWorkspaceEntityIdentities already reads the
// identity-only projection, never an unbounded single fetch.
//
// CATALOGUE CACHE-COHERENCY -- reads directly through Postgres FIRST
// (readWorkspaceEntityRowsPageAtomic), same reasoning as
// getWorkspaceEntityDetail's own fix: a GET through Directus here could
// keep returning a stale, pre-write entity list (stale authored_mechanics
// included) even after world-content-sources.ts's own revision check
// correctly decided to refetch, which would make the refetch itself
// pointless. UNLIKE getWorkspaceEntityDetail (editor-only, already
// implicitly dependent on ELDRA_WORKSPACE_DB_URL for its own saves), this
// function is also on the GAMEPLAY read path -- a deployment that has
// never configured ELDRA_WORKSPACE_DB_URL at all (read-only/pinned-content-
// only) must keep working exactly as before, so a persistence-unavailable
// failure here falls back to the existing Directus-paginated read rather
// than breaking character sheets/the catalogue. Any OTHER kind of error
// (a real bug, not a configuration/connectivity question) still
// propagates untouched.
//
// `source` on the result tells the caller WHICH path actually answered --
// catalogue cache-fix follow-up: world-content-sources.ts must never cache
// `source: 'directus-fallback'` entries under the authoritative revision
// number, or a transient Postgres outage would "poison" the cache: a later
// call at the SAME authoritative revision (Postgres having since
// recovered) would wrongly treat the stale fallback list as still valid,
// never refetching. See this function's own caller for the exact guard.
export type WorkspaceEntityListResult = { entities: WorkspaceEntityDetail[]; source: 'postgres' | 'directus-fallback' }

export async function listAllWorkspaceEntityDetails(workspaceId: string): Promise<WorkspaceEntityListResult> {
  try {
    const details: WorkspaceEntityDetail[] = []
    let offset = 0

    while (true) {
      const page = await readWorkspaceEntityRowsPageAtomic(workspaceId, FULL_DETAIL_PAGE_SIZE, offset)
      for (const row of page) details.push(normalizeDetail(row as unknown as DirectusRow))

      if (page.length < FULL_DETAIL_PAGE_SIZE) break
      offset += FULL_DETAIL_PAGE_SIZE
    }

    return { entities: details, source: 'postgres' }
  } catch (error) {
    if (!(error instanceof ContentWorkspacePersistenceUnavailableError)) throw error
    return { entities: await listAllWorkspaceEntityDetailsViaDirectus(workspaceId), source: 'directus-fallback' }
  }
}

// The ORIGINAL implementation, kept verbatim as the fallback for a
// deployment with no ELDRA_WORKSPACE_DB_URL configured at all -- same
// filter/sort/pagination/fields as the direct-Postgres path above, so a
// caller sees identical results either way, just potentially staler ones
// (the known, pre-existing tradeoff for a deployment that has not set up
// the direct connection, unchanged by this fix).
async function listAllWorkspaceEntityDetailsViaDirectus(workspaceId: string): Promise<WorkspaceEntityDetail[]> {
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
  const row = await readWorkspaceEntityRowAtomic(workspaceId, contentEntityId)
  return row ? normalizeDetail(row as unknown as DirectusRow) : null
}

export type EditOutcome =
  | { ok: true; entity: WorkspaceEntityDetail }
  | { ok: false; stage: 'not-found' }
  | { ok: false; stage: 'conflict'; current: WorkspaceEntityDetail }
  | { ok: false; stage: 'invalid-path'; path: string }
  | { ok: false; stage: 'persistence-unavailable'; message: string }

// Mechanics overrides are scoped to `item` entities only this release
// (Items Mechanics Editing -- "Non-Item mechanics editing" is explicitly
// out of scope). Entity-type-aware, unlike isValidOverridePath('presentation', ...)
// above, which is universal across entity types -- so this lives here,
// where `entityType` is already in hand, rather than in the generic,
// entity-type-unaware content-authoring/overrides.ts.
function isValidMechanicsOverridePath(entityType: string, path: string): boolean {
  return entityType === 'item' && isItemMechanicsOverridePath(path)
}

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
      columns: { [columnName]: afterList },
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

// ---------------------------------------------------------------------------
// Mechanics overrides -- Items Mechanics Editing, release one. Direct
// siblings of the presentation functions above, reusing the SAME
// channel-generic writeOverrides primitive (it has always branched on
// `channel`; mechanics was simply never exercised until now) -- not a
// second write mechanism.
// ---------------------------------------------------------------------------

export type MechanicsEdit = { path: string; value: unknown }

export async function applyMechanicsEdits(
  workspaceId: string,
  contentEntityId: string,
  expectedRevision: number,
  entityType: string,
  edits: readonly MechanicsEdit[],
  actorAccountId: string | null
): Promise<EditOutcome> {
  for (const edit of edits) {
    if (!isValidMechanicsOverridePath(entityType, edit.path)) return { ok: false, stage: 'invalid-path', path: edit.path }
  }

  return await writeOverrides(
    workspaceId,
    contentEntityId,
    expectedRevision,
    'mechanics',
    (currentList) => {
      const now = new Date().toISOString()
      let next = currentList
      for (const edit of edits) {
        next = upsertOverride(next, { channel: 'mechanics', path: edit.path, value: edit.value, authoredBy: actorAccountId, baseValueHash: null }, now)
      }
      return next
    },
    'autosave',
    actorAccountId
  )
}

export async function revertMechanicsPath(
  workspaceId: string,
  contentEntityId: string,
  expectedRevision: number,
  entityType: string,
  path: string,
  actorAccountId: string | null
): Promise<EditOutcome> {
  if (!isValidMechanicsOverridePath(entityType, path)) return { ok: false, stage: 'invalid-path', path }
  return await writeOverrides(
    workspaceId,
    contentEntityId,
    expectedRevision,
    'mechanics',
    (currentList) => removeOverridePath(currentList, 'mechanics', path),
    'revert',
    actorAccountId,
    `Reverted mechanics.${path}`
  )
}

export async function revertMechanicsChannel(
  workspaceId: string,
  contentEntityId: string,
  expectedRevision: number,
  actorAccountId: string | null
): Promise<EditOutcome> {
  return await writeOverrides(
    workspaceId,
    contentEntityId,
    expectedRevision,
    'mechanics',
    (currentList) => emptyChannel(currentList, 'mechanics'),
    'revert',
    actorAccountId,
    'Reverted all mechanics overrides'
  )
}

// ---------------------------------------------------------------------------
// Combined save -- Items Mechanics Editing, release one (brief item 2:
// "Support one request containing presentation and mechanics edits under
// one expected revision... Both channels succeed or fail together. One
// revision increment and one coherent history entry."). THE one save
// pipeline the entity PATCH route calls, for any mix of channels
// (presentation-only, mechanics-only, or both) -- never a second pipeline
// alongside applyPresentationEdits/applyMechanicsEdits above, which remain
// in place only as the shared primitives revert/split-to-local reuse.
// ---------------------------------------------------------------------------

export type EntityChannelEdit = { channel: OverrideChannel; path: string; value: unknown; baseValueHash: string | null }

export async function applyEntityEdits(
  workspaceId: string,
  contentEntityId: string,
  expectedRevision: number,
  entityType: string,
  edits: readonly EntityChannelEdit[],
  actorAccountId: string | null
): Promise<EditOutcome> {
  for (const edit of edits) {
    if (edit.channel === 'presentation') {
      if (!isValidOverridePath('presentation', edit.path)) return { ok: false, stage: 'invalid-path', path: edit.path }
    } else if (edit.channel === 'mechanics') {
      if (!isValidMechanicsOverridePath(entityType, edit.path)) return { ok: false, stage: 'invalid-path', path: edit.path }
    } else {
      return { ok: false, stage: 'invalid-path', path: edit.path }
    }
  }

  return await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
    const current = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
    if (!current) return { ok: false, stage: 'not-found' }
    if (current.revision !== expectedRevision) return { ok: false, stage: 'conflict', current }

    const now = new Date().toISOString()
    const beforePresentation = current.authoredPresentation
    const beforeMechanics = current.authoredMechanics
    let afterPresentation = beforePresentation
    let afterMechanics = beforeMechanics

    for (const edit of edits) {
      const entry = { channel: edit.channel, path: edit.path, value: edit.value, authoredBy: actorAccountId, baseValueHash: edit.baseValueHash }
      if (edit.channel === 'presentation') afterPresentation = upsertOverride(afterPresentation, entry, now)
      else afterMechanics = upsertOverride(afterMechanics, entry, now)
    }

    // Only the columns an edit actually touched are included in the write
    // -- a presentation-only (or mechanics-only) request through this same
    // function still writes exactly one column, identical to what
    // applyPresentationEdits/applyMechanicsEdits would have written alone.
    const columns: Partial<Record<WorkspaceOverrideColumn, unknown>> = {}
    if (afterPresentation !== beforePresentation) columns.authored_presentation = afterPresentation
    if (afterMechanics !== beforeMechanics) columns.authored_mechanics = afterMechanics

    const diff = [
      ...diffOverrides(beforePresentation, afterPresentation),
      ...diffOverrides(beforeMechanics, afterMechanics)
    ]

    const result = await writeWorkspaceEntityOverrideAtomic({
      workspaceId,
      contentEntityId,
      expectedRevision,
      columns,
      revision: { kind: 'autosave', label: null, actorAccountId, diff }
    })

    if (!result.ok) {
      if (result.reason === 'not-found') return { ok: false, stage: 'not-found' }
      if (result.reason === 'conflict') {
        return { ok: false, stage: 'conflict', current: result.current ? normalizeDetail(result.current as unknown as DirectusRow) : current }
      }
      return { ok: false, stage: 'persistence-unavailable', message: result.message }
    }

    return { ok: true, entity: normalizeDetail(result.entity as unknown as DirectusRow) }
  })
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
