// Workspace import -- Content Workspaces & Studio Phase 3
// (content-workspaces-and-studio.md §9.2/§16.3).
//
// Reads candidates from an existing source, plans against what the
// workspace already holds (app/lib/content-workspaces/import-plan.ts),
// and executes that plan. It reuses loadPublishedContentPack and the
// registered SourceCollectionProviders; there is no importer here.
//
// WHAT AN IMPORT WRITES
//   new entry        one `accepted` source snapshot (previous base: none),
//                    then the entity row holding the base.
//   unchanged entry  nothing.
//   changed entry    one `pending-review` snapshot holding both the
//                    current accepted base and the incoming payload. The
//                    accepted base does NOT advance: accepting upstream
//                    changes belongs to reconciliation, which this pass
//                    does not implement.
//   unresolved entry nothing; reported.
//
// ORDERING AND FAILURE
//   A snapshot is always written before the row that depends on it, and
//   a failed snapshot write abandons that row. The writes cannot be one
//   transaction -- the REST API has none across collections -- so a
//   failure can leave snapshots whose entity rows were never written.
//   Those are harmless and are reused: snapshot_key is content-addressed
//   and UNIQUE, so a retry finds the snapshot, takes the entity id it
//   recorded, and writes only what is still missing. An import that did
//   not finish never reports success.
//
//   Each POST of several rows is one Directus transaction (verified
//   against 11.12.0), so a batch lands whole or not at all. Batches are
//   bounded by row count and by serialized size; writes are sequential.

import { mintContentEntityId, type BaseSourceRef, type LegacyBaseRef } from '../../app/lib/content-identity'
import {
  countImportPlan,
  planWorkspaceImport,
  sourceEntryKey,
  type ImportPlan,
  type ImportPlanCounts,
  type ImportSourceLineage,
  type IncomingEntry
} from '../../app/lib/content-workspaces/import-plan'
import type { ContentWorkspace } from '../../app/lib/content-workspaces/types'
import type { WorkspaceImportSource } from '../../app/lib/content-workspaces/validation'
import { getSourceCollection } from '../../app/lib/content-sources/registry'
import type { ContentPublicationCandidate } from './content-pack-publishing'
import { loadPublishedContentPack } from './content-packs'
import { getProvider } from './content-sources'
import { directusServiceRequest } from './directus'
import {
  entityAddressKey,
  entityIdentityKey,
  entitySourceKey,
  hashBaseData,
  snapshotKey
} from './content-workspace-keys'
import { describeDirectusError, isDirectusUniqueViolation, withWorkspaceSchema } from './content-workspace-schema'
import {
  CONTENT_ENTITY_SOURCE_SNAPSHOTS_COLLECTION,
  CONTENT_WORKSPACE_ENTITIES_COLLECTION,
  listWorkspaceEntityIdentities
} from './content-workspaces'
import { touchWorkspaceRevisionAtomic } from './content-workspace-entity-atomic'

const MAX_BATCH_ROWS = 25
const MAX_BATCH_BYTES = 600_000
const KEY_LOOKUP_CHUNK = 40

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

type LoadedSource = {
  lineage: ImportSourceLineage
  label: string
  candidates: ContentPublicationCandidate[]
  refFor(candidate: ContentPublicationCandidate): BaseSourceRef
  observedRefFor(candidate: ContentPublicationCandidate): LegacyBaseRef | undefined
  warnings: string[]
}

export type ImportSourceFailure = {
  ok: false
  stage: 'source-not-found' | 'source-unavailable' | 'source-invalid' | 'system-mismatch'
  message: string
}

