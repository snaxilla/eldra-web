// POST /api/worlds/:id/entities/:entityType/:slug/customize
// -- Direct Content Editing consolidation pass. THE Save action behind
// "Items -> Shortsword -> Edit -> change picture/description -> Save."
// Thin by design: this route owns authorization and request shape only;
// server/utils/content-entity-direct-edit.ts owns the workflow itself
// (resolve -> prepare-if-needed -> import exactly one entity -> bind ->
// save), shared with Content Studio's own customization path.
//
// AUTHORIZATION. `world.entity.edit` -- an EXISTING World capability
// (owner/gm/worldbuilder), not a new one, and NOT the platform-scoped
// `platform.contentworkspace.edit` the advanced Studio editor's own PATCH
// route requires. Deliberate: Studio's audience is platform-level content
// operators; this route's audience is ordinary World admins doing
// everyday content editing (ELDRA's own product requirement), and
// equating "owns/edits this World" with "holds platform workspace
// authority" is exactly what content-workspaces-and-studio.md warns
// against. The one ESCALATED action this workflow can reach --
// live-binding a brand-new LOCAL workspace to THIS World, and ONLY this
// World -- is narrow enough that `world.entity.edit` covers it; nothing
// here ever binds or edits an EXISTING shared workspace on a
// worldbuilder's say-so (see the `scope: 'shared'` case below).

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../../../utils/authorization'
import { requireWorkspaceEntityAccess } from '../../../../../../utils/content-workspace-http'
import { getWorldSystemKey } from '../../../../../../utils/entity-factory'
import { customizeEntityForWorld, resolveDirectEditTarget, type CustomizeEntityFieldEdit } from '../../../../../../utils/content-entity-direct-edit'
import { isValidOverridePath } from '../../../../../../../app/lib/content-authoring/overrides'
import { isValidMechanicsOverridePath } from '../../../../../../utils/content-workspace-entities'
import { validateItemMechanicsOverrideValue } from '../../../../../../../app/lib/item-mechanics'

