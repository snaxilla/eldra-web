// Input validation for Content Workspace APIs -- pure, no I/O. Routes
// call these and turn `{ ok: false }` into a 400; nothing here knows HTTP.

import { isAddressSegment, isContentEntityId, isPackageId } from '../content-identity'
import type { ContentWorkspaceStatus } from './types'

export type Validated<T> = { ok: true; value: T } | { ok: false; problems: string[] }

const WORKSPACE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VERSION_PATTERN = /^\d+\.\d+\.\d+/
const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 4000

export const WORKSPACE_PAGE_DEFAULT_LIMIT = 50
export const WORKSPACE_PAGE_MAX_LIMIT = 100
const MAX_OFFSET = 1_000_000

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isWorkspaceKey(value: unknown): value is string {
  return typeof value === 'string' && WORKSPACE_KEY_PATTERN.test(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readTitle(value: unknown, problems: string[]): string {
  if (typeof value !== 'string' || !value.trim()) {
    problems.push('title is required')
    return ''
  }
  const title = value.trim()
  if (title.length > MAX_TITLE_LENGTH) problems.push(`title must be at most ${MAX_TITLE_LENGTH} characters`)
  return title
}

function readDescription(value: unknown, problems: string[]): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') {
    problems.push('description must be text')
    return null
  }
  if (value.length > MAX_DESCRIPTION_LENGTH) {
    problems.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`)
  }
  return value.trim() || null
}

export type WorkspaceCreateInput = {
  workspaceKey: string
  title: string
  description: string | null
  systemKey: string
}

export function validateWorkspaceCreate(body: unknown, knownSystemKeys: readonly string[]): Validated<WorkspaceCreateInput> {
  if (!isPlainObject(body)) return { ok: false, problems: ['request body must be an object'] }
  const problems: string[] = []

  const workspaceKey = typeof body.workspaceKey === 'string' ? body.workspaceKey.trim() : ''
  if (!isWorkspaceKey(workspaceKey)) {
    problems.push('workspaceKey must be 3-64 lowercase letters, digits, or hyphens, and start and end with a letter or digit')
  }

  const title = readTitle(body.title, problems)
  const description = readDescription(body.description, problems)

  const systemKey = typeof body.systemKey === 'string' ? body.systemKey.trim() : ''
  if (!knownSystemKeys.includes(systemKey)) {
    problems.push(`systemKey must be one of: ${knownSystemKeys.join(', ') || '(no game systems registered)'}`)
  }

  if (problems.length) return { ok: false, problems }
  return { ok: true, value: { workspaceKey, title, description, systemKey } }
}

// The only fields a generic workspace PATCH may change. Identity
// (`workspaceKey`, `systemKey`), ownership, and timestamps are not here,
// and an unknown key is an error rather than silently dropped -- a caller
// that believes it changed something must be told it did not.
const WORKSPACE_PATCH_FIELDS = ['title', 'description', 'status'] as const

export type WorkspacePatchInput = {
  title?: string
  description?: string | null
  status?: ContentWorkspaceStatus
}

export function validateWorkspacePatch(body: unknown): Validated<WorkspacePatchInput> {
  if (!isPlainObject(body)) return { ok: false, problems: ['request body must be an object'] }
  const problems: string[] = []
  const patch: WorkspacePatchInput = {}

  for (const key of Object.keys(body)) {
    if (!(WORKSPACE_PATCH_FIELDS as readonly string[]).includes(key)) {
      problems.push(`'${key}' cannot be changed through this endpoint`)
    }
  }

  if ('title' in body) patch.title = readTitle(body.title, problems)
  if ('description' in body) patch.description = readDescription(body.description, problems)
  if ('status' in body) {
    if (body.status === 'active' || body.status === 'archived') patch.status = body.status
    else problems.push("status must be 'active' or 'archived'")
  }

  if (!problems.length && Object.keys(patch).length === 0) problems.push('nothing to change')
  if (problems.length) return { ok: false, problems }
  return { ok: true, value: patch }
}

export type PageRequest = { limit: number; offset: number }

function readInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const text = Array.isArray(value) ? String(value[0]) : String(value)
  if (!/^\d+$/.test(text)) return Number.NaN
  return Number(text)
}

export function validatePageRequest(query: Record<string, unknown>): Validated<PageRequest> {
  const problems: string[] = []
  const limit = readInteger(query.limit) ?? WORKSPACE_PAGE_DEFAULT_LIMIT
  const offset = readInteger(query.offset) ?? 0

  if (!Number.isInteger(limit) || limit < 1 || limit > WORKSPACE_PAGE_MAX_LIMIT) {
    problems.push(`limit must be a whole number from 1 to ${WORKSPACE_PAGE_MAX_LIMIT}`)
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    problems.push(`offset must be a whole number from 0 to ${MAX_OFFSET}`)
  }

  if (problems.length) return { ok: false, problems }
  return { ok: true, value: { limit, offset } }
}

export type WorkspaceEntityListFilter = { entityType: string | null; search: string | null }

export function validateEntityListFilter(query: Record<string, unknown>): Validated<WorkspaceEntityListFilter> {
  const problems: string[] = []
  const entityType = typeof query.entityType === 'string' && query.entityType ? query.entityType : null
  const search = typeof query.q === 'string' && query.q.trim() ? query.q.trim() : null

  if (entityType !== null && !isAddressSegment(entityType)) problems.push('entityType is malformed')
  if (search !== null && search.length > 120) problems.push('q must be at most 120 characters')

  if (problems.length) return { ok: false, problems }
  return { ok: true, value: { entityType, search } }
}

// ---------------------------------------------------------------------------
// Import sources
// ---------------------------------------------------------------------------

export type WorkspaceImportSource =
  | { kind: 'release'; packageId: string; version: string }
  | { kind: 'provider'; gameSystemKey: string; collectionKey: string; categories: string[] | null }

export type WorkspaceImportRequest = { source: WorkspaceImportSource; dryRun: boolean }

export function validateImportRequest(body: unknown): Validated<WorkspaceImportRequest> {
  if (!isPlainObject(body)) return { ok: false, problems: ['request body must be an object'] }
  const problems: string[] = []
  const dryRun = body.dryRun === true
  const raw = body.source

  if (!isPlainObject(raw)) return { ok: false, problems: ['source is required'] }

  if (raw.kind === 'release') {
    if (!isPackageId(raw.packageId)) problems.push('source.packageId is malformed')
    if (typeof raw.version !== 'string' || !VERSION_PATTERN.test(raw.version)) problems.push('source.version is malformed')
    if (problems.length) return { ok: false, problems }
    return { ok: true, value: { dryRun, source: { kind: 'release', packageId: raw.packageId as string, version: raw.version as string } } }
  }

  if (raw.kind === 'provider') {
    if (!isAddressSegment(raw.gameSystemKey)) problems.push('source.gameSystemKey is malformed')
    if (!isAddressSegment(raw.collectionKey)) problems.push('source.collectionKey is malformed')

    let categories: string[] | null = null
    if (raw.categories !== undefined && raw.categories !== null) {
      if (!Array.isArray(raw.categories) || !raw.categories.every(isAddressSegment) || raw.categories.length === 0) {
        problems.push('source.categories must be a non-empty list of category keys')
      } else {
        categories = [...new Set(raw.categories as string[])]
      }
    }

    if (problems.length) return { ok: false, problems }
    return {
      ok: true,
      value: {
        dryRun,
        source: { kind: 'provider', gameSystemKey: raw.gameSystemKey as string, collectionKey: raw.collectionKey as string, categories }
      }
    }
  }

  return { ok: false, problems: ["source.kind must be 'release' or 'provider'"] }
}

export function validateContentEntityIdParam(value: unknown): Validated<string> {
  return isContentEntityId(value) ? { ok: true, value } : { ok: false, problems: ['contentEntityId is malformed'] }
}

export function validatePackageIdParam(value: unknown): Validated<string> {
  return isPackageId(value) ? { ok: true, value } : { ok: false, problems: ['packageId is malformed'] }
}
