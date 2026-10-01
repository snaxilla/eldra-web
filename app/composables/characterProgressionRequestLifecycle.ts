// D&D 2024 Character Rules Phase 2A.1 UX Correction -- a pure, Vue-free
// description of useCharacterProgression.ts's own preview-request
// lifecycle decisions, extracted so they are directly unit-testable.
//
// This repo's Vitest environment (vitest.config.ts) is plain Node, with no
// Nuxt runtime -- `useCharacterProgression.ts` calls the Nuxt-auto-imported
// `$fetch` global, which does not exist outside a real Nuxt app/dev-server
// context, so that composable cannot be exercised directly here. Every
// DECISION that matters for the real browser defects this phase closes --
// whether to clear an existing plan before a new request, whether a
// response/failure may still update state, whether Confirm should be
// available -- is extracted into this plain module instead, mirroring the
// same "pure helpers beside an untestable boundary" pattern this codebase
// already uses for Vue components with no render harness (see
// app/components/characters/characterProgressionChoicePresentation.ts,
// app/components/characters/builder/characterBuilderSelection.ts).
// `useCharacterProgression.ts` calls these functions directly rather than
// re-implementing the same decisions inline, so there is exactly one
// place this logic lives and is proven correct.
//
// ---------------------------------------------------------------------------
// THE REAL DEFECT THIS REPLACES
// ---------------------------------------------------------------------------
// `previewPlan` used to set `plan.value = null` unconditionally before
// every request -- including the automatic re-preview `setAnswer` issues
// after EVERY answered choice -- which made the entire rendered plan
// disappear (CharacterProgressionPanel.vue's own `v-if="plan"`) for the
// duration of every single re-preview, and, as a direct side effect, also
// transiently cleared that plan's own `fingerprint`, which was wiping this
// panel's non-distinct slot drafts on every answer (a second, dependent
// defect -- see CharacterProgressionPanel.vue's own reconciliation header).
// `beginPreviewRequest` below never clears an existing plan; only a real
// response (`applyPreviewSuccess`) replaces it.

export type PreviewRequestState<TPlan> = {
  plan: TPlan | null
  planPending: boolean
  // A plain, strictly-increasing counter -- the smallest generic
  // "latest request wins" primitive (this phase's own explicit
  // instruction against "a large request-management framework"). Every
  // issued request captures its own value at issue time; a response may
  // only apply if that captured value still matches this field, meaning
  // no NEWER request has been issued since.
  latestRequestId: number
}

export function initialPreviewRequestState<TPlan>(): PreviewRequestState<TPlan> {
  return { plan: null, planPending: false, latestRequestId: 0 }
}

// Starting a new preview request. NEVER clears an existing plan
// preemptively -- the one-line fix for the real browser defect this file's
// own header describes. Returns the state to apply immediately (pending,
// a freshly issued request id) alongside that request's own id, which the
// caller must thread through to whichever of `applyPreviewSuccess`/
// `applyPreviewFailure` it calls once the request settles.
export function beginPreviewRequest<TPlan>(
  state: PreviewRequestState<TPlan>
): { nextState: PreviewRequestState<TPlan>; requestId: number } {
  const requestId = state.latestRequestId + 1
  return {
    nextState: { ...state, planPending: true, latestRequestId: requestId },
    requestId
  }
}

// `true` exactly when a NEWER request has been issued since `requestId`
// was captured -- the response/failure belonging to `requestId` must then
// be discarded entirely, never applied to state.
export function isStaleRequest<TPlan>(state: PreviewRequestState<TPlan>, requestId: number): boolean {
  return requestId !== state.latestRequestId
}

// A successful response atomically replaces the plan -- but only if this
// is still the latest request; a stale (superseded) success is discarded,
// including never touching `planPending` (a genuinely newer request may
// still be in flight).
export function applyPreviewSuccess<TPlan>(
  state: PreviewRequestState<TPlan>,
  requestId: number,
  plan: TPlan
): PreviewRequestState<TPlan> {
  if (isStaleRequest(state, requestId)) return state
  return { ...state, plan, planPending: false }
}

// A FAILED preview never blanks the plan -- the last valid plan (if any)
// stays exactly as it was, so the user can still see what they were
// editing when the request failed. Same staleness guard as success.
export function applyPreviewFailure<TPlan>(
  state: PreviewRequestState<TPlan>,
  requestId: number
): PreviewRequestState<TPlan> {
  if (isStaleRequest(state, requestId)) return state
  return { ...state, planPending: false }
}

// Invalidates any in-flight request without issuing a new one -- used by
// Confirm and Cancel/clearPlan, both of which are about to replace
// `plan`/`answers` wholesale and must never let a stale preview response
// arriving afterward resurrect what they just cleared.
export function invalidatePendingPreview<TPlan>(state: PreviewRequestState<TPlan>): PreviewRequestState<TPlan> {
  return { ...state, latestRequestId: state.latestRequestId + 1 }
}

// Confirm's own authoritative availability rule -- the SAME predicate the
// panel's own disabled button and this composable's own `confirm()` guard
// must agree on: a plan must exist, be valid, and no request (a preview
// OR a confirm already in flight) may currently be pending.
export function canConfirm<TPlan extends { valid: boolean }>(
  plan: TPlan | null,
  confirming: boolean,
  planPending: boolean
): boolean {
  return Boolean(plan) && plan!.valid && !confirming && !planPending
}