const MAX_EDITS = 10

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  // RESTORE A CLEAR, CONSISTENT FULL-EDITOR ENTRY POINT -- read through
  // 'entityId' because this folder was merged out of a sibling
  // `[entityType]/` into `[entityId]/`, fixing a real Nitro routing
  // collision (two differently-named dynamic folders under one `entities/`
  // parent). This route's own URL/behavior/callers are unchanged -- see
  // the sibling edit-target.get.ts's own comment for the full trace.
  const entityType = String(getRouterParam(event, 'entityId') || '')
  const slug = String(getRouterParam(event, 'slug') || '')
  if (!worldId || !entityType || !slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id, entity type, or slug' })
  }

  const principal = event.context.principal ?? null
  if (!principal) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId })

  const body = await readBody(event)
  const rawEdits = Array.isArray(body?.edits) ? body.edits : null
  if (!rawEdits || !rawEdits.length) throw createError({ statusCode: 400, statusMessage: 'edits must be a non-empty array' })
  if (rawEdits.length > MAX_EDITS) throw createError({ statusCode: 400, statusMessage: `edits must contain at most ${MAX_EDITS} entries` })

  // ITEM MECHANICS AVAILABLE ON THE FIRST EDIT -- `channel` is OPTIONAL
  // per edit and defaults to 'presentation', mirroring the SAME convention
  // app/lib/content-workspaces/validation.ts's validateEntityPatchRequest
  // already established for the PATCH route, so an existing caller's old
  // body shape (edits with no `channel` at all) still validates and
  // behaves exactly as before. Mechanics path/value validation reuses the
  // SAME primitives the already-prepared editor's own PATCH route uses
  // (isValidMechanicsOverridePath, validateItemMechanicsOverrideValue) --
  // never a second, duplicated mechanics rulebook. "Reject the whole
  // request if any operation is invalid": the first invalid edit throws
  // before customizeEntityForWorld ever runs, so a request mixing one
  // good and one bad edit never imports/binds anything.
  const edits: CustomizeEntityFieldEdit[] = []
  for (const raw of rawEdits) {
    if (!raw || typeof raw !== 'object' || typeof raw.path !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'each edit must be an object with a string path' })
    }
    const channel = raw.channel === undefined ? 'presentation' : raw.channel
    if (channel !== 'presentation' && channel !== 'mechanics') {
      throw createError({ statusCode: 400, statusMessage: `'${raw.path}': channel must be 'presentation' or 'mechanics'` })
    }
    if (channel === 'presentation') {
      if (!isValidOverridePath('presentation', raw.path)) {
        throw createError({ statusCode: 400, statusMessage: `'${raw.path}' is not an editable presentation field` })
      }
    } else {
      if (!isValidMechanicsOverridePath(entityType, raw.path)) {
        throw createError({ statusCode: 400, statusMessage: `'${raw.path}' is not an editable mechanics field for this entity` })
      }
      const validation = validateItemMechanicsOverrideValue(raw.path, raw.value)
      if (!validation.ok) {
        throw createError({ statusCode: 400, statusMessage: `'${raw.path}': ${validation.problems.join('; ')}` })
      }
    }
    edits.push({ channel, path: raw.path, value: raw.value })
  }

  const rawExpectedRevision = body?.expectedRevision
  const expectedRevision = rawExpectedRevision === null || rawExpectedRevision === undefined
    ? null
    : (Number.isInteger(rawExpectedRevision) ? rawExpectedRevision : undefined)
  if (expectedRevision === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'expectedRevision must be a whole number, or null for a never-yet-customized entity' })
  }

  // Shared-workspace escalation check, BEFORE the workflow runs --
  // delegated to the SAME `requireWorkspaceEntityAccess` the Studio
  // entity routes use (content-workspace-http.ts), rather than a second,
  // independently-maintained copy of "is this shared, and if so does the
  // caller hold the stronger capability" -- the pre-commit boundary
  // review found exactly this kind of duplicated check had drifted out
  // of sync once already. `needs-preparation` has no workspace yet (a
  // fresh local one is never shared), so this only runs for an entity
  // that is ALREADY workspace-sourced.
  const target = await resolveDirectEditTarget(worldId, entityType, slug)
  if (target.mode === 'existing-workspace') {
    await requireWorkspaceEntityAccess(event, 'platform.contentworkspace.edit', target.workspaceId, worldId, 'write')
  }

  const systemKey = await getWorldSystemKey(worldId)
  const result = await customizeEntityForWorld(
    { worldId, entityType, slug, edits, actorAccountId: principal.accountId, expectedRevision },
    systemKey
  )

  if (!result.ok) {
    if (result.stage === 'resolver-disabled') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Direct editing is not set up for this World yet',
        data: { code: 'effective-content-disabled', message: result.message }
      })
    }
    if (result.stage === 'not-found') throw createError({ statusCode: 404, statusMessage: result.message })
    if (result.stage === 'invalid-path') throw createError({ statusCode: 400, statusMessage: result.message })
    if (result.stage === 'persistence-unavailable') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Content editing is not available on this deployment',
        data: { code: 'content-workspace-persistence-unavailable', message: result.message }
      })
    }
    if (result.stage === 'import-failed') {
      throw createError({
        statusCode: 502,
        statusMessage: result.message,
        data: { code: 'direct-edit-preparation-failed', retrySafe: result.retrySafe }
      })
    }
    if (result.stage === 'activation-failed') {
      // The save is DURABLE -- distinct status/code from `import-failed`
      // so the client never reports this as "your edit was lost." It
      // was not; only going live failed. Returns the already-saved
      // entity so the UI can show it, truthfully marked not-yet-live.
      throw createError({
        statusCode: 502,
        statusMessage: result.message,
        data: {
          code: 'direct-edit-activation-failed',
          retrySafe: result.retrySafe,
          workspaceId: result.workspaceId,
          contentEntityId: result.contentEntityId,
          entity: result.entity
        }
      })
    }
    throw createError({
      statusCode: 409,
      statusMessage: result.message,
      data: { code: 'revision-conflict', current: result.current }
    })
  }

  return { workspaceId: result.workspaceId, contentEntityId: result.contentEntityId, entity: result.entity }
})
