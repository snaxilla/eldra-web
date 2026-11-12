// DELETE /api/content/lineages/:packageId/owner -- un-adopt.
//
// The documented escape hatch (content-workspaces-and-studio.md §11.4):
// releasing a lineage RE-ENABLES the legacy direct-publish and
// source-refresh paths for it. Audited, reversible, never automatic.
//
// Releases nothing, deletes no release, and rebinds no World.

import { createError, defineEventHandler, getRouterParam } from 'h3'

import { validatePackageIdParam } from '../../../../../app/lib/content-workspaces/validation'
import { releasePackageLineage } from '../../../../utils/content-package-lineages'
import { appendWorkspaceRevision } from '../../../../utils/content-workspaces'
import { orBadRequest, requirePlatformCapability, withWorkspaceHttp } from '../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const principal = requirePlatformCapability(event, 'platform.contentpack.publish')
  const packageId = orBadRequest(validatePackageIdParam(getRouterParam(event, 'packageId')))

  return await withWorkspaceHttp(async () => {
    const result = await releasePackageLineage(packageId)

    if (!result.ok) {
      throw createError({
        statusCode: 409,
        statusMessage: result.stage === 'frozen'
          ? `Package lineage '${packageId}' is frozen; unfreeze it before releasing ownership.`
          : `Package lineage '${packageId}' is not adopted, so there is no ownership to release.`,
        data: { code: result.stage }
      })
    }

    await appendWorkspaceRevision({
      workspaceId: result.previousOwnerWorkspaceId,
      contentEntityId: null,
      kind: 'adopt',
      actorAccountId: principal.accountId,
      label: `Released package lineage ${packageId}`,
      diff: [{ channel: 'lineage', path: packageId, from: result.previousOwnerWorkspaceId, to: null }]
    })

    return {
      released: true,
      packageId,
      previousOwnerWorkspaceId: result.previousOwnerWorkspaceId,
      note: 'Direct publishing, Refresh Content Package, and packages:sync are available for this lineage again.'
    }
  })
})
