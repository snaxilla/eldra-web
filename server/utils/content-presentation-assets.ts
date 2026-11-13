// Resolves an authored PortableAssetRef (app/lib/content-presentation/
// authored.ts) to a renderable PresentationImage -- Content Workspaces &
// Studio, Phase 4/6. Impure: this is the one place that looks up a
// Directus file to decide whether it may be shown, which is why
// mergeAuthoredPresentation itself stays pure and never does this lookup.
//
// Content Workspaces are platform-scoped, but Media Gallery files are
// World-scoped (Phase 0's fix: directus_files.world_id). A workspace
// bound live into a World it was not uploaded through must not silently
// gain access to that World's files, and a live-bound workspace used in
// a SECOND World must not leak the first World's private assets either --
// so resolution always re-checks the file's world_id against the World
// context the caller is resolving FOR, every time, never cached across
// Worlds.
//
// Only `kind: 'media'` is resolvable today -- Content Studio's editor
// only ever writes that kind (it reuses the existing Media Gallery picker
// unchanged, per §12.4). `pack`/`dataset`/`external` are Phase 8
// concerns (portable release assets) and resolve to "unavailable" here
// rather than guessing at a URL this phase has no authority to serve.

import { directusServiceRequest } from './directus'
import type { PortableAssetRef, ResolvedImage } from '../../app/lib/content-presentation/authored'

type DirectusFileRow = { id?: unknown; width?: unknown; height?: unknown; world_id?: unknown }

export type ResolvedImageWithDiagnostics = ResolvedImage & {
  // true when the author expressed an opinion (a concrete ref) but it
  // could not be resolved -- missing file, or a World-scope mismatch.
  // Never surfaced as a broken <img>; surfaced to an admin as a reason.
  unavailable: boolean
  unavailableReason?: 'not-found' | 'world-scope-mismatch' | 'unsupported-kind'
}

async function loadFile(fileId: string): Promise<DirectusFileRow | null> {
  try {
    const res = (await directusServiceRequest(`/files/${fileId}`, {
      method: 'GET',
      query: { fields: 'id,width,height,world_id' }
    })) as { data?: DirectusFileRow }
    return res?.data ?? null
  } catch {
    return null
  }
}

// `worldId: null` means "no World context" (e.g. a platform-only preview
// with no binding yet) -- a media ref can never resolve without a World
// to scope it against, so this always reports unavailable rather than
// guessing at "any World will do."
export async function resolvePortableAssetRef(
  ref: PortableAssetRef | null | undefined,
  worldId: string | null
): Promise<ResolvedImageWithDiagnostics> {
  if (ref === null) return { image: null, unavailable: false } // explicit author suppression
  if (ref === undefined) return { image: null, unavailable: false } // caller should not call this when absent; safe no-op either way

  if (ref.kind !== 'media') {
    return { image: null, unavailable: true, unavailableReason: 'unsupported-kind' }
  }

  if (!worldId) {
    return { image: null, unavailable: true, unavailableReason: 'world-scope-mismatch' }
  }

  const file = await loadFile(ref.fileId)
  if (!file || !file.id) {
    return { image: null, unavailable: true, unavailableReason: 'not-found' }
  }

  if (String(file.world_id ?? '') !== String(worldId)) {
    // Never broaden access: a workspace used in a World it was not
    // uploaded for does not get to see another World's private asset.
    return { image: null, unavailable: true, unavailableReason: 'world-scope-mismatch' }
  }

  return {
    image: {
      url: `/api/assets/${String(file.id)}`,
      width: typeof file.width === 'number' ? file.width : undefined,
      height: typeof file.height === 'number' ? file.height : undefined
    },
    unavailable: false
  }
}
