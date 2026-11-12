// POST /api/content/workspaces -- create a Content Workspace.
// Content Workspaces & Studio Phase 3.

import { createError, defineEventHandler, readBody } from 'h3'

import { GAME_SYSTEM_REGISTRY } from '../../../../app/lib/content-sources/registry'
import { validateWorkspaceCreate } from '../../../../app/lib/content-workspaces/validation'
import { appendWorkspaceRevision, createContentWorkspace } from '../../../utils/content-workspaces'
import { orBadRequest, requirePlatformCapability, withWorkspaceHttp } from '../../../utils/content-workspace-http'

export default defineEventHandler(async (event) => {
  const principal = requirePlatformCapability(event, 'platform.contentworkspace.create')

  const body = await readBody(event)
  const input = orBadRequest(
    validateWorkspaceCreate(body, GAME_SYSTEM_REGISTRY.map((system) => system.key))
  )

  return await withWorkspaceHttp(async () => {
    const result = await createContentWorkspace(input, principal.accountId)

    if (!result.ok) {
      throw createError({
        statusCode: 409,
        statusMessage: `A Content Workspace with the key '${result.workspaceKey}' already exists.`
      })
    }

    await appendWorkspaceRevision({
      workspaceId: result.workspace.id,
      contentEntityId: null,
      kind: 'checkpoint',
      actorAccountId: principal.accountId,
      label: 'Workspace created',
      diff: [{ channel: 'workspace', path: 'status', from: null, to: 'active' }]
    })

    return { workspace: result.workspace }
  })
})
