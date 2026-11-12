// GET /api/content/workspaces -- every Content Workspace.
// Content Workspaces & Studio Phase 3.

import { defineEventHandler } from 'h3'

import { listContentWorkspaces, countWorkspaceEntities } from '../../../utils/content-workspaces'
import { requirePlatformCapability, withWorkspaceHttp } from '../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  requirePlatformCapability(event, 'platform.contentworkspace.view')

  return await withWorkspaceHttp(async () => {
    const workspaces = await listContentWorkspaces()

    // Sequential rather than Promise.all: this is an admin listing of a
    // handful of workspaces, and a fan-out over an unbounded list is the
    // pattern this design rules out elsewhere.
    const rows = []
    for (const workspace of workspaces) {
      rows.push({ ...workspace, entityCount: await countWorkspaceEntities(workspace.id) })
    }

    return { workspaces: rows }
  })
})
