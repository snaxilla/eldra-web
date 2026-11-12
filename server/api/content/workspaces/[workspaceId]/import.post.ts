// POST /api/content/workspaces/:workspaceId/import
//
// Imports from a published release or a registered source collection.
// `dryRun: true` plans without writing anything.
//
// A partial import NEVER returns success: an executor failure after some
// rows were durably written answers 409/502 with what was written and
// an explicit statement that re-running completes the rest.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

import { validateImportRequest } from '../../../../../app/lib/content-workspaces/validation'
import { importIntoWorkspace } from '../../../../utils/content-workspace-import'
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

  const request = orBadRequest(validateImportRequest(await readBody(event)))

  return await withWorkspaceHttp(async () => {
    const workspace = await requireWorkspace(workspaceId, { mutable: !request.dryRun })

    const outcome = await importIntoWorkspace({
      workspace,
      source: request.source,
      dryRun: request.dryRun,
      actorAccountId: principal.accountId
    })

    if (!outcome.ok) {
      // Checked POSITIVELY so the write-failure shape is the narrowed
      // one: `progress` and `retrySafe` exist only on these two.
      if (outcome.stage === 'write-failed' || outcome.stage === 'conflict') {
        // Written work is reported rather than hidden, and the response
        // states plainly that a retry is safe and will not duplicate.
        throw createError({
          statusCode: outcome.stage === 'conflict' ? 409 : 502,
          statusMessage: outcome.message,
          data: { code: outcome.stage, progress: outcome.progress, retrySafe: outcome.retrySafe }
        })
      }

      if (outcome.stage === 'source-not-found') {
        throw createError({ statusCode: 404, statusMessage: outcome.message })
      }
      if (outcome.stage === 'source-unavailable') {
        throw createError({ statusCode: 502, statusMessage: outcome.message })
      }

      throw createError({ statusCode: 400, statusMessage: outcome.message })
    }

    return { applied: outcome.applied, report: outcome.report, progress: outcome.progress }
  })
})
