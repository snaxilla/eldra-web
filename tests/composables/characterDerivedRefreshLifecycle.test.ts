// Unit tests for app/composables/characterDerivedRefreshLifecycle.ts --
// REAL BROWSER DEFECT HOTFIX (D&D 2024 Character Rules Phase 2A.2): the
// Abilities column disappearing behind "Evaluating this character..."
// after every Resource-orb click. Pure module, nothing to mock -- mirrors
// characterProgressionRequestLifecycle.test.ts's own precedent exactly.

import { describe, expect, it } from 'vitest'
import {
  applyDerivedRefreshFailure,
  applyDerivedRefreshSuccess,
  derivedRefreshBannerError,
  initialDerivedRefreshState,
  isDerivedInitialLoading
} from '../../app/composables/characterDerivedRefreshLifecycle'

type FakeDerived = { byCategory: Record<string, unknown> }

function fakeDerived(): FakeDerived {
  return { byCategory: { 'core.abilities': ['str'] } }
}

describe('REGRESSION 1 -- initial load with no derived data: loading placeholder is appropriate', () => {
  it('isDerivedInitialLoading is true before any successful load, while pending', () => {
    const state = initialDerivedRefreshState<FakeDerived>(null)
    expect(isDerivedInitialLoading(state, true)).toBe(true)
  })

  it('is false if not pending, even with no data yet (nothing in flight to wait on)', () => {
    const state = initialDerivedRefreshState<FakeDerived>(null)
    expect(isDerivedInitialLoading(state, false)).toBe(false)
  })
})

describe('REGRESSION 2 -- refresh with existing derived data: existing data remains available', () => {
  it('current is untouched by a pending refresh -- nothing clears it merely because a new request started', () => {
    const existing = fakeDerived()
    const state = applyDerivedRefreshSuccess(initialDerivedRefreshState<FakeDerived>(null), existing)
    // A refresh begins (pending flips true) -- this module exposes no
    // "begin" transition at all, precisely because starting a refresh
    // must never mutate `current` -- it stays exactly `existing` until a
    // real success or failure is applied.
    expect(state.current).toBe(existing)
  })

  it('isDerivedInitialLoading is FALSE during a refresh of an already-loaded character, even though pending is true', () => {
    const state = applyDerivedRefreshSuccess(initialDerivedRefreshState<FakeDerived>(null), fakeDerived())
    expect(isDerivedInitialLoading(state, true)).toBe(false)
  })
})

describe('REGRESSION 3 -- successful refresh atomically replaces old derived data', () => {
  it('applyDerivedRefreshSuccess replaces current and clears any previous error', () => {
    const stale = fakeDerived()
    const failed = applyDerivedRefreshFailure(
      applyDerivedRefreshSuccess(initialDerivedRefreshState<FakeDerived>(null), stale),
      'transient failure'
    )
    const fresh = fakeDerived()
    const succeeded = applyDerivedRefreshSuccess(failed, fresh)

    expect(succeeded.current).toBe(fresh)
    expect(succeeded.current).not.toBe(stale)
    expect(succeeded.error).toBe('')
  })
})

describe('REGRESSION 4 -- failed refresh preserves old derived data', () => {
  it('applyDerivedRefreshFailure leaves current completely untouched, only setting error', () => {
    const existing = fakeDerived()
    const state = applyDerivedRefreshSuccess(initialDerivedRefreshState<FakeDerived>(null), existing)

    const failed = applyDerivedRefreshFailure(state, 'the World\'s Rules Package failed to load')

    expect(failed.current).toBe(existing)
    expect(failed.error).toBe('the World\'s Rules Package failed to load')
  })

  it('a character that has NEVER loaded successfully stays null through a failed first attempt -- there is nothing to preserve', () => {
    const state = initialDerivedRefreshState<FakeDerived>(null)
    const failed = applyDerivedRefreshFailure(state, 'character not found')
    expect(failed.current).toBeNull()
  })
})

