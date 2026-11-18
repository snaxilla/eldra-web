// content-workspace-http.ts's error mapping -- what matters: a database
// unavailability error (ContentWorkspacePersistenceUnavailableError) and a
// missing-schema error (ContentWorkspaceSchemaError) each become a
// DISTINCT, explicit 503, never the generic 500 an unrecognized error
// would fall through to, and never silently swallowed into a 404 by a
// route that only checks `if (!entity)`.

import { describe, expect, it } from 'vitest'
import { asHttpError, withWorkspaceHttp } from '../../../server/utils/content-workspace-http'
import { ContentWorkspacePersistenceUnavailableError, ContentWorkspaceSchemaError } from '../../../server/utils/content-workspace-schema'

describe('asHttpError / withWorkspaceHttp', () => {
  it('maps ContentWorkspacePersistenceUnavailableError to a 503, carrying the original message', async () => {
    await expect(
      withWorkspaceHttp(async () => {
        throw new ContentWorkspacePersistenceUnavailableError('Content Workspace entity read failed (persistence-unconfigured): ELDRA_WORKSPACE_DB_URL is not configured')
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { code: 'content-workspace-persistence-unavailable', message: expect.stringContaining('ELDRA_WORKSPACE_DB_URL') }
    })
  })

  it('maps ContentWorkspaceSchemaError to its own distinct 503', async () => {
    await expect(
      withWorkspaceHttp(async () => {
        throw new ContentWorkspaceSchemaError('content_workspace_entities')
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { code: 'content-workspace-schema-unavailable' }
    })
  })

  it('a persistence failure is NEVER mistaken for the schema error, and vice versa -- distinct codes', async () => {
    const persistenceResult = await withWorkspaceHttp(async () => {
      throw new ContentWorkspacePersistenceUnavailableError('unavailable')
    }).catch((e) => e)
    const schemaResult = await withWorkspaceHttp(async () => {
      throw new ContentWorkspaceSchemaError('content_workspaces')
    }).catch((e) => e)

    expect(persistenceResult.data.code).toBe('content-workspace-persistence-unavailable')
    expect(schemaResult.data.code).toBe('content-workspace-schema-unavailable')
  })

  it('an unrelated error passes through unchanged -- never silently recast as a Content Workspace failure', async () => {
    await expect(
      withWorkspaceHttp(async () => {
        throw new Error('some other bug')
      })
    ).rejects.toThrow('some other bug')
  })

  it('a successful operation resolves normally', async () => {
    expect(await withWorkspaceHttp(async () => 'ok')).toBe('ok')
  })

  it('asHttpError always throws, never returns, even for an unrelated error', () => {
    expect(() => asHttpError(new Error('x'))).toThrow('x')
  })
})
