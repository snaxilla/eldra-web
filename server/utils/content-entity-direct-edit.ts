// Direct Content Editing -- the ONE server-side workflow behind "Items ->
// Shortsword -> Edit -> change picture/description -> Save," shared with
// Content Studio's own "Customize in workspace" path rather than a second,
// parallel orchestration (ELDRA direct-editing consolidation pass).
//
// WHAT THIS MODULE DOES NOT DO. No HTTP concerns (no createError, no
// status codes, no `event`), and no authorization check -- exactly the
// same split world-content-pack-binding.ts's own header documents:
// callers (server/api/**) resolve the Principal, call `requireCapability`,
// THEN call into here. This keeps the workflow itself unit-testable
// without a Nuxt/H3 runtime, and keeps "which capability gates which
// action" visible at the route, not buried in a util.
//
// WHY A WORLD GETS ITS OWN LOCAL WORKSPACE AUTOMATICALLY. Section 3's own
// requirement: an ordinary admin editing an Item must never be asked to
// create/import/bind a workspace by hand. `worldLocalWorkspaceKey` is a
// DETERMINISTIC key (`workspace_key` is already UNIQUE -- see
// content-workspaces.ts -- so this needs no new schema, no new column on
// `worlds`), looked up first and created only if missing
// (`prepareWorldLocalWorkspace`, idempotent via the existing unique-key
// race handling `createContentWorkspace` already has).
//
// WHY "ENTITY" IMPORT, NOT "RELEASE" IMPORT. Importing an entire release
// to change one picture would be exactly the ceremony this pass exists to
// remove. `{kind:'entity', ...}` (content-workspace-import.ts,
// app/lib/content-workspaces/validation.ts) filters a release's own
// candidates down to the one matching (entityType, slug) BEFORE anything
// else runs -- the write/snapshot/retry path is the SAME one a release
// import uses, so every identity/provenance/retry guarantee it already
// has applies here unchanged, and nothing is transplanted by hand.
//
// NOTHING HAPPENS UNTIL SAVE. `customizeEntityForWorld` -- the function
// that creates the local workspace, imports the one entity, and
// live-binds it -- is called ONLY when a caller actually has edits to
// apply. Resolving what WOULD happen (`resolveDirectEditTarget`) is a
// pure read: opening the editor, or cancelling before ever saving, writes
// and activates nothing.

import { isEffectiveContentEnabled, resolveEffectiveContent, type EffectiveEntity } from './world-effective-content'
import { bindWorkspaceLiveToWorld } from './world-content-pack-binding'
import { listWorldsBoundToWorkspace } from './world-content-packs'
import {
  createContentWorkspace,
  getContentWorkspaceByKey,
  listWorkspaceEntityIdentities
} from './content-workspaces'
import type { ContentWorkspace } from '../../app/lib/content-workspaces/types'
import { importIntoWorkspace } from './content-workspace-import'
import { applyPresentationEdits, getWorkspaceEntityDetail, type WorkspaceEntityDetail } from './content-workspace-entities'
import { computePresentationBaseValueHash, resolveBasePresentation } from './content-workspace-presentation'

const WORKSPACE_PREFIX = 'workspace.'

// Shared with world-content-sources.ts's own packageId convention
// (`workspace.${workspaceId}`) -- the one place that string shape is
// decided; this only ever reads it back, never re-invents it.
function workspaceIdFromPseudoPackageId(packageId: string): string | null {
  return packageId.startsWith(WORKSPACE_PREFIX) ? packageId.slice(WORKSPACE_PREFIX.length) : null
}

export function worldLocalWorkspaceKey(worldId: string | number): string {
  return `world-${worldId}-local-edits`
}

export type DirectEditTarget =
  | { mode: 'resolver-disabled' }
  | { mode: 'not-found' }
  | {
      mode: 'existing-workspace'
      workspaceId: string
      contentEntityId: string
      // `local`: bound ONLY to the World that is asking -- safe to edit
      // in place. `shared`: bound to at least one OTHER World too --
      // editing it here would be a live, visible change for THOSE Worlds
      // as well, so the caller must offer the explicit choice section 4
      // describes rather than silently writing to it.
      scope: 'local' | 'shared'
      sharedWithWorldCount: number
    }
  | {
      mode: 'needs-preparation'
      packageId: string
      packageVersion: string
      entityType: string
      slug: string
      // Relayed verbatim so a caller (the edit-target route) can build
      // the SAME presentation/mechanics preview the Items rail already
      // shows, via the established helpers (catalogueEntryToBlocks,
      // collectionSummaryMetaLines) -- without a second
      // resolveEffectiveContent call just to re-fetch what this one
      // already read.
      presentation: EffectiveEntity['presentation']
      data: unknown
    }

