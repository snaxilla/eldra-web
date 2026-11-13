// Workspace sources -- Content Workspaces & Studio Phase 6
// (content-workspaces-and-studio.md §10.1). Materializes a live Content
// Workspace into the same candidate shape pinned pack entries already
// have, so world-effective-content.ts's grouping/precedence/materialize
// steps never need a branch for "this candidate came from a workspace" --
// except for `presentation`, which IS pre-resolved here (see
// WorkspaceSourceEntry's own note) because resolving it needs a World
// context world-effective-content.ts's generic materialize step does not
// otherwise have reason to carry per candidate.
//
// CACHING. Keyed by `${workspaceId}::${worldId}` (never workspace alone):
// an authored image is resolved against a SPECIFIC World's gallery
// (server/utils/content-presentation-assets.ts), so the same workspace
// live-bound into two different Worlds can legitimately resolve two
// different answers for the identical image field -- caching by
// workspace alone would leak one World's resolved asset into another's
// response. Invalidated by comparing the cached entry's `revision`
// against `content_workspaces.revision`'s current value -- the
// collision-safe counter §10.1 asks for, not an updated_at timestamp.
//
// PERFORMANCE. One bounded, paginated entity fetch
// (listAllWorkspaceEntityDetails) plus ONE batched `/files` lookup for
// every distinct referenced image, never N+1 Directus calls for N
// entities with an authored image.

import { directusServiceRequest } from './directus'
import { getContentWorkspace } from './content-workspaces'
import { listAllWorkspaceEntityDetails, type WorkspaceEntityDetail } from './content-workspace-entities'
import { resolveBasePresentation } from './content-workspace-presentation'
import { buildSparseObject } from '../../app/lib/content-authoring/overrides'
import { mergeAuthoredPresentation, type AuthoredPresentation, type PortableAssetRef, type ResolvedImage } from '../../app/lib/content-presentation/authored'
import type { PresentationEntry } from '../../app/lib/content-presentation/types'
import type { LegacyBaseRef } from '../../app/lib/content-identity'
import type { RulesFacet } from '../../app/lib/content-rules'

// Deliberately NOT `WorldContentEntry` -- a workspace entity is not a
// published ContentPublicationCandidate (no externalId guarantee, no
// rulesFacet today, a `state` a release entry never carries). Shaped to
// supply exactly what world-effective-content.ts's EffectiveCandidate
// needs: the identity fields `evidenceKeys` reads, plus `presentation`
// PRE-RESOLVED (authored overlay merged, image already World-scoped) --
// world-effective-content.ts's materialize step uses this verbatim for a
// workspace winner instead of recomputing from `data`, which is correct
// ONLY because it is never populated for a pinned/channel candidate
// (undefined there, exactly preserving the no-op theorem).
export type WorkspaceSourceEntry = {
  systemKey: string
  entityType: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
  data: unknown
  rulesFacet?: RulesFacet
  contentEntityId?: string
  baseRefs?: LegacyBaseRef[]
  slugAliases?: string[]
  // Relayed verbatim, exactly like a published candidate's own envelope
  // fields -- see world-effective-content.ts's EffectiveEntity note.
  parentClassSlug?: string
  definitionId?: string
  packageId: string
  packageVersion: string
  state: 'active' | 'disabled'
  presentation: PresentationEntry | null
  // Which presentation paths carry an authored override right now (e.g.
  // `['name', 'image']`) -- distinct from `presentation` itself, which is
  // already the MERGED (inherited + overridden) result and therefore
  // cannot say which individual fields were actually touched.
  // world-effective-content.ts relays this into
  // EffectiveEntity.customization.authoredFields, and
  // catalogue-entity-bridge.ts uses it specifically to tell "the author
  // explicitly suppressed the image" apart from "no authored opinion on
  // the image, fall back to whatever the source provides."
  authoredPresentationPaths: string[]
}

export type LoadWorkspaceAsSourceResult =
  | { ok: true; workspaceTitle: string; entries: WorkspaceSourceEntry[] }
  | { ok: false; failure: { reason: 'workspace-not-found'; message: string } }

type CachedSource = { revision: number; workspaceTitle: string; entries: WorkspaceSourceEntry[] }
const sourceCache = new Map<string, CachedSource>()

export function clearWorkspaceSourceCache(): void {
  sourceCache.clear()
}

function cacheKey(workspaceId: string, worldId: string): string {
  return `${workspaceId}::${worldId}`
}

