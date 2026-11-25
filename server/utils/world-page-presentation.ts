// Pure helper behind the presentation-save route's cross-World asset
// check (PAGE BACKGROUND PICKER UX CORRECTION). Picking an EXISTING
// gallery file (rather than only ever uploading a brand-new one, which
// was always created scoped to the saving World by construction) means
// a client can now pass ANY file id, including one belonging to a
// different World -- this is the pure comparison backing that
// server-side check in server/api/worlds/[id]/presentation/[pageKey].post.ts,
// extracted so it is directly unit-testable without a Directus
// dependency (that route keeps its own existing, un-testable
// auto-import style, matching presentation-settings.patch.ts's sibling
// convention, which this task does not change).
export function fileBelongsToWorld(fileWorldId: unknown, worldId: string | number): boolean {
  const owner = Number(fileWorldId)
  const requested = Number(worldId)
  return Number.isFinite(owner) && Number.isFinite(requested) && owner === requested
}

// Mirrors the SAME `image/` prefix check already enforced upstream of
// this save route -- media.get.ts's own Gallery listing filter
// (`type: { _starts_with: 'image/' }`) and media/upload.post.ts's own
// upload-time rejection. Those two gates cover how a file CAN normally
// reach this save route, but neither one validates a direct save
// request itself: a client can submit any existing file id belonging to
// this World, including a non-image one the Gallery would never have
// listed (uploaded before world-scoping existed, or reached via a raw
// API call rather than the picker). This is the missing server-side
// check for exactly that gap -- same prefix rule, now also enforced at
// the one place a background is actually persisted.
export function isSupportedImageType(type: unknown): boolean {
  return typeof type === 'string' && type.startsWith('image/')
}

// Whether the presentation save route needs to look up the submitted
// file at all. Mode-only saves, "Use World Default", "No Background",
// and the legacy "Clear" action all submit no new asset (`backgroundFileId`
// is null/empty), so neither this lookup nor the type/ownership checks
// below it should ever run for them -- named and exported so that
// guarantee is a directly testable fact, not just an inline `if`.
export function needsBackgroundFileLookup(backgroundFileId: string | null): boolean {
  return Boolean(backgroundFileId)
}

export type BackgroundFileValidation =
  | { ok: true }
  | { ok: false; statusCode: number; statusMessage: string }

// The full server-side decision for a newly submitted background file,
// in the SAME order and with the SAME messages the save route already
// used for the ownership half of this (PAGE BACKGROUND PICKER UX
// CORRECTION) -- ownership checked first (a cross-World id is rejected
// without revealing anything about the file's type), then type. Reuses
// `fileBelongsToWorld` rather than duplicating that comparison.
export function validateBackgroundFile(
  file: { id?: unknown; world_id?: unknown; type?: unknown } | null | undefined,
  worldId: string | number
): BackgroundFileValidation {
  if (!file?.id || !fileBelongsToWorld(file.world_id, worldId)) {
    return { ok: false, statusCode: 403, statusMessage: 'That image does not belong to this World.' }
  }

  if (!isSupportedImageType(file.type)) {
    return { ok: false, statusCode: 400, statusMessage: 'That file is not a supported image type.' }
  }

  return { ok: true }
}

// World-Default Background pass. A `world_page_presentations` row, as
// stored (snake_case, whatever Directus hands back -- `background_source`
// is additive and may not exist yet on a pre-migration row, see
// scripts/directus/alter-world-page-presentations-background-source.mjs).
export type PresentationRow = {
  presentation_mode?: string | null
  background_file_id?: string | number | null
  background_source?: string | null
} | null | undefined

export type BackgroundSource = 'override' | 'inherit' | 'none'

// A dedicated `world_page_presentations` row (page_key = 'world-default',
// see resolvePagePresentation below) now holds a World's own default
// background/mode -- reusing this SAME collection and its existing
// authorization/validation path rather than a second background system.
export const WORLD_DEFAULT_PAGE_KEY = 'world-default'

// Pages with their own, independently-tuned backdrop story that a newly
// -set World default must never silently change:
//  - 'character-sheet': a GM who has never set a Character Sheet backdrop
//    sees none today (neutral); the owner's own instruction is to keep
//    that surface's appearance decided only by its OWN explicit setting,
//    never swept in by a World default set for unrelated pages. An
//    explicit override on 'character-sheet' itself still works unchanged.
//  - 'world-map': the full-bleed World Map always renders its own scene
//    instead of this backdrop (world-workspace.vue's `isFullBleedMap`
//    gate) -- this row's resolution is never actually read for rendering,
//    so inheriting here would only be a wasted lookup, not a visible
//    effect either way.
const SPECIALIZED_PAGE_KEYS = new Set(['character-sheet', 'world-map'])

