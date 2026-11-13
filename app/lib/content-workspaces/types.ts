// Content Workspace domain shapes -- Content Workspaces & Studio, Phases
// 1/3 (content-workspaces-and-studio.md §5/§6). Types only; shared by the
// server store, the routes, and the Studio UI.

import type { BaseSourceRef, LegacyBaseRef } from '../content-identity'

export type ContentWorkspaceStatus = 'active' | 'archived'

export type ContentWorkspace = {
  id: string
  workspaceKey: string
  title: string
  description: string | null
  systemKey: string
  sourceGameSystemKey: string | null
  sourceCollectionKey: string | null
  status: ContentWorkspaceStatus
  ownerAccountId: string | null
  // Monotonic, incremented whenever any entity in this workspace is
  // written (server/utils/content-workspace-entities.ts's
  // touchWorkspaceRevision). The collision-safe live-binding cache
  // witness Phase 6 uses instead of updated_at (content-workspaces-and-
  // studio.md §10.1's own warning: two saves in the same millisecond
  // would otherwise produce the same timestamp-derived cache key).
  revision: number
  createdAt: string | null
  updatedAt: string | null
}

export type WorkspaceEntityOrigin = 'authored' | 'imported' | 'derived'
export type WorkspaceEntityState = 'active' | 'disabled'

// Everything about an entity except its payloads. `base_data` and the
// override channels are deliberately absent: no Pass A surface reads or
// writes them through a generic shape.
export type WorkspaceEntitySummary = {
  id: string
  workspaceId: string
  contentEntityId: string
  systemKey: string
  entityType: string
  slug: string
  title: string
  origin: WorkspaceEntityOrigin
  state: WorkspaceEntityState
  baseDataHash: string | null
  baseSourceRef: BaseSourceRef | null
  baseMissing: boolean
  baseRefs: LegacyBaseRef[]
  slugAliases: string[]
  createdAt: string | null
  updatedAt: string | null
}

export type SourceSnapshotDisposition = 'accepted' | 'pending-review'

// Snapshot metadata. The stored payloads are not part of this shape.
export type SourceSnapshotSummary = {
  id: string
  workspaceId: string
  contentEntityId: string
  disposition: SourceSnapshotDisposition
  previousBaseDataHash: string | null
  previousSourceRef: BaseSourceRef | null
  newBaseDataHash: string
  newSourceRef: BaseSourceRef
  reconciliation: unknown
  at: string | null
  actorAccountId: string | null
}

export type WorkspaceRevisionKind =
  | 'autosave'
  | 'checkpoint'
  | 'publish'
  | 'revert'
  | 'disable'
  | 'adopt'
  | 'slug-change'

export type WorkspaceRevision = {
  id: string
  workspaceId: string
  contentEntityId: string | null
  kind: WorkspaceRevisionKind
  label: string | null
  actorAccountId: string | null
  at: string | null
  diff: unknown
}

export type PackageLineageStatus = 'unadopted' | 'adopted' | 'frozen'

export type PackageLineage = {
  id: string
  packageId: string
  ownerWorkspaceId: string | null
  status: PackageLineageStatus
  supersedes: string[]
  adoptedAt: string | null
  adoptedByAccountId: string | null
  createdAt: string | null
  updatedAt: string | null
}
