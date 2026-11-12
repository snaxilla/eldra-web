// Workspace import planning -- Content Workspaces & Studio, Phase 3
// (content-workspaces-and-studio.md §16.3). Pure: given what a source
// offers and what a workspace already holds, decide what an import would
// do. No I/O; the server executes the plan.
//
// Matching is by DECLARED identity only: a `contentEntityId` the source
// already carries, or the exact source address a previous import of the
// same lineage recorded. A matching title is never consulted, and a
// matching slug from a DIFFERENT source is reported as a conflict, never
// merged.

import {
  intraPackIdentityKey,
  isAddressSegment,
  isContentEntityId,
  type BaseSourceRef,
  type LegacyBaseRef
} from '../content-identity'

// Longest key a unique key column accepts (see the schema spec).
export const MAX_WORKSPACE_KEY_LENGTH = 900

export type ImportSourceLineage =
  | { kind: 'release'; packageId: string }
  | { kind: 'provider'; gameSystemKey: string; collectionKey: string }

export function sourceLineageKey(lineage: ImportSourceLineage): string {
  return lineage.kind === 'release'
    ? `release:${lineage.packageId}`
    : `provider:${lineage.gameSystemKey}/${lineage.collectionKey}`
}

// Identifies one upstream entry within one source lineage. Version-free
// on purpose: importing a newer release of the same package must land on
// the entity the older release created.
export function sourceEntryKey(lineage: ImportSourceLineage, systemKey: string, entityType: string, slug: string): string {
  return `${sourceLineageKey(lineage)}::${intraPackIdentityKey(systemKey, entityType, slug)}`
}

export type IncomingEntry = {
  systemKey: string
  entityType: string
  slug: string
  title: string
  externalId: string
  // Present only when the source entry already carries a canonical id.
  contentEntityId?: string
  // Evidence the source entry itself published.
  carriedBaseRefs?: readonly LegacyBaseRef[]
  carriedSlugAliases?: readonly string[]
  baseDataHash: string
  baseSourceRef: BaseSourceRef
  // The legacy address the importer read this entry at, when it was read
  // from a published release. Observed, never inferred.
  observedBaseRef?: LegacyBaseRef
}

export type ExistingEntity = {
  contentEntityId: string
  systemKey: string
  entityType: string
  slug: string
  title: string
  sourceKey: string | null
  baseDataHash: string | null
}

export type UnresolvedReason =
  | 'invalid-candidate'
  | 'malformed-identity'
  | 'system-mismatch'
  | 'duplicate-in-source'
  | 'address-conflict'
  | 'contradictory-provenance'

type EntryLabel = { entityType: string; slug: string; title: string }

export type PlannedAddition = EntryLabel & {
  index: number
  // Null when the id must be minted at execution time.
  contentEntityId: string | null
  sourceKey: string
  baseDataHash: string
}

export type PlannedChange = EntryLabel & {
  index: number
  contentEntityId: string
  previousBaseDataHash: string | null
  incomingBaseDataHash: string
  // True when the source now addresses this entity under another slug.
  // The workspace keeps its own slug either way.
  upstreamSlugChanged: boolean
}

export type ImportPlan = {
  additions: PlannedAddition[]
  unchanged: (EntryLabel & { contentEntityId: string })[]
  changed: PlannedChange[]
  unresolved: (EntryLabel & { reason: UnresolvedReason; detail: string })[]
  // Entities an earlier import of this lineage created that the source no
  // longer offers. Reported only: possibly a removal, possibly a rename.
  // Never deleted and never matched to a new entry by resemblance.
  absentUpstream: (EntryLabel & { contentEntityId: string })[]
}

export type ImportPlanInput = {
  workspace: { systemKey: string }
  lineage: ImportSourceLineage
  incoming: readonly IncomingEntry[]
  existing: readonly ExistingEntity[]
}

function compareLabels(a: EntryLabel, b: EntryLabel): number {
  return a.entityType.localeCompare(b.entityType) || a.slug.localeCompare(b.slug) || a.title.localeCompare(b.title)
}

function label(entry: { entityType: unknown; slug: unknown; title: unknown }): EntryLabel {
  return {
    entityType: typeof entry.entityType === 'string' ? entry.entityType : '',
    slug: typeof entry.slug === 'string' ? entry.slug : '',
    title: typeof entry.title === 'string' ? entry.title : ''
  }
}

