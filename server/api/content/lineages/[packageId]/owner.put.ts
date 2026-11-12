// PUT /api/content/lineages/:packageId/owner { workspaceId }
//
// Transfers an adopted lineage to another workspace
// (content-workspaces-and-studio.md §11.4). Both the previous and the
// new owner are recorded.
//
// Transfer publishes nothing and mutates no release. There is never a
// moment with two owners: the registry row holds exactly one
// `owner_workspace_id`, and the write is confirmed by reading it back --
// a different owner found there is reported, never overwritten again.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import {
  isWorkspaceId,
  validatePackageIdParam
} from '../../../../../app/lib/content-workspaces/validation'
import { transferPackageLineage } from '../../../../utils/content-package-lineages'
import { checkLineageSystemCompatibility } from '../../../../utils/content-lineage-compatibility'
import { appendWorkspaceRevision } from '../../../../utils/content-workspaces'
import {
  badRequest,
  orBadRequest,
  requirePlatformCapability,
  requireWorkspace,
  withWorkspaceHttp
} from '../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const principal = requirePlatformCapability(event, 'platform.contentpack.publish')
  const packageId = orBadRequest(validatePackageIdParam(getRouterParam(event, 'packageId')))

  const body = (await readBody(event)) as Record<string, unknown> | null
  const toWorkspaceId = body?.workspaceId
  if (!isWorkspaceId(toWorkspaceId)) badRequest(['workspaceId is required and must be a workspace id'])

  return await withWorkspaceHttp(async () => {
    const workspace = await requireWorkspace(toWorkspaceId as string, { mutable: true })

    const compatibility = await checkLineageSystemCompatibility(packageId, workspace.systemKey)
    if (!compatibility.compatible) {
      throw createError({ statusCode: 409, statusMessage: compatibility.message })
    }

    const result = await transferPackageLineage({
      packageId,
      toWorkspaceId: workspace.id,
      accountId: principal.accountId
    })

    if (!result.ok) {
      const messages: Record<string, string> = {
        'not-adopted': `Package lineage '${packageId}' is not adopted, so there is no ownership to transfer. Adopt it from a workspace instead.`,
        frozen: `Package lineage '${packageId}' is frozen and cannot change owner.`,
        unchanged: `Content Workspace '${workspace.title}' already owns package lineage '${packageId}'.`,
        conflict: `Package lineage '${packageId}' changed owner while this transfer was running. Nothing was overwritten.`
      }
      throw createError({ statusCode: 409, statusMessage: messages[result.stage], data: { code: result.stage } })
    }

    await appendWorkspaceRevision({
      workspaceId: workspace.id,
      contentEntityId: null,
      kind: 'adopt',
      actorAccountId: principal.accountId,
      label: `Took ownership of package lineage ${packageId}`,
      diff: [{ channel: 'lineage', path: packageId, from: result.previousOwnerWorkspaceId, to: workspace.id }]
    })

    // The losing workspace's own history records the transfer too, so
    // neither side's audit trail has a silent gap.
    await appendWorkspaceRevision({
      workspaceId: result.previousOwnerWorkspaceId,
      contentEntityId: null,
      kind: 'adopt',
      actorAccountId: principal.accountId,
      label: `Transferred package lineage ${packageId} away`,
      diff: [{ channel: 'lineage', path: packageId, from: result.previousOwnerWorkspaceId, to: workspace.id }]
    })

    return { lineage: result.lineage, previousOwnerWorkspaceId: result.previousOwnerWorkspaceId }
  })
})
