// GET /api/content/lineages -- the package lineage ownership registry.
//
// This is what makes "who may publish this package?" inspectable rather
// than something an admin discovers by being refused.

import { defineEventHandler } from 'h3'

import { listPackageLineages } from '../../../utils/content-package-lineages'
import { requirePlatformCapability, withWorkspaceHttp } from '../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  requirePlatformCapability(event, 'platform.contentworkspace.view')

  return await withWorkspaceHttp(async () => ({ lineages: await listPackageLineages() }))
})
