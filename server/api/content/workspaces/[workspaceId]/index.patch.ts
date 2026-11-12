// PATCH /api/content/workspaces/:workspaceId -- change a workspace's
// mutable metadata, or archive/restore it.
//
// The body is checked against an ALLOWLIST (validateWorkspacePatch):
// title, description, and status only. Identity (`workspaceKey`,
// `systemKey`), ownership, timestamps, provenance, snapshots, override
// channels, and publication state are not reachable from here, and an
// unknown key is a 400 rather than a silently dropped field -- a caller
// that believes it changed something must never be told it succeeded
// when nothing happened.

import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { validateWorkspacePatch } from '../../../../../app/lib/content-workspaces/validation'
import { requireCapability } from '../../../../utils/authorization'
import { appendWorkspaceRevision, updateContentWorkspace } from '../../../../utils/content-workspaces'
import {
  orBadRequest,
  requirePlatformCapability,
  requireWorkspace,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const principal = requirePlatformCapability(event, 'platform.contentworkspace.edit')
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))

  const patch = orBadRequest(validateWorkspacePatch(await readBody(event)))

  // §14.2 bundles archiving with creating, not with editing: ending a
  // library's life is the same kind of decision as starting one.
  if (patch.status !== undefined) {
    requireCapability(principal, 'platform.contentworkspace.create', { kind: 'platform' })
  }

  return await withWorkspaceHttp(async () => {
    // An archived workspace may still be restored, so a status-only
    // patch is allowed through; anything else needs it mutable.
    const onlyStatus = patch.title === undefined && patch.description === undefined
    const before = await requireWorkspace(workspaceId, { mutable: !onlyStatus })

    const workspace = await updateContentWorkspace(workspaceId, patch)

    const diff = Object.entries(patch).map(([path, to]) => ({
      channel: 'workspace',
      path,
      from: (before as unknown as Record<string, unknown>)[path] ?? null,
      to: to ?? null
    }))

    await appendWorkspaceRevision({
      workspaceId,
      contentEntityId: null,
      kind: patch.status === 'archived' ? 'disable' : 'checkpoint',
      actorAccountId: principal.accountId,
      label: patch.status === 'archived' ? 'Workspace archived' : 'Workspace metadata changed',
      diff
    })

    return { workspace }
  })
})
