// POST /api/content/workspaces/:workspaceId/adopt-lineage { packageId }
//
// Makes this workspace the sole publisher of a package lineage
// (content-workspaces-and-studio.md §11.1).
//
// Adoption publishes nothing, rebinds no World, and does not touch any
// existing release. It writes one registry row and one audit revision.
// What changes is only who may publish next.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import { validatePackageIdParam } from '../../../../../app/lib/content-workspaces/validation'
import { adoptPackageLineage } from '../../../../utils/content-package-lineages'
import { checkLineageSystemCompatibility } from '../../../../utils/content-lineage-compatibility'
import { appendWorkspaceRevision } from '../../../../utils/content-workspaces'
import {
  orBadRequest,
  requirePlatformCapability,
  requireWorkspace,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  // Deciding who publishes a lineage is a publishing decision, so this
  // is gated on the EXISTING publish capability (§14.3) -- editing a
  // workspace is deliberately not enough.
  const principal = requirePlatformCapability(event, 'platform.contentpack.publish')
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))

  const body = await readBody(event)
  const packageId = orBadRequest(validatePackageIdParam((body as Record<string, unknown> | null)?.packageId))

  return await withWorkspaceHttp(async () => {
    const workspace = await requireWorkspace(workspaceId, { mutable: true })

    const compatibility = await checkLineageSystemCompatibility(packageId, workspace.systemKey)
    if (!compatibility.compatible) {
      throw createError({ statusCode: 409, statusMessage: compatibility.message })
    }

    const result = await adoptPackageLineage({ packageId, workspaceId, accountId: principal.accountId })

    if (!result.ok) {
      throw createError({
        statusCode: 409,
        statusMessage: result.stage === 'frozen'
          ? `Package lineage '${packageId}' is frozen and cannot be adopted.`
          : `Package lineage '${packageId}' is already owned by Content Workspace ${result.ownerWorkspaceId ?? '(unknown)'}.`,
        data: { code: result.stage, ownerWorkspaceId: result.stage === 'owned-by-other' ? result.ownerWorkspaceId : null }
      })
    }

    if (result.changed) {
      await appendWorkspaceRevision({
        workspaceId,
        contentEntityId: null,
        kind: 'adopt',
        actorAccountId: principal.accountId,
        label: `Adopted package lineage ${packageId}`,
        diff: [{ channel: 'lineage', path: packageId, from: null, to: workspaceId }]
      })
    }

    return { lineage: result.lineage, alreadyOwned: !result.changed }
  })
})
