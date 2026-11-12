// Derived unique keys and hashing for Content Workspace rows.
//
// Each key below is stored in a single UNIQUE column (see
// scripts/directus/lib/content-workspace-schema-spec.mjs), which is how
// composite invariants become database guarantees through an API that
// cannot declare a composite constraint. Every key starts with the
// workspace id, so no key can collide across workspaces.

import { createHash } from 'node:crypto'
import { canonicalize } from '../../app/lib/rules/canonicalize'
import { intraPackIdentityKey } from '../../app/lib/content-identity'

export function hashBaseData(data: unknown): string {
  return `sha256-${createHash('sha256').update(canonicalize(data)).digest('hex')}`
}

export function entityIdentityKey(workspaceId: string, contentEntityId: string): string {
  return `${workspaceId}::${contentEntityId}`
}

export function entityAddressKey(workspaceId: string, systemKey: string, entityType: string, slug: string): string {
  return `${workspaceId}::${intraPackIdentityKey(systemKey, entityType, slug)}`
}

// `sourceEntryKey` is app/lib/content-workspaces/import-plan.ts's
// version-free upstream address.
export function entitySourceKey(workspaceId: string, sourceEntryKey: string): string {
  return `${workspaceId}::${sourceEntryKey}`
}

export function unscopedSourceKey(workspaceId: string, storedSourceKey: string | null): string | null {
  if (!storedSourceKey) return null
  const prefix = `${workspaceId}::`
  return storedSourceKey.startsWith(prefix) ? storedSourceKey.slice(prefix.length) : null
}

// Names one base transition for one upstream entry. Content-addressed, so
// retrying an import whose snapshot was already written finds that
// snapshot instead of writing a second one.
export function snapshotKey(
  workspaceId: string,
  sourceEntryKey: string,
  disposition: 'accepted' | 'pending-review',
  previousHash: string | null,
  newHash: string
): string {
  // Hashes rather than the raw source address keep the key bounded.
  const source = createHash('sha256').update(sourceEntryKey).digest('hex')
  return `${workspaceId}::${source}::${disposition}::${previousHash ?? 'none'}::${newHash}`
}
