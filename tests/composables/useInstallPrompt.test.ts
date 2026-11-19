// Unit tests for app/composables/useInstallPrompt.ts -- Installable Web
// App. This file has no DOM/beforeinstallprompt environment to run in
// (vitest.config.ts is `environment: 'node'`), so these tests cover the
// two things that are genuinely verifiable without one:
//   1. The pure detection functions (isIOSSafariUserAgent/isStandaloneLaunch),
//      with explicit string/boolean arguments instead of reaching into a
//      real navigator/window.
//   2. The composable's own state-transition logic (canPrompt's
//      derivation, promptInstall's one-shot-consumption and
//      accepted/dismissed outcomes), by seeding its useState-backed refs
//      directly through the SAME minimal useState stub
//      tests/composables/useAuth.test.ts established for exactly this
//      situation (a Nuxt auto-import with no real export to fall back to
//      outside the Nuxt runtime).
// What is NOT covered here, and cannot be without a real browser: that
// `beforeinstallprompt`/`appinstalled` actually fire and get wired up,
// or that the rendered AppInstallMenu.vue button visually appears/
// disappears correctly -- see this task's own Final Report for that gap.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed as vueComputed } from 'vue'
import { isIOSSafariUserAgent, isStandaloneLaunch } from '../../app/composables/useInstallPrompt'

type StateBox<T> = { value: T }

function installUseStateStub() {
  const store = new Map<string, StateBox<unknown>>()
  const globals = globalThis as Record<string, unknown>
  const hadComputed = 'computed' in globals

  globals.useState = <T>(key: string, init: () => T): StateBox<T> => {
    if (!store.has(key)) store.set(key, { value: init() })
    return store.get(key) as StateBox<T>
  }
  if (!hadComputed) globals.computed = vueComputed

  return {
    store,
    uninstall: () => {
      delete globals.useState
      if (!hadComputed) delete globals.computed
    }
  }
}

describe('isIOSSafariUserAgent', () => {
  it('true for real iPhone Safari', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    expect(isIOSSafariUserAgent(ua, 0)).toBe(true)
  })

  it('true for iPadOS 13+ Safari, which identifies as "Macintosh" with multi-touch', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
    expect(isIOSSafariUserAgent(ua, 5)).toBe(true)
  })

  it('false for a real desktop Mac Safari -- same "Macintosh" UA, but no multi-touch', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
    expect(isIOSSafariUserAgent(ua, 0)).toBe(false)
  })

  it('false for Chrome on iOS (CriOS) -- embeds Safari\'s engine but is not Safari, and has no Add to Home Screen flow of its own', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1'
    expect(isIOSSafariUserAgent(ua, 0)).toBe(false)
  })

  it('false for Firefox/Edge on iOS for the same reason', () => {
    expect(isIOSSafariUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/123.0 Mobile/15E148 Safari/605.1.15', 0)).toBe(false)
    expect(isIOSSafariUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/123.0 Mobile/15E148 Safari/605.1.15', 0)).toBe(false)
  })

  it('false for Android Chrome', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
    expect(isIOSSafariUserAgent(ua, 5)).toBe(false)
  })

  it('false for an empty/missing user agent', () => {
    expect(isIOSSafariUserAgent('', 0)).toBe(false)
    expect(isIOSSafariUserAgent(undefined as unknown as string, 0)).toBe(false)
  })
})

describe('isStandaloneLaunch', () => {
  it('true when the display-mode media query matches', () => {
    expect(isStandaloneLaunch(true, undefined)).toBe(true)
  })

  it('true when only the older iOS navigator.standalone flag is set', () => {
    expect(isStandaloneLaunch(false, true)).toBe(true)
  })

  it('false when neither signal says standalone', () => {
    expect(isStandaloneLaunch(false, false)).toBe(false)
    expect(isStandaloneLaunch(false, undefined)).toBe(false)
  })

  it('iOS\'s own flag being explicitly false does not override a true media-query match', () => {
    expect(isStandaloneLaunch(true, false)).toBe(true)
  })
})

describe('useInstallPrompt -- state-transition logic (via the useState stub)', () => {
  let stub: ReturnType<typeof installUseStateStub>

  beforeEach(() => {
    stub = installUseStateStub()
  })

  afterEach(() => {
    stub.uninstall()
  })

  it('defaults to not installed and no prompt available', async () => {
    const { useInstallPrompt } = await import('../../app/composables/useInstallPrompt')
    const { isInstalled, canPrompt } = useInstallPrompt()

    expect(isInstalled.value).toBe(false)
    expect(canPrompt.value).toBe(false)
  })

  it('canPrompt becomes true once a deferred beforeinstallprompt event is present', async () => {
    const globals = globalThis as unknown as { useState: <T>(key: string, init: () => T) => StateBox<T> }
    globals.useState('eldra-install-deferred-prompt', () => ({ prompt: vi.fn() }) as unknown)

    const { useInstallPrompt } = await import('../../app/composables/useInstallPrompt')
    const { canPrompt } = useInstallPrompt()

    expect(canPrompt.value).toBe(true)
  })

  it('canPrompt stays false when already installed, even with a deferred event present -- never offers to install twice', async () => {
    const globals = globalThis as unknown as { useState: <T>(key: string, init: () => T) => StateBox<T> }
    globals.useState('eldra-install-deferred-prompt', () => ({ prompt: vi.fn() }) as unknown)
    globals.useState('eldra-install-is-installed', () => true)

    const { useInstallPrompt } = await import('../../app/composables/useInstallPrompt')
    const { canPrompt, isInstalled } = useInstallPrompt()

    expect(isInstalled.value).toBe(true)
    expect(canPrompt.value).toBe(false)
  })

  it('promptInstall with no deferred event returns "unavailable" and calls nothing', async () => {
    const { useInstallPrompt } = await import('../../app/composables/useInstallPrompt')
    const { promptInstall } = useInstallPrompt()

    expect(await promptInstall()).toBe('unavailable')
  })

  it('promptInstall "accepted": marks installed and consumes the event so it cannot be reused', async () => {
    const globals = globalThis as unknown as { useState: <T>(key: string, init: () => T) => StateBox<T> }
    const promptFn = vi.fn().mockResolvedValue(undefined)
    globals.useState('eldra-install-deferred-prompt', () => ({
      prompt: promptFn,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' })
    }) as unknown)

    const { useInstallPrompt } = await import('../../app/composables/useInstallPrompt')
    const { promptInstall, isInstalled, canPrompt } = useInstallPrompt()

    const outcome = await promptInstall()

    expect(outcome).toBe('accepted')
    expect(promptFn).toHaveBeenCalledTimes(1)
    expect(isInstalled.value).toBe(true)
    expect(canPrompt.value).toBe(false)
  })

  it('promptInstall "dismissed": does NOT mark installed, but still consumes the one-shot event', async () => {
    const globals = globalThis as unknown as { useState: <T>(key: string, init: () => T) => StateBox<T> }
    globals.useState('eldra-install-deferred-prompt', () => ({
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' })
    }) as unknown)

    const { useInstallPrompt } = await import('../../app/composables/useInstallPrompt')
    const { promptInstall, isInstalled, canPrompt } = useInstallPrompt()

    const outcome = await promptInstall()

    expect(outcome).toBe('dismissed')
    expect(isInstalled.value).toBe(false)
    // The event is gone either way -- Chrome does not refire it, so a
    // second call must not try to prompt again.
    expect(canPrompt.value).toBe(false)
    expect(await promptInstall()).toBe('unavailable')
  })
})
