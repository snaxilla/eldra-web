// Package lineage ownership -- the single-writer registry.
// Design: .github/docs/architecture/content-workspaces-and-studio.md §11.
//
//   Once a Content Workspace adopts a package lineage, that workspace is
//   its sole publisher.
//
// `content_package_lineages` is authoritative, and `package_id` is UNIQUE
// in the database, so a lineage has at most one row and therefore at most
// one owner at any instant. `checkLineagePublication` is the question
// every publisher asks; content-packs.ts asks it at the one function that
// writes a release, so no publication path can skip it.
//
// WHAT IS A DATABASE GUARANTEE AND WHAT IS NOT
//   Guaranteed by the unique constraint: two workspaces cannot both hold
//   a lineage, and adopting a lineage that has no row is an INSERT, so of
//   two simultaneous adopters exactly one succeeds.
//   Not guaranteed: a legacy publish that read "unadopted" a moment
//   before an adoption committed can still insert its release. The
//   Directus REST API offers no transaction spanning the two collections.
//   Adopt a lineage while no publish or packages:sync run is in flight.
//
// Persistence only. No HTTP, no capability checks, no revisions.

import type { PackageLineage, PackageLineageStatus } from '../../app/lib/content-workspaces/types'
import { directusServiceRequest } from './directus'
import { isDirectusForbidden, isDirectusUniqueViolation, withWorkspaceSchema } from './content-workspace-schema'

const COLLECTION = 'content_package_lineages'
const LINEAGE_FIELDS = 'id,package_id,owner_workspace_id,status,supersedes,adopted_at,adopted_by_account_id,created_at,updated_at'

function normalizeStatus(value: unknown): PackageLineageStatus {
  return value === 'adopted' || value === 'frozen' ? value : 'unadopted'
}

type DirectusRow = Record<string, unknown>
type DirectusResponse = { data?: unknown }

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : String(value)
}

function normalizeLineage(row: DirectusRow): PackageLineage {
  return {
    id: text(row.id),
    packageId: text(row.package_id),
    ownerWorkspaceId: optionalText(row.owner_workspace_id),
    status: normalizeStatus(row.status),
    supersedes: Array.isArray(row.supersedes)
      ? row.supersedes.filter((value: unknown): value is string => typeof value === 'string')
      : [],
    adoptedAt: optionalText(row.adopted_at),
    adoptedByAccountId: optionalText(row.adopted_by_account_id),
    createdAt: optionalText(row.created_at),
    updatedAt: optionalText(row.updated_at)
  }
}

async function readLineageRow(packageId: string): Promise<PackageLineage | null> {
  const res = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: { filter: { package_id: { _eq: packageId } }, limit: 1, fields: LINEAGE_FIELDS }
  }) as DirectusResponse
  const row = Array.isArray(res?.data) ? (res.data[0] as DirectusRow | undefined) : null
  return row ? normalizeLineage(row) : null
}

export async function findPackageLineage(packageId: string): Promise<PackageLineage | null> {
  return await withWorkspaceSchema(COLLECTION, () => readLineageRow(packageId))
}

export async function listPackageLineages(): Promise<PackageLineage[]> {
  return await withWorkspaceSchema(COLLECTION, async () => {
    const res = await directusServiceRequest(`/items/${COLLECTION}`, {
      method: 'GET',
      query: { sort: ['package_id'], limit: -1, fields: LINEAGE_FIELDS }
    }) as DirectusResponse
    return Array.isArray(res?.data) ? (res.data as DirectusRow[]).map(normalizeLineage) : []
  })
}

// ---------------------------------------------------------------------------
// The publication guard
// ---------------------------------------------------------------------------

// Who is asking to publish. Every publisher that exists today is
// `legacy`; a workspace publisher arrives with workspace publication.
export type LineagePublisher = { kind: 'legacy' } | { kind: 'workspace'; workspaceId: string }

export type LineagePublicationRefusal = {
  allowed: false
  packageId: string
  lineageStatus: PackageLineageStatus
  ownerWorkspaceId: string | null
  message: string
}

export type LineagePublicationDecision = { allowed: true } | LineagePublicationRefusal

