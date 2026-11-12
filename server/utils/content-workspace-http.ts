// HTTP concerns for the Content Workspace routes: authorization, param
// and body validation, and error mapping. Kept out of the persistence and
// planning modules so those stay testable without an H3Event, and out of
// the route files so thirteen handlers cannot drift from each other.
//
// Every route calls requireCapability EXPLICITLY through these helpers.
// Nothing here is authorized by being hard to reach from the UI.

import { createError, type H3Event } from 'h3'
import type { ContentWorkspace } from '../../app/lib/content-workspaces/types'
import type { Validated } from '../../app/lib/content-workspaces/validation'
import { isWorkspaceId } from '../../app/lib/content-workspaces/validation'
import { requireCapability, type Capability, type Principal } from './authorization'
import { getContentWorkspace } from './content-workspaces'
import { ContentWorkspaceSchemaError } from './content-workspace-schema'

export function requirePrincipal(event: H3Event): Principal {
  const principal = event.context.principal ?? null
  if (!principal) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  return principal
}

export function requirePlatformCapability(event: H3Event, capability: Capability): Principal {
  const principal = requirePrincipal(event)
  requireCapability(principal, capability, { kind: 'platform' })
  return principal
}

export function badRequest(problems: readonly string[]): never {
  throw createError({
    statusCode: 400,
    statusMessage: problems[0] ?? 'Invalid request',
    data: { problems: [...problems] }
  })
}

// Unwraps a Validated<T>, turning problems into a 400 that lists all of
// them rather than only the first.
export function orBadRequest<T>(result: Validated<T>): T {
  if (!result.ok) badRequest(result.problems)
  return result.value
}

export function requireWorkspaceIdParam(value: unknown): string {
  if (!isWorkspaceId(value)) badRequest(['workspaceId is malformed'])
  return value as string
}

// A workspace that does not exist is a 404, and an archived one refuses
// writes -- archiving is meant to stop authoring, not merely to grey a
// row out in a list.
export async function requireWorkspace(workspaceId: string, options: { mutable?: boolean } = {}): Promise<ContentWorkspace> {
  const workspace = await getContentWorkspace(workspaceId)
  if (!workspace) throw createError({ statusCode: 404, statusMessage: 'Content Workspace not found' })

  if (options.mutable && workspace.status === 'archived') {
    throw createError({
      statusCode: 409,
      statusMessage: `Content Workspace '${workspace.title}' is archived. Restore it before changing it.`
    })
  }

  return workspace
}

// The Content Workspace collections are not provisioned, or the service
// token cannot use them. A 503 naming the operator remedy, never an empty
// list that would read as "this deployment has no workspaces".
export function asHttpError(error: unknown): never {
  if (error instanceof ContentWorkspaceSchemaError) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Content Workspaces are not available on this deployment',
      data: { code: 'content-workspace-schema-unavailable', message: error.message, collection: error.collection }
    })
  }
  throw error
}

// Wraps a handler body so an unprovisioned schema becomes the 503 above
// wherever it surfaces.
export async function withWorkspaceHttp<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    asHttpError(error)
  }
}
