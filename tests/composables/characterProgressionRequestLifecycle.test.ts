// Unit tests for app/composables/characterProgressionRequestLifecycle.ts --
// D&D 2024 Character Rules Phase 2A.1 UX Correction.
//
// Pure module, nothing to mock. Proves the preview-request lifecycle
// decisions useCharacterProgression.ts delegates to, at the smallest
// testable boundary -- that composable itself calls the Nuxt-auto-imported
// `$fetch` global, which does not exist in this repo's plain-Node Vitest
// environment (vitest.config.ts), so it cannot be exercised directly here.
// See this module's own header for the real browser defect these tests
// guard against.

import { describe, expect, it } from 'vitest'

import {
  applyPreviewFailure,
  applyPreviewSuccess,
  beginPreviewRequest,
  canConfirm,
  initialPreviewRequestState,
  invalidatePendingPreview,
  isStaleRequest
} from '../../app/composables/characterProgressionRequestLifecycle'

type FakePlan = { targetLevel: number; valid: boolean; fingerprint: string }

function fakePlan(overrides: Partial<FakePlan> = {}): FakePlan {
  return { targetLevel: 5, valid: true, fingerprint: 'fp-1', ...overrides }
}

describe('PLAN LIFECYCLE -- the real browser defect', () => {
  // TESTING -- PLAN LIFECYCLE #1: existing plan remains available while a
  // preview request is pending.
  it('beginPreviewRequest never clears an existing plan -- only marks pending', () => {
    const existing = fakePlan()
    const state = { plan: existing, planPending: false, latestRequestId: 3 }

    const { nextState } = beginPreviewRequest(state)

    expect(nextState.plan).toBe(existing) // the SAME plan object, untouched
    expect(nextState.planPending).toBe(true)
  })

  it('beginPreviewRequest issues a strictly increasing request id', () => {
    const state = initialPreviewRequestState<FakePlan>()
    const first = beginPreviewRequest(state)
    const second = beginPreviewRequest(first.nextState)
    expect(second.requestId).toBeGreaterThan(first.requestId)
  })

  // TESTING -- PLAN LIFECYCLE #2: successful preview atomically replaces
  // the plan.
  it('applyPreviewSuccess replaces the plan and clears pending, for the latest request', () => {
    const begun = beginPreviewRequest({ plan: fakePlan({ targetLevel: 5 }), planPending: false, latestRequestId: 0 })
    const newPlan = fakePlan({ targetLevel: 6 })

    const applied = applyPreviewSuccess(begun.nextState, begun.requestId, newPlan)

    expect(applied.plan).toBe(newPlan)
    expect(applied.planPending).toBe(false)
  })

  // TESTING -- PLAN LIFECYCLE #3: a failed preview preserves the previous
  // plan.
  it('applyPreviewFailure leaves the existing plan untouched, only clearing pending', () => {
    const existing = fakePlan()
    const begun = beginPreviewRequest({ plan: existing, planPending: false, latestRequestId: 0 })

    const applied = applyPreviewFailure(begun.nextState, begun.requestId)

    expect(applied.plan).toBe(existing)
    expect(applied.planPending).toBe(false)
  })

  it('a plan that has never loaded stays null through a failed first preview -- there is nothing to preserve', () => {
    const begun = beginPreviewRequest(initialPreviewRequestState<FakePlan>())
    const applied = applyPreviewFailure(begun.nextState, begun.requestId)
    expect(applied.plan).toBeNull()
  })
})

describe('STALE-REQUEST SAFETY', () => {
  // TESTING -- PLAN LIFECYCLE #5: a stale older preview cannot overwrite a
  // newer result.
  it('an earlier request\'s success is discarded once a newer request has been issued', () => {
    const state0 = initialPreviewRequestState<FakePlan>()
    const requestA = beginPreviewRequest(state0) // requestId 1
    const requestB = beginPreviewRequest(requestA.nextState) // requestId 2, now the latest

    // Request A's response arrives AFTER request B was issued.
    const afterA = applyPreviewSuccess(requestB.nextState, requestA.requestId, fakePlan({ targetLevel: 999 }))

    // A's stale result changed NOTHING -- state is byte-identical to
    // requestB's own nextState (still planPending: true, still B's plan).
    expect(afterA).toEqual(requestB.nextState)
    expect(afterA.plan).not.toEqual(fakePlan({ targetLevel: 999 }))
  })

  it('an earlier request\'s FAILURE is also discarded once a newer request has been issued -- never clears pending for the newer one', () => {
    const state0 = initialPreviewRequestState<FakePlan>()
    const requestA = beginPreviewRequest(state0)
    const requestB = beginPreviewRequest(requestA.nextState)

    const afterAFails = applyPreviewFailure(requestB.nextState, requestA.requestId)

    // B is still genuinely in flight -- A's failure must not report "not
    // pending" on B's behalf.
    expect(afterAFails.planPending).toBe(true)
  })

  it('the newer request\'s own success DOES apply, after the older one is discarded', () => {
    const state0 = initialPreviewRequestState<FakePlan>()
    const requestA = beginPreviewRequest(state0)
    const requestB = beginPreviewRequest(requestA.nextState)

    const afterAFails = applyPreviewFailure(requestB.nextState, requestA.requestId)
    const bPlan = fakePlan({ targetLevel: 42 })
    const afterBSucceeds = applyPreviewSuccess(afterAFails, requestB.requestId, bPlan)

    expect(afterBSucceeds.plan).toBe(bPlan)
    expect(afterBSucceeds.planPending).toBe(false)
  })

  it('isStaleRequest correctly identifies which of two overlapping requests is stale', () => {
    const state0 = initialPreviewRequestState<FakePlan>()
    const requestA = beginPreviewRequest(state0)
    const requestB = beginPreviewRequest(requestA.nextState)

    expect(isStaleRequest(requestB.nextState, requestA.requestId)).toBe(true)
    expect(isStaleRequest(requestB.nextState, requestB.requestId)).toBe(false)
  })
})

describe('invalidatePendingPreview -- Confirm/Cancel must not be resurrected by a late preview response', () => {
  it('a preview response arriving after invalidation is treated as stale', () => {
    const begun = beginPreviewRequest(initialPreviewRequestState<FakePlan>())
    const invalidated = invalidatePendingPreview(begun.nextState)

    expect(isStaleRequest(invalidated, begun.requestId)).toBe(true)

    const applied = applyPreviewSuccess(invalidated, begun.requestId, fakePlan({ targetLevel: 999 }))
    expect(applied).toEqual(invalidated) // unchanged -- the late response never applied
  })
})

describe('canConfirm', () => {
  // TESTING -- PLAN LIFECYCLE #4: Confirm is unavailable while a preview
  // request is pending.
  it('is false while a preview is pending, even with a valid plan', () => {
    expect(canConfirm(fakePlan({ valid: true }), false, true)).toBe(false)
  })

  it('is false while confirming is already in progress', () => {
    expect(canConfirm(fakePlan({ valid: true }), true, false)).toBe(false)
  })

  it('is false with no plan at all', () => {
    expect(canConfirm(null, false, false)).toBe(false)
  })

  it('is false with an invalid (unresolved-choices) plan', () => {
    expect(canConfirm(fakePlan({ valid: false }), false, false)).toBe(false)
  })

  it('is true with a valid plan and no request pending', () => {
    expect(canConfirm(fakePlan({ valid: true }), false, false)).toBe(true)
  })
})