// The page's OWN stored intent, independent of what a World default
// happens to be. Absence of a row (never configured) is a deliberately
// different answer from a row whose `background_file_id` was explicitly
// cleared pre-migration ('none') -- see the migration script's own
// header for why old rows are backfilled to 'override'/'none' rather than
// left to be inferred here.
export function resolveBackgroundSource(item: PresentationRow): BackgroundSource {
  if (!item) return 'inherit'
  if (item.background_file_id) return 'override'
  if (String(item.background_source || '') === 'inherit') return 'inherit'
  return 'none'
}

// What the POST route should ADD to its Directus write body, or `null`
// to leave `background_source` out of that body entirely.
//
// Deliberately narrow: `resolveBackgroundSource` above never needs a
// stored 'override' value (background_file_id truthy already means
// override on its own), so a save that sets/keeps an image, or a plain
// mode toggle, or the pre-existing "Clear" action, writes the exact same
// body it always has -- none of them touch this column. Only the two
// NEW explicit actions ("Use World Default" / "No Background") ever
// write it, which also means every pre-existing save keeps working
// completely unaffected by whether scripts/directus/alter-world-page-
// presentations-background-source.mjs has been run against a given
// Directus instance yet -- only those two new actions depend on it.
export function resolveWriteBackgroundSource(raw: unknown, backgroundFileId: string | null): 'inherit' | 'none' | null {
  if (backgroundFileId) return null
  if (raw === 'inherit' || raw === 'none') return raw
  return null
}

export type ResolvedPagePresentation = {
  presentationMode: string
  backgroundFileId: string | null
  backgroundSource: BackgroundSource
  worldDefaultBackgroundFileId: string | null
  worldDefaultPresentationMode: string
}

// Precedence: an explicit page override wins; otherwise inherit the
// World default; otherwise nothing (today's existing app fallback -- no
// backdrop at all). Pure and Directus-free so the precedence rules
// themselves are directly unit-testable; the route supplies the two raw
// rows (the page's own, and page_key='world-default's) and renders the
// result.
export function resolvePagePresentation(
  pageKey: string,
  item: PresentationRow,
  worldDefaultItem: PresentationRow
): ResolvedPagePresentation {
  // The World-default row itself has nothing above it to inherit from --
  // returned as-is, exactly this route's pre-existing behavior for any
  // page key, so configuring it uses the same read/save path every other
  // page already does.
  if (pageKey === WORLD_DEFAULT_PAGE_KEY) {
    return {
      presentationMode: item?.presentation_mode ? String(item.presentation_mode) : 'neutral',
      backgroundFileId: item?.background_file_id ? String(item.background_file_id) : null,
      backgroundSource: item?.background_file_id ? 'override' : 'none',
      worldDefaultBackgroundFileId: null,
      worldDefaultPresentationMode: 'neutral'
    }
  }

  const ownSource = resolveBackgroundSource(item)
  const backgroundSource: BackgroundSource =
    SPECIALIZED_PAGE_KEYS.has(pageKey) && ownSource === 'inherit' ? 'none' : ownSource

  const worldDefaultBackgroundFileId = worldDefaultItem?.background_file_id
    ? String(worldDefaultItem.background_file_id)
    : null
  const worldDefaultPresentationMode = worldDefaultItem?.presentation_mode
    ? String(worldDefaultItem.presentation_mode)
    : 'neutral'

  if (backgroundSource === 'override') {
    return {
      presentationMode: item?.presentation_mode ? String(item.presentation_mode) : 'neutral',
      backgroundFileId: item?.background_file_id ? String(item.background_file_id) : null,
      backgroundSource,
      worldDefaultBackgroundFileId,
      worldDefaultPresentationMode
    }
  }

  if (backgroundSource === 'inherit') {
    return {
      presentationMode: worldDefaultPresentationMode,
      backgroundFileId: worldDefaultBackgroundFileId,
      backgroundSource,
      worldDefaultBackgroundFileId,
      worldDefaultPresentationMode
    }
  }

  return {
    presentationMode: 'neutral',
    backgroundFileId: null,
    backgroundSource: 'none',
    worldDefaultBackgroundFileId,
    worldDefaultPresentationMode
  }
}

// Whether resolvePagePresentation needs the World-default row at all for
// this page key -- lets the route skip that extra Directus fetch for the
// World-default row itself and for every specialized key (SPECIALIZED_PAGE_KEYS
// above always resolves to 'none'/'override' and never reads it).
export function pagePresentationNeedsWorldDefault(pageKey: string): boolean {
  return pageKey !== WORLD_DEFAULT_PAGE_KEY && !SPECIALIZED_PAGE_KEYS.has(pageKey)
}
