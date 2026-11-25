// "Show Background" -- World Background Defaults pass. Pure decision
// logic extracted from world-workspace.vue so it is directly
// unit-testable without a DOM-mounting harness (this repo has none --
// see resolveWorldWorkspacePageKey.ts for the established precedent of
// extracting exactly this kind of route/state decision out of the
// layout for that reason).

// Only offered when there is a resolved background image actually
// showing AND the current page is not one of the specialized surfaces
// this pass explicitly keeps untouched: the full-bleed World Map (draws
// its own scene, never this backdrop) and the Character Sheet (keeps
// its own independent, already-tuned atmosphere -- the owner's explicit
// instruction for this pass).
const EXCLUDED_PAGE_KEYS = new Set(['character-sheet'])

export function canOfferShowBackground(hasPageBackdrop: boolean, pageKey: string): boolean {
  return Boolean(hasPageBackdrop) && !EXCLUDED_PAGE_KEYS.has(String(pageKey || ''))
}

// Escape restores content, but never while something else (a modal, the
// mobile nav drawer, the Media Gallery picker) is already claiming it --
// "will not conflict with an active dialog." `hasOpenDialog` is the
// caller's own generic check (e.g. a `[role="dialog"]` element existing,
// or the mobile drawer's own open state); kept as a plain boolean
// parameter here so this stays a pure decision with no DOM query of its
// own to fake out in a test.
export function shouldRestoreOnEscape(key: string, hasOpenDialog: boolean): boolean {
  return key === 'Escape' && !hasOpenDialog
}
