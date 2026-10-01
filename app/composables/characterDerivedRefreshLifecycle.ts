// Character Derived Refresh Lifecycle -- D&D 2024 Character Rules Phase
// 2A.2 hotfix (real browser defect, Bob the Barbarian).
//
// A pure, Vue-free description of useCharacterSheet.ts's own
// derived-character refresh lifecycle decisions, extracted so they are
// directly unit-testable -- the IDENTICAL "pure helpers beside an
// untestable boundary" pattern characterProgressionRequestLifecycle.ts
// already established (that file's own header explains why: this repo's
// Vitest environment has no Nuxt runtime, so `useFetch`/`useCharacterSheet`
// cannot be exercised directly here, but every DECISION that matters can
// be).
//
// ---------------------------------------------------------------------------
// THE REAL DEFECT THIS REPLACES
// ---------------------------------------------------------------------------
// `useCharacterSheet.ts`'s `derived` computed used to read DIRECTLY off
// Nuxt's own raw `useFetch` response (`derivedResponse.value?.available ?
// ... : null`). Nuxt's `useAsyncData`/`useFetch` (confirmed by direct
// read of the installed node_modules/nuxt/dist/app/composables/asyncData.js,
// not assumed) resets that response's own `data` to its default
// (`undefined`) on a genuine fetch ERROR, and the server itself reports
// `{available: false, ...}` (not an HTTP error) for several legitimate
// transient conditions. Either way, the SAME `derived` computed every
// Abilities/Skills/reference region reads went null the instant ANY
// refresh (not just the first load) hit either case -- and separately,
// every template gate that showed "Evaluating this character..." used the
// RAW `pending` flag from that same `useFetch` call, which Nuxt also
// flips `true` on every `.refresh()`, not only the first load. Together:
// clicking a Resource orb (or any other mutation that calls
// `sheet.refreshDerived()`) made the Abilities column disappear and get
// replaced by the initial-loading placeholder, even though a perfectly
// valid derived character was already being displayed a moment before.
//
// ---------------------------------------------------------------------------
// THE FIX, IN ONE SENTENCE
// ---------------------------------------------------------------------------
// The last-known-GOOD derived character is tracked in its OWN state,
// separate from Nuxt's raw response, and is REPLACED only by a new
// success -- never cleared by a pending refresh and never cleared by a
// failure -- mirroring `characterProgressionRequestLifecycle.ts`'s own
// `applyPreviewFailure` ("leaves the existing plan untouched") one layer
// over, for the identical reason.

export type DerivedRefreshState<TDerived> = {
  // The last successfully derived character, or null if none has EVER
  // loaded (the one state the INITIAL LOAD placeholder is for). Never
  // cleared by a pending refresh or a failed one.
  current: TDerived | null
  // The most recent failure's message, if the LAST attempt failed -- kept
  // alongside `current` (not instead of it) so a caller can show both "the
  // last valid state" and "something just went wrong" at once. Cleared on
  // the next success.
  error: string
}

export function initialDerivedRefreshState<TDerived>(
  seed: TDerived | null
): DerivedRefreshState<TDerived> {
  return { current: seed, error: '' }
}

// A successful response REPLACES `current` and clears any previous error
// -- the ordinary, happy-path transition.
export function applyDerivedRefreshSuccess<TDerived>(
  _state: DerivedRefreshState<TDerived>,
  derived: TDerived
): DerivedRefreshState<TDerived> {
  return { current: derived, error: '' }
}

// A failed or server-reported-unavailable response NEVER clears `current`
// -- only `error` changes. This is the one-line fix for the real defect
// this file's own header describes: whatever was correctly showing a
// moment ago keeps showing.
export function applyDerivedRefreshFailure<TDerived>(
  state: DerivedRefreshState<TDerived>,
  message: string
): DerivedRefreshState<TDerived> {
  return { current: state.current, error: message }
}

// True ONLY before any successful load has ever completed -- the genuine
// "nothing to show yet" state the INITIAL LOAD placeholder exists for.
// False during every ordinary REFRESH (a mutation re-evaluating an already-
// rendered character), regardless of Nuxt's own raw `pending` flag, which
// flips true on every refresh indiscriminately -- callers that want a
// "still saving/recalculating" hint for that case should use the raw
// `pending` flag directly (e.g. folded into an existing saving indicator),
// never this one, which answers a different question ("do I have anything
// to render at all").
export function isDerivedInitialLoading<TDerived>(
  state: DerivedRefreshState<TDerived>,
  pending: boolean
): boolean {
  return pending && state.current === null
}

// The error worth surfacing as a VISIBLE banner (as opposed to via the
// existing "this character has nothing to derive yet" unavailable-message
// branch, which already correctly handles the `current === null` case on
// its own). Only non-empty when a refresh failed WHILE valid stale data is
// still being shown -- exactly the "keep the last valid derived character
// visible AND surface the error" requirement, never the true initial-load
// failure (which has its own, already-correct, message path).
export function derivedRefreshBannerError<TDerived>(state: DerivedRefreshState<TDerived>): string {
  return state.current !== null ? state.error : ''
}