function rawPayloadOf(entity: WorkspaceEntityDetail): Record<string, unknown> {
  const source = entity.origin === 'authored' ? entity.authoredData : entity.baseData
  return (source && typeof source === 'object' ? source : {}) as Record<string, unknown>
}

async function batchResolveMediaWorldIds(fileIds: readonly string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  const unique = [...new Set(fileIds)]
  if (!unique.length) return result

  const res = (await directusServiceRequest('/files', {
    method: 'GET',
    query: { filter: { id: { _in: unique } }, limit: -1, fields: 'id,world_id' }
  })) as { data?: { id?: unknown; world_id?: unknown }[] }

  for (const row of res?.data ?? []) {
    if (row?.id) result.set(String(row.id), row.world_id === null || row.world_id === undefined ? null : String(row.world_id))
  }
  return result
}

// Never broadens access: a media ref resolves ONLY when its file's own
// world_id equals the World being resolved for, right now -- not the
// World the workspace happened to be seeded from, and not any other
// World the same workspace might also be bound into.
function resolveWorkspaceImage(
  sparse: AuthoredPresentation,
  fileWorldIds: ReadonlyMap<string, string | null>,
  worldId: string
): ResolvedImage | null {
  if (!Object.prototype.hasOwnProperty.call(sparse, 'image')) return null
  const ref = sparse.image as PortableAssetRef | null
  if (ref === null) return { image: null }
  if (ref.kind !== 'media') return { image: null }
  if (fileWorldIds.get(ref.fileId) !== worldId) return { image: null }
  return { image: { url: `/api/assets/${ref.fileId}` } }
}

export async function loadWorkspaceAsSource(workspaceId: string, worldId: string): Promise<LoadWorkspaceAsSourceResult> {
  const workspace = await getContentWorkspace(workspaceId)
  if (!workspace) {
    return {
      ok: false,
      failure: { reason: 'workspace-not-found', message: `Content Workspace '${workspaceId}' does not exist (it may have been archived or deleted).` }
    }
  }

  const cached = sourceCache.get(cacheKey(workspaceId, worldId))
  if (cached && cached.revision === workspace.revision) {
    return { ok: true, workspaceTitle: cached.workspaceTitle, entries: cached.entries }
  }

  const entities = await listAllWorkspaceEntityDetails(workspaceId)

  const sparseByEntity = entities.map((entity) => buildSparseObject(entity.authoredPresentation, 'presentation') as AuthoredPresentation)
  const mediaFileIds = sparseByEntity
    .map((sparse) => (sparse.image && sparse.image.kind === 'media' ? sparse.image.fileId : null))
    .filter((id): id is string => id !== null)
  const fileWorldIds = await batchResolveMediaWorldIds(mediaFileIds)

  const entries: WorkspaceSourceEntry[] = entities.map((entity, index) => {
    const raw = rawPayloadOf(entity)
    const sparse = sparseByEntity[index] as AuthoredPresentation
    const basePresentation = resolveBasePresentation(entity)
    const resolvedImage = resolveWorkspaceImage(sparse, fileWorldIds, worldId)
    const presentation = mergeAuthoredPresentation(basePresentation, sparse, resolvedImage)

    return {
      systemKey: entity.systemKey,
      entityType: entity.entityType,
      title: entity.title,
      slug: entity.slug,
      externalId: typeof raw.externalId === 'string' ? raw.externalId : entity.contentEntityId,
      provider: typeof raw.provider === 'string' ? raw.provider : 'workspace',
      sourceBook: typeof raw.sourceBook === 'string' ? raw.sourceBook : undefined,
      sourcePage: typeof raw.sourcePage === 'string' ? raw.sourcePage : undefined,
      data: (raw as { data?: unknown }).data ?? raw,
      rulesFacet: raw.rulesFacet as RulesFacet | undefined,
      parentClassSlug: typeof raw.parentClassSlug === 'string' ? raw.parentClassSlug : undefined,
      definitionId: typeof raw.definitionId === 'string' ? raw.definitionId : undefined,
      contentEntityId: entity.contentEntityId,
      baseRefs: entity.baseRefs,
      slugAliases: entity.slugAliases,
      packageId: `workspace.${workspaceId}`,
      packageVersion: 'live',
      state: entity.state,
      presentation,
      authoredPresentationPaths: entity.authoredPresentation.map((override) => override.path)
    }
  })

  sourceCache.set(cacheKey(workspaceId, worldId), { revision: workspace.revision, workspaceTitle: workspace.title, entries })
  return { ok: true, workspaceTitle: workspace.title, entries }
}
