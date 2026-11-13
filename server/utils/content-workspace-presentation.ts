// Presentation preview for the Content Studio editor -- Content
// Workspaces & Studio Phase 4. Composes the pure resolver/merge layer
// with the one impure step (resolving an authored image ref against a
// World's gallery) so the editor can show "what this will look like"
// without the catalogue needing to consume authored_presentation yet
// (that is Phase 5/6 -- this entity is still "inert" per the architecture
// doc's own Phase 4 framing).

import { resolveContentPresentation, type PresentationEntry } from '../../app/lib/content-presentation'
import { buildSparseObject } from '../../app/lib/content-authoring/overrides'
import { mergeAuthoredPresentation, type AuthoredPresentation, type PortableAssetRef, type ResolvedImage } from '../../app/lib/content-presentation/authored'
import { presentationKindForEntityType } from '../../app/lib/content-presentation/kind-for-entity-type'
import { resolvePortableAssetRef } from './content-presentation-assets'
import { hashBaseData } from './content-workspace-keys'
import type { WorkspaceEntityDetail } from './content-workspace-entities'

export type EntityPresentationPreview = {
  basePresentation: PresentationEntry | null
  effectivePresentation: PresentationEntry | null
  imageUnavailable: boolean
  imageUnavailableReason?: 'not-found' | 'world-scope-mismatch' | 'unsupported-kind'
}

function rawPayloadOf(entity: WorkspaceEntityDetail): unknown {
  const source = entity.origin === 'authored' ? entity.authoredData : entity.baseData
  if (!source || typeof source !== 'object') return null
  // base_data/authored_data are stored as a ContentPublicationCandidate --
  // the opaque provider payload is its own `.data` field (content-pack-
  // publishing.ts's own shape; see content-workspace-import.ts's writer).
  return (source as { data?: unknown }).data ?? null
}

// `tags`/`attribution` are authored-only concepts with no source-resolved
// counterpart, so they always hash to null -- there is nothing upstream
// to reconcile an authored tag against (Phase 10 is still deferred, but
// the hash recorded now is what makes it sound later, per §16.1).
const PRESENTATION_FIELDS_WITH_BASE_VALUE = ['name', 'description', 'sections', 'notes', 'facts', 'sourceBook', 'sourcePage', 'image'] as const

export function computePresentationBaseValueHash(basePresentation: PresentationEntry | null, path: string): string | null {
  if (!PRESENTATION_FIELDS_WITH_BASE_VALUE.includes(path as typeof PRESENTATION_FIELDS_WITH_BASE_VALUE[number])) return null
  if (!basePresentation) return hashBaseData(null)
  const value = (basePresentation as unknown as Record<string, unknown>)[path]
  return hashBaseData(value === undefined ? null : value)
}

// The source-resolved presentation alone, with no authored overlay and no
// image resolution -- synchronous and side-effect-free, so the PATCH route
// can compute a FieldOverride.baseValueHash without an extra Directus
// round trip for the image lookup it does not need.
export function resolveBasePresentation(entity: WorkspaceEntityDetail): PresentationEntry | null {
  const kind = presentationKindForEntityType(entity.entityType)
  return kind ? resolveContentPresentation(entity.systemKey, kind, rawPayloadOf(entity)) : null
}

export async function previewEntityPresentation(
  entity: WorkspaceEntityDetail,
  context: { worldId: string | null }
): Promise<EntityPresentationPreview> {
  const basePresentation = resolveBasePresentation(entity)

  const sparse = buildSparseObject(entity.authoredPresentation, 'presentation') as AuthoredPresentation

  let imageUnavailable = false
  let imageUnavailableReason: EntityPresentationPreview['imageUnavailableReason']
  let resolvedImage: ResolvedImage | null = null

  if (Object.prototype.hasOwnProperty.call(sparse, 'image')) {
    const resolved = await resolvePortableAssetRef(sparse.image as PortableAssetRef | null, context.worldId)
    resolvedImage = { image: resolved.image }
    imageUnavailable = resolved.unavailable
    imageUnavailableReason = resolved.unavailableReason
  }

  const effectivePresentation = mergeAuthoredPresentation(basePresentation, sparse, resolvedImage)

  return { basePresentation, effectivePresentation, imageUnavailable, imageUnavailableReason }
}
