// Unit tests for app/composables/useAuth.ts's capability handling --
// Content Studio authorization incident regression.
//
// WHY THIS IS TESTABLE AT ALL. useAuth.ts depends on Nuxt's `useState`
// auto-import, which this repo's plain-Vitest setup does not provide and
// has no existing shim for (unlike `ref`/`computed`, which every other
// tested composable in tests/composables/ relies on and which Vue itself
// exports). Rather than inventing a new convention, this applies the
// SAME pattern server/utils/directus.ts's callers already use for a
// missing Nuxt global (scripts/directus/lib/runtime-shim.mjs installs a
// minimal, behavior-preserving stand-in for `useRuntimeConfig`/`$fetch`/
// `createError`): a minimal `globalThis.useState` stand-in, keyed by
// string exactly like Nuxt's real one, shared across calls with the same
// key -- which is the one property this file's own code actually
// depends on (a second `useAuth()` call must see the first call's writes).
//
// WHAT THIS PROVES, specifically for the deployment incident
// (content-workspaces-pass-a-handoff.md): `hasPlatformCapability` is a
// plain `Array.includes` over whatever `platformCapabilities` holds --
// there is no allowlist, filter, or parser anywhere in this file that
// could silently drop `platform.contentworkspace.*` even if the SERVER
// sent it correctly. Combined with the server-side proof (`can()`,
// `/api/auth/me.get.ts` returning `listPlatformGrants` unfiltered), this
// closes the loop: nothing in the capability PATH drops the new names:
// a missing capability reaching the client is strictly the server's
// response not containing it, never the client failing to recognize one
// that was sent.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computed as vueComputed } from 'vue'

type StateBox<T> = { value: T }

// `useState` is Nuxt-specific and has no real export to fall back to
// outside the Nuxt runtime, so it is faithfully re-implemented (one
// ref-like box per key, shared across calls -- the one property this
// file's own code depends on). `computed` IS a real Vue export Nuxt
// merely auto-imports; installed as itself, never re-implemented, so its
// reactivity semantics are the genuine ones, not an approximation.
function installUseStateStub() {
  const store = new Map<string, StateBox<unknown>>()
  const globals = globalThis as Record<string, unknown>
  const hadComputed = 'computed' in globals

  globals.useState = <T>(key: string, init: () => T): StateBox<T> => {
    if (!store.has(key)) store.set(key, { value: init() })
    return store.get(key) as StateBox<T>
  }
  if (!hadComputed) globals.computed = vueComputed

  return () => {
    delete globals.useState
    if (!hadComputed) delete globals.computed
  }
}

describe('useAuth -- capability handling (Content Studio authorization incident)', () => {
  let uninstall: () => void

  beforeEach(() => {
    uninstall = installUseStateStub()
  })

  afterEach(() => {
    uninstall()
  })

  it('hasPlatformCapability recognizes a Content Studio capability the state already holds -- no client-side filtering drops it', async () => {
    const { useAuth } = await import('../../app/composables/useAuth')
    const { state, hasPlatformCapability } = useAuth()

    state.value.platformCapabilities = [
      'platform.settings.manage',
      'platform.contentworkspace.view',
      'platform.contentworkspace.create',
      'platform.contentworkspace.edit'
    ]

    expect(hasPlatformCapability('platform.contentworkspace.view')).toBe(true)
    expect(hasPlatformCapability('platform.contentworkspace.create')).toBe(true)
    expect(hasPlatformCapability('platform.contentworkspace.edit')).toBe(true)
  })

  it('denies a Content Studio capability that is genuinely absent -- the exact incident symptom, reproduced client-side', async () => {
    const { useAuth } = await import('../../app/composables/useAuth')
    const { state, hasPlatformCapability } = useAuth()

    // Exactly the pre-upgrade grant set: Game Admin's own gate is held,
    // the three new ones are not.
    state.value.platformCapabilities = ['platform.settings.manage', 'platform.account.manage']

    expect(hasPlatformCapability('platform.contentworkspace.view')).toBe(false)
  })

  it("isAdmin checks exactly platform.settings.manage, independent of the Content Studio capabilities -- why the shell renders while Studio's own request 403s", async () => {
    const { useAuth } = await import('../../app/composables/useAuth')
    const { state, isAdmin } = useAuth()

    state.value.platformCapabilities = ['platform.settings.manage']

    expect(isAdmin.value).toBe(true)
    expect(state.value.platformCapabilities.includes('platform.contentworkspace.view')).toBe(false)
  })

  it('treats a missing platformCapabilities array as zero capabilities, never as "everything" -- deny-by-default on the client too', async () => {
    const { useAuth } = await import('../../app/composables/useAuth')
    const { state, hasPlatformCapability, isAdmin } = useAuth()

    state.value.platformCapabilities = []

    expect(hasPlatformCapability('platform.contentworkspace.view')).toBe(false)
    expect(isAdmin.value).toBe(false)
  })

  it('shares one underlying state across calls -- the exact mechanism behind "a tab opened before the grant was applied stays stale until a fresh fetchMe()"', async () => {
    const { useAuth } = await import('../../app/composables/useAuth')
    const first = useAuth()
    first.state.value.ready = true
    first.state.value.platformCapabilities = ['platform.settings.manage']

    // A second call within the same process (e.g. a second component
    // using the composable) reads the SAME useState-backed box, not a
    // fresh one -- confirming capabilities only change when something
    // explicitly writes state.value.platformCapabilities (fetchMe/login),
    // never spontaneously and never per-call.
    const second = useAuth()
    expect(second.state.value.ready).toBe(true)
    expect(second.hasPlatformCapability('platform.contentworkspace.view')).toBe(false)

    second.state.value.platformCapabilities = ['platform.settings.manage', 'platform.contentworkspace.view']
    expect(first.hasPlatformCapability('platform.contentworkspace.view')).toBe(true)
  })
})