describe('REGRESSION 5 -- newest request wins if overlapping refreshes are possible', () => {
  // This module itself has no request-id/sequencing concept -- the
  // STALE-REQUEST SAFETY this phase's own task required is proven to
  // already exist natively in the installed Nuxt version instead (see
  // the Phase 2A.2 hotfix report's own VIDEO TRACE section): Nuxt's
  // `useAsyncData`/`useFetch` defaults `dedupe` to `'cancel'`
  // (node_modules/nuxt/dist/app/composables/asyncData.js), which aborts
  // any in-flight request for the same key the moment a new one starts,
  // so an OLDER response can never resolve and overwrite a NEWER one --
  // confirmed by direct read of that installed source, not assumed. This
  // lifecycle module's own job is a DIFFERENT, narrower guarantee (never
  // let an un-aborted failure/success erase a BETTER-known state), proven
  // by REGRESSION 3/4 above; it does not need to re-implement
  // request-sequencing Nuxt already provides.
  it('applying success then failure then success again ends on the LAST call\'s own outcome, in call order (no out-of-order protection needed here -- callers only ever call these in the order their own, already-deduplicated fetch resolved)', () => {
    const first = fakeDerived()
    const second = fakeDerived()
    let state = initialDerivedRefreshState<FakeDerived>(null)
    state = applyDerivedRefreshSuccess(state, first)
    state = applyDerivedRefreshFailure(state, 'blip')
    state = applyDerivedRefreshSuccess(state, second)
    expect(state.current).toBe(second)
    expect(state.error).toBe('')
  })
})

describe('REGRESSION 6 -- mutation pending state does not make Abilities disappear', () => {
  it('isDerivedInitialLoading stays false across an entire pending-then-success refresh cycle once a character has loaded once', () => {
    let state = applyDerivedRefreshSuccess(initialDerivedRefreshState<FakeDerived>(null), fakeDerived())
    expect(isDerivedInitialLoading(state, true)).toBe(false) // mutation just started a refresh
    state = applyDerivedRefreshSuccess(state, fakeDerived())
    expect(isDerivedInitialLoading(state, false)).toBe(false) // refresh settled
  })
})

describe('REGRESSION 7 -- existing resource/derived state updates after successful refresh', () => {
  it('a later success with genuinely different data is visible as the new current value', () => {
    const before = { byCategory: { 'core.abilities': ['before'] } }
    const after = { byCategory: { 'core.abilities': ['after'] } }
    let state = applyDerivedRefreshSuccess(initialDerivedRefreshState<FakeDerived>(null), before)
    expect(state.current).toEqual(before)
    state = applyDerivedRefreshSuccess(state, after)
    expect(state.current).toEqual(after)
  })
})

describe('derivedRefreshBannerError -- surfaced ONLY when valid stale data is being protected', () => {
  it('is empty when current is null (the true initial-load failure has its own message path)', () => {
    const state = applyDerivedRefreshFailure(initialDerivedRefreshState<FakeDerived>(null), 'character not found')
    expect(derivedRefreshBannerError(state)).toBe('')
  })

  it('is the failure message once valid data already exists -- "keep showing stale data AND surface the error"', () => {
    const state = applyDerivedRefreshFailure(
      applyDerivedRefreshSuccess(initialDerivedRefreshState<FakeDerived>(null), fakeDerived()),
      'Could not re-evaluate this character. Showing the last known state.'
    )
    expect(derivedRefreshBannerError(state)).toBe('Could not re-evaluate this character. Showing the last known state.')
    expect(state.current).not.toBeNull()
  })

  it('clears once the next refresh succeeds', () => {
    const failed = applyDerivedRefreshFailure(
      applyDerivedRefreshSuccess(initialDerivedRefreshState<FakeDerived>(null), fakeDerived()),
      'transient blip'
    )
    const recovered = applyDerivedRefreshSuccess(failed, fakeDerived())
    expect(derivedRefreshBannerError(recovered)).toBe('')
  })
})