// Pure resolution: reads the effective winner for (worldId, entityType,
// slug) and reports what editing it would require, WITHOUT creating,
// importing, or binding anything. Safe to call every time an editor
// opens.
export async function resolveDirectEditTarget(
  worldId: string | number,
  entityType: string,
  slug: string
): Promise<DirectEditTarget> {
  if (!isEffectiveContentEnabled()) return { mode: 'resolver-disabled' }

  const effective = await resolveEffectiveContent(worldId)
  const entries = effective.byEntityType[entityType] || []
  const entry = entries.find((candidate) => candidate.slug === slug) as EffectiveEntity | undefined
  if (!entry) return { mode: 'not-found' }

  const workspaceId = workspaceIdFromPseudoPackageId(entry.packageId)
  if (workspaceId && entry.contentEntityId) {
    const boundWorlds = await listWorldsBoundToWorkspace(workspaceId)
    const otherWorlds = boundWorlds.filter((id) => String(id) !== String(worldId))
    return {
      mode: 'existing-workspace',
      workspaceId,
      contentEntityId: entry.contentEntityId,
      scope: otherWorlds.length ? 'shared' : 'local',
      sharedWithWorldCount: otherWorlds.length
    }
  }

  return {
    mode: 'needs-preparation',
    packageId: entry.packageId,
    packageVersion: entry.packageVersion,
    entityType,
    slug,
    presentation: entry.presentation,
    data: entry.data
  }
}

// Finds, or creates, the ONE workspace this World's own ordinary edits
// live in. Idempotent: a `workspace_key` collision (two concurrent first
// edits in the same World) means another request already created it --
// re-read and use that one, never a second workspace, never an error.
export async function prepareWorldLocalWorkspace(
  worldId: string | number,
  actorAccountId: string | null,
  systemKey: string
): Promise<ContentWorkspace> {
  const key = worldLocalWorkspaceKey(worldId)
  const existing = await getContentWorkspaceByKey(key)
  if (existing) return existing

  const created = await createContentWorkspace(
    { workspaceKey: key, title: `World ${worldId} — Direct Edits`, description: 'Created automatically for this World’s own item/entity edits.', systemKey },
    actorAccountId
  )
  if (created.ok) return created.workspace

  // key-taken: a concurrent first-edit race. The row now exists; read it.
  const raced = await getContentWorkspaceByKey(key)
  if (raced) return raced

  throw new Error(`Could not create or find the local workspace for World ${worldId}`)
}

export type CustomizeEntityFieldEdit = { path: string; value: unknown }

export type CustomizeEntityInput = {
  worldId: string | number
  entityType: string
  slug: string
  // Raw field edits -- `baseValueHash` is computed inside this function,
  // AFTER the entity is resolved/imported, the same way the existing
  // Studio PATCH route computes it (resolveBasePresentation +
  // computePresentationBaseValueHash) -- a caller cannot know the base
  // value before the entity exists, so it is never asked to.
  edits: CustomizeEntityFieldEdit[]
  actorAccountId: string | null
  // The revision the caller last loaded, when it already knew this entity
  // was customized (it would have fetched the entity detail first to
  // show the editor at all). `null` only ever makes sense for a entity's
  // FIRST-EVER edit (`needs-preparation`): there is no prior state for
  // the caller to have seen, so the freshly-imported entity's own
  // revision (always 0, immediately after import) is used instead. An
  // ALREADY-existing entity edited with `null` is refused rather than
  // silently skipping conflict protection -- see the check below.
  expectedRevision: number | null
}

export type CustomizeEntityResult =
  | { ok: true; workspaceId: string; contentEntityId: string; entity: WorkspaceEntityDetail }
  | { ok: false; stage: 'resolver-disabled'; message: string }
  | { ok: false; stage: 'not-found'; message: string }
  | { ok: false; stage: 'import-failed'; message: string; retrySafe: boolean }
  | { ok: false; stage: 'conflict'; message: string; current: unknown }
  | { ok: false; stage: 'persistence-unavailable'; message: string }
  | { ok: false; stage: 'invalid-path'; message: string }
  // The save ITSELF succeeded and is durable (the entity's authored
  // fields and revision reflect it) -- only the live-bind that makes it
  // VISIBLE to the World failed. Deliberately distinct from
  // `import-failed`: nothing here needs re-importing or re-saving, only
  // re-binding, and the caller must never read this as "the edit was
  // lost" -- `entity` is included precisely so a retry (or the UI) can
  // show the saved state while still reporting "not yet live."
  | { ok: false; stage: 'activation-failed'; message: string; retrySafe: boolean; workspaceId: string; contentEntityId: string; entity: WorkspaceEntityDetail }