async function loadImportSource(
  source: WorkspaceImportSource,
  workspace: ContentWorkspace
): Promise<{ ok: true; source: LoadedSource } | ImportSourceFailure> {
  if (source.kind === 'release') {
    const loaded = await loadPublishedContentPack(source.packageId, source.version)
    if (!loaded.ok) {
      return {
        ok: false,
        stage: loaded.stage === 'not-found' ? 'source-not-found' : 'source-unavailable',
        message: `Content Pack ${source.packageId}@${source.version} could not be loaded (${loaded.stage}).`
      }
    }

    const { manifest, content } = loaded.package
    return {
      ok: true,
      source: {
        lineage: { kind: 'release', packageId: source.packageId },
        label: `${manifest.title} ${source.version}`,
        candidates: content as ContentPublicationCandidate[],
        warnings: [],
        refFor: (candidate) => ({
          provider: candidate.provider,
          externalId: candidate.externalId,
          packageId: source.packageId,
          version: source.version,
          sourceBook: candidate.sourceBook,
          sourcePage: candidate.sourcePage,
          license: manifest.license,
          origin: manifest.origin ? { adapterId: manifest.origin.adapterId, sourceId: manifest.origin.sourceId } : undefined
        }),
        observedRefFor: (candidate) => ({
          packageId: source.packageId,
          systemKey: candidate.systemKey,
          entityType: candidate.entityType,
          slug: candidate.slug
        })
      }
    }
  }

  const provider = getProvider(source.gameSystemKey, source.collectionKey)
  const collection = getSourceCollection(source.gameSystemKey, source.collectionKey)
  if (!provider || !collection) {
    return { ok: false, stage: 'source-not-found', message: `Unknown content source ${source.gameSystemKey}/${source.collectionKey}.` }
  }

  if (source.gameSystemKey !== workspace.systemKey) {
    return {
      ok: false,
      stage: 'system-mismatch',
      message: `Content source ${source.gameSystemKey}/${source.collectionKey} cannot be imported into a '${workspace.systemKey}' workspace.`
    }
  }

  const knownCategories = new Set(provider.categories.map((category) => category.key))
  const unknown = (source.categories ?? []).filter((key) => !knownCategories.has(key))
  if (unknown.length) {
    return { ok: false, stage: 'source-invalid', message: `This content source has no category named: ${unknown.join(', ')}.` }
  }

  const availability = await provider.checkAvailability()
  if (!availability.available) {
    return { ok: false, stage: 'source-unavailable', message: availability.message }
  }

  const candidates: ContentPublicationCandidate[] = []
  const warnings: string[] = []
  const wanted = source.categories ? new Set(source.categories) : null

  for (const category of provider.categories) {
    if (wanted && !wanted.has(category.key)) continue
    try {
      const loaded = await provider.loadCategory(category.key)
      candidates.push(...loaded.candidates)
      warnings.push(...loaded.warnings.map((message) => `[${category.label}] ${message}`))
    } catch (error) {
      // A category that fails to load is not skipped: importing the rest
      // would report the missing category's entities as absent upstream.
      return {
        ok: false,
        stage: 'source-unavailable',
        message: `Category '${category.label}' failed to load: ${error instanceof Error ? error.message : 'unknown error'}.`
      }
    }
  }

  return {
    ok: true,
    source: {
      lineage: { kind: 'provider', gameSystemKey: source.gameSystemKey, collectionKey: source.collectionKey },
      label: collection.label,
      candidates,
      warnings,
      refFor: (candidate) => ({
        provider: candidate.provider,
        externalId: candidate.externalId,
        collection: { gameSystemKey: source.gameSystemKey, collectionKey: source.collectionKey },
        sourceBook: candidate.sourceBook,
        sourcePage: candidate.sourcePage,
        license: collection.license,
        origin: { adapterId: provider.adapterId, sourceId: provider.collectionKey }
      }),
      observedRefFor: () => undefined
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export type WorkspaceImportReport = {
  source: { kind: WorkspaceImportSource['kind']; label: string }
  counts: ImportPlanCounts
  added: { contentEntityId: string | null; entityType: string; slug: string; title: string }[]
  changedNeedsReview: ImportPlan['changed']
  unresolved: ImportPlan['unresolved']
  absentUpstream: ImportPlan['absentUpstream']
  warnings: string[]
}

export type WorkspaceImportProgress = {
  entitiesCreated: number
  snapshotsWritten: number
  pendingReviewsRecorded: number
}

export type WorkspaceImportOutcome =
  | { ok: true; applied: boolean; report: WorkspaceImportReport; progress: WorkspaceImportProgress }
  | ImportSourceFailure
  | {
      ok: false
      stage: 'write-failed' | 'conflict'
      message: string
      // What was durably written before the failure. Re-running the same
      // import is safe and completes the remainder.
      progress: WorkspaceImportProgress
      retrySafe: true
    }

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function batchRows<T>(items: readonly T[], sizeOf: (item: T) => number): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let bytes = 0

  for (const item of items) {
    const size = sizeOf(item)
    if (current.length && (current.length >= MAX_BATCH_ROWS || bytes + size > MAX_BATCH_BYTES)) {
      batches.push(current)
      current = []
      bytes = 0
    }
    current.push(item)
    bytes += size
  }

  if (current.length) batches.push(current)
  return batches
}

type DirectusRow = Record<string, unknown>
type DirectusResponse = { data?: unknown }

async function findExistingSnapshots(keys: readonly string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  for (let index = 0; index < keys.length; index += KEY_LOOKUP_CHUNK) {
    const chunk = keys.slice(index, index + KEY_LOOKUP_CHUNK)
    const res = await directusServiceRequest(`/items/${CONTENT_ENTITY_SOURCE_SNAPSHOTS_COLLECTION}`, {
      method: 'GET',
      query: { filter: { snapshot_key: { _in: chunk } }, limit: -1, fields: 'snapshot_key,content_entity_id' }
    }) as DirectusResponse
    for (const row of (Array.isArray(res?.data) ? res.data : []) as DirectusRow[]) {
      found.set(String(row.snapshot_key), String(row.content_entity_id))
    }
  }
  return found
}

type ImportContext = {
  workspace: ContentWorkspace
  source: LoadedSource
  candidates: readonly ContentPublicationCandidate[]
  incoming: readonly IncomingEntry[]
  actorAccountId: string | null
  mint: () => string
  progress: WorkspaceImportProgress
}

async function writeAdditions(context: ImportContext, plan: ImportPlan): Promise<void> {
  const { workspace, source, candidates, incoming, actorAccountId, mint, progress } = context

  const additions = plan.additions.map((addition) => {
    const candidate = candidates[addition.index]!
    return { addition, candidate, entry: incoming[addition.index]!, bytes: JSON.stringify(candidate).length }
  })

  for (const batch of batchRows(additions, (item) => item.bytes)) {
    const now = new Date().toISOString()
    const keyed = batch.map((item) => ({
      ...item,
      snapshotKey: snapshotKey(workspace.id, item.addition.sourceKey, 'accepted', null, item.addition.baseDataHash)
    }))

    const existingSnapshots = await findExistingSnapshots(keyed.map((item) => item.snapshotKey))

    const resolved = keyed.map((item) => ({
      ...item,
      // A carried id is the entry's identity; otherwise reuse the id an
      // interrupted earlier run recorded, and only then mint.
      contentEntityId: item.addition.contentEntityId ?? existingSnapshots.get(item.snapshotKey) ?? mint()
    }))

    const snapshotRows = resolved
      .filter((item) => !existingSnapshots.has(item.snapshotKey))
      .map((item) => ({
        workspace_id: workspace.id,
        content_entity_id: item.contentEntityId,
        snapshot_key: item.snapshotKey,
        source_key: entitySourceKey(workspace.id, item.addition.sourceKey),
        disposition: 'accepted',
        previous_base_data: null,
        previous_base_data_hash: null,
        previous_source_ref: null,
        incoming_base_data: null,
        new_base_data_hash: item.addition.baseDataHash,
        new_source_ref: item.entry.baseSourceRef,
        reconciliation: { classification: 'first-import' },
        at: now,
        actor_account_id: actorAccountId
      }))

    // Snapshot first. If this throws, the entity rows below are never
    // attempted.
    if (snapshotRows.length) {
      await directusServiceRequest(`/items/${CONTENT_ENTITY_SOURCE_SNAPSHOTS_COLLECTION}`, { method: 'POST', body: snapshotRows })
      progress.snapshotsWritten += snapshotRows.length
    }

    const entityRows = resolved.map((item) => {
      const { candidate, entry } = item
      const baseRefs: LegacyBaseRef[] = []
      const seenRefs = new Set<string>()
      for (const ref of [source.observedRefFor(candidate), ...(entry.carriedBaseRefs ?? [])]) {
        if (!ref) continue
        const key = `${ref.packageId}::${ref.systemKey}::${ref.entityType}::${ref.slug}`
        if (seenRefs.has(key)) continue
        seenRefs.add(key)
        baseRefs.push({ packageId: ref.packageId, systemKey: ref.systemKey, entityType: ref.entityType, slug: ref.slug })
      }

      return {
        workspace_id: workspace.id,
        content_entity_id: item.contentEntityId,
        identity_key: entityIdentityKey(workspace.id, item.contentEntityId),
        address_key: entityAddressKey(workspace.id, candidate.systemKey, candidate.entityType, candidate.slug),
        source_key: entitySourceKey(workspace.id, item.addition.sourceKey),
        system_key: candidate.systemKey,
        entity_type: candidate.entityType,
        slug: candidate.slug,
        title: candidate.title,
        origin: 'imported',
        state: 'active',
        base_data: candidate,
        base_data_hash: item.addition.baseDataHash,
        base_source_ref: entry.baseSourceRef,
        base_missing: false,
        base_refs: baseRefs,
        slug_aliases: [...(entry.carriedSlugAliases ?? [])],
        authored_data: null,
        authored_presentation: [],
        authored_mechanics: [],
        authored_facet: null,
        created_at: now,
        updated_at: now
      }
    })

    await directusServiceRequest(`/items/${CONTENT_WORKSPACE_ENTITIES_COLLECTION}`, { method: 'POST', body: entityRows })
    progress.entitiesCreated += entityRows.length

    for (const item of resolved) item.addition.contentEntityId = item.contentEntityId
  }
}

async function writePendingReviews(context: ImportContext, plan: ImportPlan): Promise<void> {
  const { workspace, candidates, incoming, actorAccountId, progress } = context

  const changes = plan.changed.map((change) => {
    const candidate = candidates[change.index]!
    const entry = incoming[change.index]!
    const upstreamKey = sourceEntryKey(context.source.lineage, entry.systemKey, entry.entityType, entry.slug)
    return {
      change,
      candidate,
      entry,
      bytes: JSON.stringify(candidate).length * 2,
      snapshotKey: snapshotKey(workspace.id, upstreamKey, 'pending-review', change.previousBaseDataHash, change.incomingBaseDataHash),
      sourceKey: entitySourceKey(workspace.id, upstreamKey)
    }
  })

  for (const batch of batchRows(changes, (item) => item.bytes)) {
    const existingSnapshots = await findExistingSnapshots(batch.map((item) => item.snapshotKey))
    const missing = batch.filter((item) => !existingSnapshots.has(item.snapshotKey))
    if (!missing.length) continue

    // The current accepted bases, copied into the snapshot so both sides
    // of the later comparison live in one immutable row.
    const currentRes = await directusServiceRequest(`/items/${CONTENT_WORKSPACE_ENTITIES_COLLECTION}`, {
      method: 'GET',
      query: {
        filter: {
          _and: [
            { workspace_id: { _eq: workspace.id } },
            { content_entity_id: { _in: missing.map((item) => item.change.contentEntityId) } }
          ]
        },
        limit: -1,
        fields: 'content_entity_id,base_data,base_data_hash,base_source_ref'
      }
    }) as DirectusResponse
    const current = new Map<string, DirectusRow>(
      ((Array.isArray(currentRes?.data) ? currentRes.data : []) as DirectusRow[])
        .map((row) => [String(row.content_entity_id), row])
    )

    const now = new Date().toISOString()
    const snapshotRows = missing.map((item) => {
      const accepted = current.get(item.change.contentEntityId)
      return {
        workspace_id: workspace.id,
        content_entity_id: item.change.contentEntityId,
        snapshot_key: item.snapshotKey,
        source_key: item.sourceKey,
        disposition: 'pending-review',
        previous_base_data: accepted?.base_data ?? null,
        previous_base_data_hash: accepted?.base_data_hash ?? item.change.previousBaseDataHash,
        previous_source_ref: accepted?.base_source_ref ?? null,
        incoming_base_data: item.candidate,
        new_base_data_hash: item.change.incomingBaseDataHash,
        new_source_ref: item.entry.baseSourceRef,
        reconciliation: {
          classification: 'changed-needs-review',
          upstreamSlugChanged: item.change.upstreamSlugChanged
        },
        at: now,
        actor_account_id: actorAccountId
      }
    })

    await directusServiceRequest(`/items/${CONTENT_ENTITY_SOURCE_SNAPSHOTS_COLLECTION}`, { method: 'POST', body: snapshotRows })
    progress.pendingReviewsRecorded += snapshotRows.length
  }
}

function buildReport(source: LoadedSource, kind: WorkspaceImportSource['kind'], plan: ImportPlan): WorkspaceImportReport {
  return {
    source: { kind, label: source.label },
    counts: countImportPlan(plan),
    added: plan.additions.map(({ contentEntityId, entityType, slug, title }) => ({ contentEntityId, entityType, slug, title })),
    changedNeedsReview: plan.changed,
    unresolved: plan.unresolved,
    absentUpstream: plan.absentUpstream,
    warnings: source.warnings
  }
}

export async function importIntoWorkspace(input: {
  workspace: ContentWorkspace
  source: WorkspaceImportSource
  dryRun: boolean
  actorAccountId: string | null
  mint?: () => string
}): Promise<WorkspaceImportOutcome> {
  const { workspace } = input
  const progress: WorkspaceImportProgress = { entitiesCreated: 0, snapshotsWritten: 0, pendingReviewsRecorded: 0 }

  const loaded = await loadImportSource(input.source, workspace)
  if (!loaded.ok) return loaded
  const source = loaded.source

  const incoming: IncomingEntry[] = source.candidates.map((candidate) => ({
    systemKey: candidate.systemKey,
    entityType: candidate.entityType,
    slug: candidate.slug,
    title: candidate.title,
    externalId: candidate.externalId,
    contentEntityId: candidate.contentEntityId,
    carriedBaseRefs: candidate.baseRefs,
    carriedSlugAliases: candidate.slugAliases,
    baseDataHash: hashBaseData(candidate),
    baseSourceRef: source.refFor(candidate),
    observedBaseRef: source.observedRefFor(candidate)
  }))

  const existing = await listWorkspaceEntityIdentities(workspace.id)
  const plan = planWorkspaceImport({ workspace: { systemKey: workspace.systemKey }, lineage: source.lineage, incoming, existing })

  if (input.dryRun) {
    return { ok: true, applied: false, report: buildReport(source, input.source.kind, plan), progress }
  }

  const context: ImportContext = {
    workspace,
    source,
    candidates: source.candidates,
    incoming,
    actorAccountId: input.actorAccountId,
    mint: input.mint ?? mintContentEntityId,
    progress
  }

  try {
    await withWorkspaceSchema(CONTENT_WORKSPACE_ENTITIES_COLLECTION, async () => {
      await writeAdditions(context, plan)
      await writePendingReviews(context, plan)
    })
    // Bumps content_workspaces.revision atomically -- the SAME cache
    // witness world-content-sources.ts's loadWorkspaceAsSource checks, so
    // a live-bound World sees newly imported entities on its next request
    // rather than a stale cached materialization.
    //
    // UNCONDITIONAL, DELIBERATELY -- this used to run only when
    // `progress.entitiesCreated > 0`. The entity/snapshot writes above and
    // this touch are NOT one transaction (this module's own header already
    // says so: the REST API has no cross-collection transaction), so a
    // process that writes the entities above and then fails or crashes
    // before this line leaves a workspace whose entities are durably
    // persisted but whose cache-witness revision was never bumped. The old
    // gate made that unrecoverable: a RETRY of the exact same import plans
    // against those now-already-present entities, so `planWorkspaceImport`
    // classifies them as `unchanged`, `entitiesCreated` is 0 on the retry,
    // and the gate above would skip the touch a second time -- the cache
    // stays stale forever, even though the retry is reported as a
    // successful, complete import. Touching unconditionally on every
    // successful (non-dry-run) call closes that gap: a true no-op re-import
    // bumps the revision one extra, harmless time (over-invalidating a
    // cache is always safe; under-invalidating is not), and a retry that
    // repairs a stale witness left behind by a prior partial failure now
    // actually repairs it.
    // THE FAILURE ITSELF MUST SURFACE, NOT JUST THE ATTEMPT.
    // `touchWorkspaceRevisionAtomic` used to swallow a persistence failure
    // internally (console.error only, `void` return) -- a caller could not
    // observe it, so this import always returned `ok: true` even when the
    // cache witness was never actually bumped. It now returns a result; a
    // failure here is thrown (caught by this function's own catch, just
    // below) specifically so this call is reported as incomplete/retry-safe
    // rather than a false success, per the review's own required guarantee
    // ("if rows persist but the revision bump fails, the operation must
    // not report complete success").
    const touched = await touchWorkspaceRevisionAtomic(workspace.id)
    if (!touched.ok) {
      throw new Error(`The workspace cache witness could not be updated after the import: ${touched.message}`)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'ContentWorkspaceSchemaError') throw error
    return {
      ok: false,
      stage: isDirectusUniqueViolation(error) ? 'conflict' : 'write-failed',
      message: isDirectusUniqueViolation(error)
        ? `Another change touched this workspace during the import (${describeDirectusError(error)}). Nothing was overwritten; run the import again.`
        : `The import stopped before it finished: ${describeDirectusError(error)}. What was written is intact; run the import again to complete it.`,
      progress,
      retrySafe: true
    }
  }

  return { ok: true, applied: true, report: buildReport(source, input.source.kind, plan), progress }
}