function refusalMessage(lineage: PackageLineage): string {
  if (lineage.status === 'frozen') {
    return `Package lineage '${lineage.packageId}' is frozen. Nothing may publish to it.`
  }

  const owner = lineage.ownerWorkspaceId ? `Content Workspace ${lineage.ownerWorkspaceId}` : 'a Content Workspace'
  return `Package lineage '${lineage.packageId}' is owned by ${owner}, which is now its only publisher. `
    + 'Direct publishing, Refresh Content Package, and packages:sync are refused for an adopted lineage so two publishers can never release to it. '
    + 'Nothing was published and nothing was imported into the workspace. '
    + 'Publishing from a workspace is not available yet; to publish this lineage directly again, release it from its workspace first '
    + '(Game Admin > Content Studio > Workspaces > Release lineage).'
}

// Whether the lineage collection exists. Directus answers 403 for a
// missing collection, which is indistinguishable from 403 for a
// forbidden one on /items; /collections/<name> separates them for a
// token that can read schema.
async function lineageCollectionExists(): Promise<boolean> {
  try {
    await directusServiceRequest(`/collections/${COLLECTION}`, { method: 'GET' })
    return true
  } catch (error) {
    if (isDirectusForbidden(error)) return false
    throw error
  }
}

// May `publisher` publish a release under `packageId` right now?
//
// Fails CLOSED: if the registry exists but cannot be read, this throws
// rather than allowing a publish it could not check. The one case read as
// "allowed" without a row is a registry that does not exist at all --
// before the schema is provisioned nothing can have been adopted, and
// existing publishing must keep working.
export async function checkLineagePublication(
  packageId: string,
  publisher: LineagePublisher = { kind: 'legacy' }
): Promise<LineagePublicationDecision> {
  let lineage: PackageLineage | null
  try {
    lineage = await readLineageRow(packageId)
  } catch (error) {
    if (!isDirectusForbidden(error)) throw error
    if (await lineageCollectionExists()) {
      throw new Error(
        `Cannot verify who may publish '${packageId}': the package lineage registry exists but the service token cannot read it. Publication is refused until it can be read.`
      )
    }
    return { allowed: true }
  }

  if (!lineage) return { allowed: true }
  if (lineage.status === 'unadopted' && !lineage.ownerWorkspaceId) return { allowed: true }

  if (
    lineage.status === 'adopted'
    && publisher.kind === 'workspace'
    && lineage.ownerWorkspaceId === publisher.workspaceId
  ) {
    return { allowed: true }
  }

  return {
    allowed: false,
    packageId,
    lineageStatus: lineage.status,
    ownerWorkspaceId: lineage.ownerWorkspaceId,
    message: refusalMessage(lineage)
  }
}

// ---------------------------------------------------------------------------
// Ownership changes
// ---------------------------------------------------------------------------

export type AdoptLineageResult =
  | { ok: true; lineage: PackageLineage; changed: boolean }
  | { ok: false; stage: 'owned-by-other'; ownerWorkspaceId: string | null }
  | { ok: false; stage: 'frozen' }

export async function adoptPackageLineage(input: {
  packageId: string
  workspaceId: string
  accountId: string | null
}): Promise<AdoptLineageResult> {
  return await withWorkspaceSchema(COLLECTION, async () => {
    const now = new Date().toISOString()
    const existing = await readLineageRow(input.packageId)

    if (!existing) {
      try {
        const res = await directusServiceRequest(`/items/${COLLECTION}`, {
          method: 'POST',
          body: {
            package_id: input.packageId,
            owner_workspace_id: input.workspaceId,
            status: 'adopted',
            supersedes: [],
            adopted_at: now,
            adopted_by_account_id: input.accountId,
            created_at: now,
            updated_at: now
          }
        })
        return { ok: true, lineage: normalizeLineage(((res as DirectusResponse)?.data as DirectusRow) ?? {}), changed: true }
      } catch (error) {
        // Someone else inserted the row first. The constraint decided
        // the winner; read who it was.
        if (!isDirectusUniqueViolation(error)) throw error
        return describeExistingOwnership(await readLineageRow(input.packageId), input.workspaceId)
      }
    }

    if (existing.ownerWorkspaceId || existing.status !== 'unadopted') {
      return describeExistingOwnership(existing, input.workspaceId)
    }

    // An unowned row already exists. Claiming it is read-then-write, so
    // the owner is read back rather than assumed.
    await directusServiceRequest(`/items/${COLLECTION}/${existing.id}`, {
      method: 'PATCH',
      body: {
        owner_workspace_id: input.workspaceId,
        status: 'adopted',
        adopted_at: now,
        adopted_by_account_id: input.accountId,
        updated_at: now
      }
    })

    const claimed = await readLineageRow(input.packageId)
    if (claimed?.ownerWorkspaceId === input.workspaceId && claimed.status === 'adopted') {
      return { ok: true, lineage: claimed, changed: true }
    }
    return describeExistingOwnership(claimed, input.workspaceId)
  })
}