// THE one workflow. Re-resolves the effective target itself (never trusts
// a client-supplied packageId/version for the base -- staleness and
// spoofing both matter here), prepares the destination (reusing an
// already-customized entity's own workspace unchanged; otherwise
// preparing this World's own local workspace, importing exactly this one
// entity, and live-binding that workspace), then applies the edits.
//
// RETRY SAFETY. Every step this function performs is itself idempotent
// (workspace lookup-or-create, entity import via content-addressed
// snapshot keys, live-bind via saveWorkspaceBinding's own existing-row
// check) -- calling this again after a prior partial failure repeats
// nothing and completes whatever did not finish, exactly like the
// existing import/save paths this reuses already guarantee on their own.
export async function customizeEntityForWorld(input: CustomizeEntityInput, systemKey: string): Promise<CustomizeEntityResult> {
  const target = await resolveDirectEditTarget(input.worldId, input.entityType, input.slug)

  if (target.mode === 'resolver-disabled') {
    return { ok: false, stage: 'resolver-disabled', message: 'Direct editing is not set up for this World yet.' }
  }
  if (target.mode === 'not-found') {
    return { ok: false, stage: 'not-found', message: `'${input.slug}' (${input.entityType}) was not found in this World.` }
  }

  let workspaceId: string
  let contentEntityId: string
  // Only the `needs-preparation` branch has anything left to activate --
  // an `existing-workspace` entity is, by construction, already
  // live-bound (that is how `resolveDirectEditTarget` found it at all).
  let needsActivation = false

  if (target.mode === 'existing-workspace') {
    if (input.expectedRevision === null) {
      return {
        ok: false,
        stage: 'conflict',
        message: 'This entity is already customized -- reload it before saving, so a concurrent edit is never silently overwritten.',
        current: null
      }
    }
    workspaceId = target.workspaceId
    contentEntityId = target.contentEntityId
  } else {
    const workspace = await prepareWorldLocalWorkspace(input.worldId, input.actorAccountId, systemKey)
    workspaceId = workspace.id

    const imported = await importIntoWorkspace({
      workspace,
      source: { kind: 'entity', packageId: target.packageId, version: target.packageVersion, entityType: input.entityType, slug: input.slug },
      dryRun: false,
      actorAccountId: input.actorAccountId
    })

    if (!imported.ok) {
      const retrySafe = 'retrySafe' in imported ? imported.retrySafe : false
      return { ok: false, stage: 'import-failed', message: imported.message, retrySafe }
    }

    const identities = await listWorkspaceEntityIdentities(workspaceId)
    const match = identities.find((identity) => identity.entityType === input.entityType && identity.slug === input.slug)
    if (!match) {
      return { ok: false, stage: 'not-found', message: 'The entity could not be located in its workspace after import.' }
    }
    contentEntityId = match.contentEntityId
    // Activation (live-bind) is deliberately LAST, after the save below
    // succeeds -- never before. Binding before the edit is saved would
    // make a freshly-imported-but-not-yet-customized entity live ahead
    // of any actual change landing; saving first and activating last
    // means a failure here is "saved but not yet visible," never a
    // half-live, half-edited state.
    needsActivation = true
  }

  const detail = await getWorkspaceEntityDetail(workspaceId, contentEntityId)
  if (!detail) {
    return { ok: false, stage: 'not-found', message: 'The entity could not be found in its workspace.' }
  }

  // `needs-preparation` never had a prior revision to protect -- the
  // entity was just imported fresh (revision 0) inside this SAME call, so
  // there is no concurrent editor it could possibly be racing against
  // that this request itself did not just create. `existing-workspace`
  // already required a real `input.expectedRevision` above.
  const expectedRevision = target.mode === 'existing-workspace' ? (input.expectedRevision as number) : detail.revision

  const basePresentation = resolveBasePresentation(detail)
  const edits = input.edits.map((edit) => ({
    path: edit.path,
    value: edit.value,
    baseValueHash: computePresentationBaseValueHash(basePresentation, edit.path)
  }))

  const outcome = await applyPresentationEdits(workspaceId, contentEntityId, expectedRevision, edits, input.actorAccountId)

  if (!outcome.ok) {
    if (outcome.stage === 'not-found') return { ok: false, stage: 'not-found', message: 'The entity could not be found in its workspace.' }
    if (outcome.stage === 'invalid-path') return { ok: false, stage: 'invalid-path', message: `'${outcome.path}' is not an editable field.` }
    if (outcome.stage === 'persistence-unavailable') return { ok: false, stage: 'persistence-unavailable', message: outcome.message }
    return { ok: false, stage: 'conflict', message: 'This was changed by someone else since it was loaded.', current: outcome.current }
  }

  if (needsActivation) {
    const bound = await bindWorkspaceLiveToWorld(input.worldId, workspaceId)
    if (!bound.bound) {
      // The save above is DURABLE and already committed -- only the
      // live-bind failed. Reported distinctly so a caller (and the UI)
      // never confuses this with "the edit was lost": it was not. A
      // retry only needs to re-bind -- `bindWorkspaceLiveToWorld` /
      // `saveWorkspaceBinding` is itself idempotent, so retrying this
      // whole function again re-resolves to `existing-workspace` (the
      // entity now exists) and simply attempts the bind again, never
      // re-importing or re-saving.
      return {
        ok: false,
        stage: 'activation-failed',
        message: bound.stage === 'resolver-disabled'
          ? 'Your changes were saved, but direct editing was disabled before they could go live. Enable it, then try again to activate.'
          : 'Your changes were saved, but could not be made live yet. Try again.',
        retrySafe: true,
        workspaceId,
        contentEntityId,
        entity: outcome.entity
      }
    }
  }

  return { ok: true, workspaceId, contentEntityId, entity: outcome.entity }
}

