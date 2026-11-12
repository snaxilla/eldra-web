// GET /api/content/workspaces/:workspaceId -- one workspace, with its
// entity count and the lineages it owns.

import { defineEventHandler, getRouterParam } from 'h3'

import { listPackageLineages } from '../../../../utils/content-package-lineages'
import { countWorkspaceEntities } from '../../../../utils/content-workspaces'
import {
  requirePlatformCapability,
  requireWorkspace,
  requireWorkspaceIdParam,
  withWorkspaceHttp
} from '../../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  requirePlatformCapability(event, 'platform.contentworkspace.view')
  const workspaceId = requireWorkspaceIdParam(getRouterParam(event, 'workspaceId'))

  return await withWorkspaceHttp(async () => {
    const workspace = await requireWorkspace(workspaceId)
    const lineages = await listPackageLineages()

    return {
      workspace,
      entityCount: await countWorkspaceEntities(workspace.id),
      ownedLineages: lineages.filter((lineage) => lineage.ownerWorkspaceId === workspace.id)
    }
  })
})