function describeExistingOwnership(lineage: PackageLineage | null, workspaceId: string): AdoptLineageResult {
  if (!lineage) return { ok: false, stage: 'owned-by-other', ownerWorkspaceId: null }
  if (lineage.status === 'frozen') return { ok: false, stage: 'frozen' }
  if (lineage.status === 'adopted' && lineage.ownerWorkspaceId === workspaceId) {
    return { ok: true, lineage, changed: false }
  }
  return { ok: false, stage: 'owned-by-other', ownerWorkspaceId: lineage.ownerWorkspaceId }
}

export type TransferLineageResult =
  | { ok: true; lineage: PackageLineage; previousOwnerWorkspaceId: string }
  | { ok: false; stage: 'not-adopted' }
  | { ok: false; stage: 'frozen' }
  | { ok: false; stage: 'unchanged' }
  | { ok: false; stage: 'conflict'; ownerWorkspaceId: string | null }

// Moves an adopted lineage to another workspace. Read-then-write: the
// result is confirmed by reading the row back, and a different owner
// found there is reported rather than overwritten again.
export async function transferPackageLineage(input: {
  packageId: string
  toWorkspaceId: string
  accountId: string | null
}): Promise<TransferLineageResult> {
  return await withWorkspaceSchema(COLLECTION, async () => {
    const existing = await readLineageRow(input.packageId)
    if (!existing || !existing.ownerWorkspaceId || existing.status === 'unadopted') return { ok: false, stage: 'not-adopted' }
    if (existing.status === 'frozen') return { ok: false, stage: 'frozen' }
    if (existing.ownerWorkspaceId === input.toWorkspaceId) return { ok: false, stage: 'unchanged' }

    const now = new Date().toISOString()
    await directusServiceRequest(`/items/${COLLECTION}/${existing.id}`, {
      method: 'PATCH',
      body: {
        owner_workspace_id: input.toWorkspaceId,
        adopted_at: now,
        adopted_by_account_id: input.accountId,
        updated_at: now
      }
    })

    const after = await readLineageRow(input.packageId)
    if (after?.ownerWorkspaceId !== input.toWorkspaceId) {
      return { ok: false, stage: 'conflict', ownerWorkspaceId: after?.ownerWorkspaceId ?? null }
    }
    return { ok: true, lineage: after, previousOwnerWorkspaceId: existing.ownerWorkspaceId }
  })
}

export type ReleaseLineageResult =
  | { ok: true; previousOwnerWorkspaceId: string }
  | { ok: false; stage: 'not-adopted' }
  | { ok: false; stage: 'frozen' }

// Un-adopt: the documented escape hatch that re-enables direct
// publishing for a lineage. The row is deleted rather than blanked so
// that the next adoption is an INSERT the unique constraint arbitrates.
// The ownership history lives in content_entity_revisions, not here.
export async function releasePackageLineage(packageId: string): Promise<ReleaseLineageResult> {
  return await withWorkspaceSchema(COLLECTION, async () => {
    const existing = await readLineageRow(packageId)
    if (!existing || !existing.ownerWorkspaceId || existing.status === 'unadopted') return { ok: false, stage: 'not-adopted' }
    if (existing.status === 'frozen') return { ok: false, stage: 'frozen' }

    if (existing.supersedes.length) {
      // The row carries declared supersedes relations that must survive.
      await directusServiceRequest(`/items/${COLLECTION}/${existing.id}`, {
        method: 'PATCH',
        body: {
          owner_workspace_id: null,
          status: 'unadopted',
          adopted_at: null,
          adopted_by_account_id: null,
          updated_at: new Date().toISOString()
        }
      })
    } else {
      await directusServiceRequest(`/items/${COLLECTION}/${existing.id}`, { method: 'DELETE' })
    }
    return { ok: true, previousOwnerWorkspaceId: existing.ownerWorkspaceId }
  })
}
