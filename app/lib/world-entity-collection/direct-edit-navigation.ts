// Quick Edit Rail <-> Full-Page Editor navigation helpers -- Direct
// Content Editing, Quick Edit + Full-Page pass. Pure; no I/O, no Vue, no
// router access, so these are unit-testable without a DOM/browser
// harness (this repo has neither) and so both call sites (the collection
// page, the full-page editor) can be asserted to agree on the exact same
// rules rather than drifting into two silently different ones.
//
// DRAFT TRANSFER. Opening the full editor from Quick Edit must carry the
// caller's unsaved name/image changes across a real page navigation
// without a silent save, a silent discard, or putting draft text/
// payloads in the URL. sessionStorage is the simplest reliable mechanism
// already available for this (survives the SPA navigation within the
// same tab; never sent over the network; cleared on tab close) -- see
// readDraftTransfer/writeDraftTransfer/clearDraftTransfer. The payload
// deliberately carries ONLY what Quick Edit itself can ever make dirty
// (name, image) plus the identity needed to confirm it belongs to the
// exact entity/World/scope the full page just loaded -- never a
// `revision` the full page is expected to TRUST (see
// StudioEntityEditor.vue's own `seedDraft` prop for why: the full page's
// OWN fresh load is always the real revision of record).

export type DraftTransferPayload = {
  worldId: string
  entityType: string
  slug: string
  name: string
  nameDirty: boolean
  image: { fileId: string; url: string } | null | undefined
  imageDirty: boolean
}

export const DIRECT_EDIT_DRAFT_TRANSFER_KEY = 'eldra:direct-edit-draft-transfer'

export function writeDraftTransfer(storage: Storage, payload: DraftTransferPayload): void {
  storage.setItem(DIRECT_EDIT_DRAFT_TRANSFER_KEY, JSON.stringify(payload))
}

// Reads AND clears in one step -- a transfer payload is single-use by
// construction, so there is never a stale leftover to misapply on some
// later, unrelated visit to the same entity.
export function consumeDraftTransfer(
  storage: Storage,
  identity: { worldId: string; entityType: string; slug: string }
): DraftTransferPayload | null {
  const raw = storage.getItem(DIRECT_EDIT_DRAFT_TRANSFER_KEY)
  if (!raw) return null
  storage.removeItem(DIRECT_EDIT_DRAFT_TRANSFER_KEY)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const payload = parsed as Partial<DraftTransferPayload>

  // Belongs to the exact entity/World this full page actually loaded --
  // never applied to a different one, even if left behind by a since-
  // abandoned navigation.
  if (
    String(payload.worldId || '') !== String(identity.worldId) ||
    String(payload.entityType || '') !== String(identity.entityType) ||
    String(payload.slug || '') !== String(identity.slug)
  ) {
    return null
  }

  return {
    worldId: String(payload.worldId),
    entityType: String(payload.entityType),
    slug: String(payload.slug),
    name: typeof payload.name === 'string' ? payload.name : '',
    nameDirty: Boolean(payload.nameDirty),
    image: payload.image,
    imageDirty: Boolean(payload.imageDirty)
  }
}

// A "return to the collection" path must be an internal, same-World
// navigation -- never an open redirect. Rejects anything that isn't a
// plain relative path (no `//`, no `://`, no backslashes a browser might
// still treat as a scheme/host separator) under this exact World's own
// `/worlds/:id/` prefix.
export function isSafeCollectionReturnPath(path: unknown, worldId: string | number): boolean {
  if (typeof path !== 'string' || !path) return false
  if (!path.startsWith('/') || path.startsWith('//')) return false
  if (path.includes('://') || path.includes('\\')) return false
  return path === `/worlds/${worldId}` || path.startsWith(`/worlds/${worldId}/`) || path.startsWith(`/worlds/${worldId}?`)
}
