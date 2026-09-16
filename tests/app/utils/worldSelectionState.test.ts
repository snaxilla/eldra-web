// Unit tests for app/utils/worldSelectionState.ts. Authentication Flow
// Cleanup's own CRITICAL EMPTY-STATE RULE: "No worlds yet" has exactly one
// valid meaning. These tests exist to prove every OTHER combination is
// something else, per this task's own TESTING items 7-10.

import { describe, expect, it } from 'vitest'
import { resolveWorldSelectionState, type WorldSelectionInput } from '../../../app/utils/worldSelectionState'

const BASE: WorldSelectionInput = {
  authReady: true,
  authenticated: true,
  worldsPending: false,
  worldsError: false,
  worldsCount: 0
}

describe('resolveWorldSelectionState -- auth takes priority over everything else', () => {
  it('is "auth-unresolved" whenever authReady is false, regardless of every other field', () => {
    expect(resolveWorldSelectionState({ ...BASE, authReady: false })).toBe('auth-unresolved')
    expect(resolveWorldSelectionState({ ...BASE, authReady: false, authenticated: true, worldsCount: 5 })).toBe('auth-unresolved')
    expect(resolveWorldSelectionState({ ...BASE, authReady: false, worldsError: true })).toBe('auth-unresolved')
  })

  it('is "unauthenticated" once authReady is true but authenticated is false', () => {
    expect(resolveWorldSelectionState({ ...BASE, authenticated: false })).toBe('unauthenticated')
    // Even a (client-stale) non-empty worlds list can't override "signed out."
    expect(resolveWorldSelectionState({ ...BASE, authenticated: false, worldsCount: 3 })).toBe('unauthenticated')
  })
})

describe('resolveWorldSelectionState -- item 7: empty state is impossible while auth is unresolved', () => {
  it('never returns "empty" for any authReady:false input', () => {
    const permutations = [
      { ...BASE, authReady: false, worldsCount: 0 },
      { ...BASE, authReady: false, worldsCount: 0, worldsPending: true },
      { ...BASE, authReady: false, worldsCount: 0, worldsError: true }
    ]
    for (const input of permutations) {
      expect(resolveWorldSelectionState(input)).not.toBe('empty')
    }
  })
})

describe('resolveWorldSelectionState -- item 8: empty state is impossible while world loading is pending', () => {
  it('is "loading" when authenticated and pending, even with a zero count already cached', () => {
    expect(resolveWorldSelectionState({ ...BASE, worldsPending: true, worldsCount: 0 })).toBe('loading')
  })

  it('pending takes priority over a stale/incoming error flag', () => {
    expect(resolveWorldSelectionState({ ...BASE, worldsPending: true, worldsError: true })).toBe('loading')
  })
})

describe('resolveWorldSelectionState -- item 9: empty state is impossible after a world-load error', () => {
  it('is "error" when authenticated, not pending, and the request failed -- not "empty"', () => {
    expect(resolveWorldSelectionState({ ...BASE, worldsError: true, worldsCount: 0 })).toBe('error')
  })
})

describe('resolveWorldSelectionState -- item 10: a genuine authenticated zero-world result renders the intended empty state', () => {
  it('is "empty" only once auth is ready+authenticated, loading has finished, and there is no error', () => {
    expect(resolveWorldSelectionState({ ...BASE, worldsCount: 0 })).toBe('empty')
  })
})

describe('resolveWorldSelectionState -- populated', () => {
  it('is "populated" once every prior state is ruled out and the count is positive', () => {
    expect(resolveWorldSelectionState({ ...BASE, worldsCount: 1 })).toBe('populated')
    expect(resolveWorldSelectionState({ ...BASE, worldsCount: 12 })).toBe('populated')
  })
})