// ---------------------------------------------------------------------------
// Splitting a SHARED workspace entity into this World's own local copy
// -- "Customize for this World" from an already-shared entity.
// ---------------------------------------------------------------------------

export type SplitToLocalResult =
  | { ok: true; workspaceId: string; contentEntityId: string; entity: WorkspaceEntityDetail }
  | { ok: false; stage: 'resolver-disabled'; message: string }
  | { ok: false; stage: 'not-found'; message: string }
  | { ok: false; stage: 'not-shared'; message: string }
  | { ok: false; stage: 'no-base-reference'; message: string }
  | { ok: false; stage: 'import-failed'; message: string; retrySafe: boolean }
  | { ok: false; stage: 'persistence-unavailable'; message: string }

// Materializes a NEW entity in this World's own local workspace, seeded
// from the SHARED entity's CURRENT effective state -- the inherited
// starting point is the shared entity's own base data (so mechanics never
// change), and its CURRENT authored_presentation overrides are copied as
// the new local entity's OWN initial overrides (sparse -- only the paths
// actually customized on the shared entity, never the full merged
// object, so "preserve sparse overrides" holds exactly). Reuses the SAME
// primitives `customizeEntityForWorld` does (exact-entity import, atomic
// save) -- no new identity/storage mechanism.
//
// COLLAPSE EVIDENCE / LEGACY REFERENCES. The new local entity is imported
// from the EXACT SAME release (packageId/version) the shared entity's own
// `baseSourceRef` names, via the SAME `{kind:'entity'}` source
// `needs-preparation` uses -- so it carries the SAME `baseRefs`/legacy
// address evidence, which is what lets `resolveEffectiveContent`'s
// evidence-based union-find collapse it with the pinned release AND with
// the shared entity into ONE logical group. Within that group,
// `comparePrecedence` breaks the tie between the two `workspace`-mode
// candidates by binding RECENCY (rank 4) -- the local workspace, bound
// just now, outranks the shared workspace's own older binding, so the
// local copy wins for THIS World specifically, with no new precedence
// rule added. The shared workspace's OWN binding to this World is left
// alone (not removed) -- "shared editing" and "a local override" are
// alternatives the architecture lets coexist, never an implicit unbind.
//
// WHAT THIS CANNOT DO. If the shared entity has no base release reference
// at all (`origin: 'authored'`, created directly in that workspace with
// no imported base) there is nothing to re-import from, and this reports
// `no-base-reference` rather than guessing at one -- a real, documented
// limit of the current exact-entity-import primitive, not a bug.
export async function splitSharedEntityToLocalWorkspace(
  input: { worldId: string | number; entityType: string; slug: string; actorAccountId: string | null },
  systemKey: string
): Promise<SplitToLocalResult> {
  const target = await resolveDirectEditTarget(input.worldId, input.entityType, input.slug)

  if (target.mode === 'resolver-disabled') {
    return { ok: false, stage: 'resolver-disabled', message: 'Direct editing is not set up for this World yet.' }
  }
  if (target.mode !== 'existing-workspace') {
    return { ok: false, stage: 'not-found', message: `'${input.slug}' (${input.entityType}) is not currently a workspace-sourced entity in this World.` }
  }
  if (target.scope !== 'shared') {
    return { ok: false, stage: 'not-shared', message: 'This entity is not in a shared workspace -- there is nothing to split.' }
  }

  const sharedDetail = await getWorkspaceEntityDetail(target.workspaceId, target.contentEntityId)
  if (!sharedDetail) {
    return { ok: false, stage: 'not-found', message: 'The shared entity could not be found.' }
  }

  const packageId = sharedDetail.baseSourceRef?.packageId
  const version = sharedDetail.baseSourceRef?.version
  if (!packageId || !version) {
    return {
      ok: false,
      stage: 'no-base-reference',
      message: 'This entity has no original published release to re-import from (it was authored directly in the shared workspace), so it cannot be split into a local copy yet.'
    }
  }

  const workspace = await prepareWorldLocalWorkspace(input.worldId, input.actorAccountId, systemKey)

  const imported = await importIntoWorkspace({
    workspace,
    source: { kind: 'entity', packageId, version, entityType: input.entityType, slug: input.slug },
    dryRun: false,
    actorAccountId: input.actorAccountId
  })
  if (!imported.ok) {
    const retrySafe = 'retrySafe' in imported ? imported.retrySafe : false
    return { ok: false, stage: 'import-failed', message: imported.message, retrySafe }
  }

  const identities = await listWorkspaceEntityIdentities(workspace.id)
  const match = identities.find((identity) => identity.entityType === input.entityType && identity.slug === input.slug)
  if (!match) {
    return { ok: false, stage: 'not-found', message: 'The entity could not be located in the local workspace after import.' }
  }

  const bound = await bindWorkspaceLiveToWorld(input.worldId, workspace.id)
  if (!bound.bound) {
    return {
      ok: false,
      stage: 'import-failed',
      message: bound.stage === 'resolver-disabled' ? 'Direct editing is not set up for this World yet.' : 'The local workspace could not be bound to this World.',
      retrySafe: true
    }
  }

  // Seed the new local entity with the shared entity's CURRENT overrides
  // -- sparse, only the paths actually customized there, never the full
  // merged presentation. An entity with no overrides at all (customized
  // only implicitly, e.g. via a checkpoint with no field edits) has
  // nothing to seed; the fresh import's own inherited values already
  // match, so this is skipped rather than writing an empty edit list.
  if (sharedDetail.authoredPresentation.length) {
    const localDetail = await getWorkspaceEntityDetail(workspace.id, match.contentEntityId)
    if (!localDetail) {
      return { ok: false, stage: 'not-found', message: 'The new local entity could not be found right after import.' }
    }
    const basePresentation = resolveBasePresentation(localDetail)
    const edits = sharedDetail.authoredPresentation.map((override) => ({
      path: override.path,
      value: override.value,
      baseValueHash: computePresentationBaseValueHash(basePresentation, override.path)
    }))

    const outcome = await applyPresentationEdits(workspace.id, match.contentEntityId, localDetail.revision, edits, input.actorAccountId)
    if (!outcome.ok) {
      if (outcome.stage === 'persistence-unavailable') return { ok: false, stage: 'persistence-unavailable', message: outcome.message }
      // A seeding conflict can only mean a concurrent split of the SAME
      // (World, entity) race -- retry-safe, since the import above is
      // itself idempotent and will simply find the entity already there.
      return { ok: false, stage: 'import-failed', message: 'The new local copy was created, but seeding its initial values hit a conflict -- retry.', retrySafe: true }
    }
    return { ok: true, workspaceId: workspace.id, contentEntityId: match.contentEntityId, entity: outcome.entity }
  }

  const finalDetail = await getWorkspaceEntityDetail(workspace.id, match.contentEntityId)
  if (!finalDetail) {
    return { ok: false, stage: 'not-found', message: 'The new local entity could not be found right after import.' }
  }
  return { ok: true, workspaceId: workspace.id, contentEntityId: match.contentEntityId, entity: finalDetail }
}
