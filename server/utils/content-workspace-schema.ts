// Directus failure classification for the Content Workspace collections.
//
// The shapes below were observed against Directus 11.12.0 (the deployed
// version), not assumed:
//   - a collection that does not exist answers 403 FORBIDDEN, on both
//     /items/<collection> and /collections/<collection>;
//   - a unique-constraint violation answers 400 RECORD_NOT_UNIQUE;
//   - a POST of an array is one transaction: one bad row rolls back all.

import { createError } from 'h3'

const PROVISIONING_HINT =
  "Run 'node scripts/directus/bootstrap.mjs' against this deployment's Directus, then "
  + "'node scripts/directus/verify-content-workspaces-schema.mjs'."

function errorStatus(error: unknown): number | null {
  const e = error as { statusCode?: number; status?: number; response?: { status?: number } } | null
  return e?.statusCode ?? e?.status ?? e?.response?.status ?? null
}

function errorCodes(error: unknown): string[] {
  const data = (error as { data?: { errors?: unknown } } | null)?.data
  const errors = Array.isArray(data?.errors) ? data.errors : []
  return errors
    .map((entry) => (entry as { extensions?: { code?: unknown } } | null)?.extensions?.code)
    .filter((code): code is string => typeof code === 'string')
}

export function isDirectusForbidden(error: unknown): boolean {
  return errorStatus(error) === 403
}

export function isDirectusUniqueViolation(error: unknown): boolean {
  return errorCodes(error).includes('RECORD_NOT_UNIQUE')
}

export function describeDirectusError(error: unknown): string {
  const data = (error as { data?: { errors?: unknown } } | null)?.data
  const errors = Array.isArray(data?.errors) ? data.errors : []
  const messages = errors
    .map((entry) => (entry as { message?: unknown } | null)?.message)
    .filter((message): message is string => typeof message === 'string')
  if (messages.length) return messages.join('; ')
  return (error as { message?: string } | null)?.message || 'unknown Directus error'
}

// The Content Workspace collections are absent, or the service token may
// not use them. Either way no Content Workspace feature can work, and the
// remedy is the same operator action.
export class ContentWorkspaceSchemaError extends Error {
  readonly collection: string

  constructor(collection: string) {
    super(
      `Content Workspaces are not available: the '${collection}' collection is missing or the service token cannot access it. ${PROVISIONING_HINT}`
    )
    this.name = 'ContentWorkspaceSchemaError'
    this.collection = collection
  }
}

// Runs one Directus operation against a Content Workspace collection and
// turns "collection missing or inaccessible" into a named, actionable
// error. Every other failure propagates untouched.
export async function withWorkspaceSchema<T>(collection: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isDirectusForbidden(error)) throw new ContentWorkspaceSchemaError(collection)
    throw error
  }
}

// For routes: an unprovisioned schema is a 503 with the operator remedy,
// never an empty success and never an unexplained 500.
export function throwContentWorkspaceHttpError(error: unknown): never {
  if (error instanceof ContentWorkspaceSchemaError) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Content Workspaces schema is not provisioned',
      data: { code: 'content-workspace-schema-unavailable', message: error.message }
    })
  }
  throw error
}