export function planWorkspaceImport(input: ImportPlanInput): ImportPlan {
  const plan: ImportPlan = { additions: [], unchanged: [], changed: [], unresolved: [], absentUpstream: [] }
  const { workspace, lineage, incoming, existing } = input

  const existingByCe = new Map(existing.map((entity) => [entity.contentEntityId, entity]))
  const existingBySource = new Map<string, ExistingEntity>()
  const existingByAddress = new Map<string, ExistingEntity>()
  for (const entity of existing) {
    if (entity.sourceKey) existingBySource.set(entity.sourceKey, entity)
    existingByAddress.set(intraPackIdentityKey(entity.systemKey, entity.entityType, entity.slug), entity)
  }

  // Two entries in one source claiming one address or one canonical id
  // cannot both be right, and nothing here can say which is.
  const addressCounts = new Map<string, number>()
  const idCounts = new Map<string, number>()
  for (const entry of incoming) {
    const address = intraPackIdentityKey(entry.systemKey, entry.entityType, entry.slug)
    addressCounts.set(address, (addressCounts.get(address) ?? 0) + 1)
    if (entry.contentEntityId) idCounts.set(entry.contentEntityId, (idCounts.get(entry.contentEntityId) ?? 0) + 1)
  }

  const seenSourceKeys = new Set<string>()
  const coveredEntityTypes = new Set<string>()

  incoming.forEach((entry, index) => {
    const unresolved = (reason: UnresolvedReason, detail: string) => {
      plan.unresolved.push({ ...label(entry), reason, detail })
    }

    if (
      !isAddressSegment(entry.systemKey) || !isAddressSegment(entry.entityType) || !isAddressSegment(entry.slug)
      || typeof entry.title !== 'string' || !entry.title.trim()
      || typeof entry.externalId !== 'string' || !entry.externalId
    ) {
      return unresolved('invalid-candidate', 'The entry is missing a system, type, slug, title, or external id, or one of them is malformed.')
    }

    if (entry.contentEntityId !== undefined && !isContentEntityId(entry.contentEntityId)) {
      return unresolved('malformed-identity', 'The entry carries a content entity id that is not well-formed.')
    }

    if (entry.systemKey !== workspace.systemKey) {
      return unresolved('system-mismatch', `The entry belongs to system '${entry.systemKey}', but this workspace holds '${workspace.systemKey}' content.`)
    }

    const address = intraPackIdentityKey(entry.systemKey, entry.entityType, entry.slug)
    const sourceKey = sourceEntryKey(lineage, entry.systemKey, entry.entityType, entry.slug)

    if (sourceKey.length > MAX_WORKSPACE_KEY_LENGTH) {
      return unresolved('invalid-candidate', 'The entry address is too long to store.')
    }

    coveredEntityTypes.add(entry.entityType)
    seenSourceKeys.add(sourceKey)

    if ((addressCounts.get(address) ?? 0) > 1) {
      return unresolved('duplicate-in-source', `The source offers more than one entry at '${address}'.`)
    }

    if (entry.contentEntityId && (idCounts.get(entry.contentEntityId) ?? 0) > 1) {
      return unresolved('contradictory-provenance', 'The source offers more than one entry carrying the same content entity id.')
    }

    const byId = entry.contentEntityId ? existingByCe.get(entry.contentEntityId) : undefined
    const bySource = existingBySource.get(sourceKey)

    if (byId && bySource && byId !== bySource) {
      return unresolved('contradictory-provenance', 'The carried content entity id and the source address point at two different workspace entities.')
    }

    const match = byId ?? bySource

    if (match) {
      if (entry.contentEntityId && match.contentEntityId !== entry.contentEntityId) {
        return unresolved('contradictory-provenance', 'This source address was imported before under a different content entity id.')
      }

      if (byId && match.sourceKey !== null && sourceLineagePrefix(match.sourceKey) !== sourceLineageKey(lineage)) {
        return unresolved('contradictory-provenance', 'A workspace entity with this content entity id was imported from a different source.')
      }

      if (match.baseDataHash === entry.baseDataHash) {
        plan.unchanged.push({ ...label(match), contentEntityId: match.contentEntityId })
        return
      }

      plan.changed.push({
        ...label(match),
        index,
        contentEntityId: match.contentEntityId,
        previousBaseDataHash: match.baseDataHash,
        incomingBaseDataHash: entry.baseDataHash,
        upstreamSlugChanged: match.slug !== entry.slug
      })
      return
    }

    const occupant = existingByAddress.get(address)
    if (occupant) {
      return unresolved(
        'address-conflict',
        `The workspace already holds '${occupant.title}' at '${address}', which did not come from this source. Matching addresses are not evidence that two entries are the same.`
      )
    }

    plan.additions.push({
      ...label(entry),
      index,
      contentEntityId: entry.contentEntityId ?? null,
      sourceKey,
      baseDataHash: entry.baseDataHash
    })
  })

  const lineagePrefix = sourceLineageKey(lineage)
  for (const entity of existing) {
    if (!entity.sourceKey || sourceLineagePrefix(entity.sourceKey) !== lineagePrefix) continue
    if (!coveredEntityTypes.has(entity.entityType)) continue
    if (seenSourceKeys.has(entity.sourceKey)) continue
    plan.absentUpstream.push({ ...label(entity), contentEntityId: entity.contentEntityId })
  }

  plan.additions.sort(compareLabels)
  plan.unchanged.sort(compareLabels)
  plan.changed.sort(compareLabels)
  plan.unresolved.sort(compareLabels)
  plan.absentUpstream.sort(compareLabels)

  return plan
}

function sourceLineagePrefix(sourceKey: string): string {
  const separator = sourceKey.indexOf('::')
  return separator === -1 ? sourceKey : sourceKey.slice(0, separator)
}

export type ImportPlanCounts = {
  added: number
  unchanged: number
  changedNeedsReview: number
  unresolved: number
  absentUpstream: number
}

export function countImportPlan(plan: ImportPlan): ImportPlanCounts {
  return {
    added: plan.additions.length,
    unchanged: plan.unchanged.length,
    changedNeedsReview: plan.changed.length,
    unresolved: plan.unresolved.length,
    absentUpstream: plan.absentUpstream.length
  }
}
