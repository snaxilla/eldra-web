// Installable Web App -- tracks the browser's own `beforeinstallprompt`
// event (Chromium: Chrome/Edge/most Android browsers) and whether Eldra
// is already running installed (standalone), so AppInstallMenu.vue can
// show an honest, platform-appropriate action instead of a button that
// silently does nothing. Entirely client-only by nature (there is no SSR
// concept of "is this browser showing an install prompt"); every read
// here is guarded for `typeof window === 'undefined'` and resolves to a
// safe default during SSR, matching the same guard style already used
// elsewhere in this app (e.g. AdminWorldPropertiesPanel.vue's own
// `beforeunload` listener) rather than a `.client.vue`-only component.
//
// Shared via useState (not a module-level ref) for the same reason
// useWorldThemeState/useAccessibilityPreferences are (useEldraTheme.ts):
// this app renders the equivalent trigger in more than one place at once
// (AppTopbar.vue, and twice in WorldWorkspaceSidebar.vue's collapsed/
// expanded states) and they must all reflect the SAME one-per-page-load
// browser signal -- using the prompt from one instance, or Chrome firing
// `appinstalled`, must hide it everywhere, not just locally. The deferred
// event itself is never SSR-serialized: it can only ever be set client-
// side, well after hydration, so useState's SSR payload never sees it.
//
// DOM-detection logic (user-agent matching, standalone-launch detection)
// is pulled out into plain functions taking explicit arguments --
// tests/composables/useInstallPrompt.test.ts exercises those directly
// (this repo's established pattern for logic that would otherwise need a
// real browser/DOM harness it does not have), rather than reaching into
// `navigator`/`window` itself.

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// iOS/iPadOS Safari never fires beforeinstallprompt and has no install
// button of its own -- "Add to Home Screen" is a manual step reached
// through the Share sheet. Detected narrowly (Safari specifically, not
// Chrome/Firefox/Edge's own iOS builds, which embed Safari's engine but
// are not Safari and do not expose this flow) so the instructions shown
// are only ever for a browser that can actually follow them.
export function isIOSSafariUserAgent(userAgent: string, maxTouchPoints: number): boolean {
  const ua = String(userAgent || '')
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ identifies as "Macintosh" by default; multi-touch is the
    // standard way to tell it apart from a real Mac.
    || (ua.includes('Macintosh') && Number(maxTouchPoints) > 1)
  const isSafariEngine = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)

  return isIOSDevice && isSafariEngine
}

// True when either signal says this page is already running as an
// installed app -- the standard `display-mode: standalone` media query
// (current browsers), or older iOS/iPadOS Safari's own non-standard
// `navigator.standalone` flag (there was no display-mode query there
// before one existed). Either can be the one that is actually true
// depending on OS/browser version, so both are checked.
export function isStandaloneLaunch(matchesStandaloneMediaQuery: boolean, iosStandaloneFlag: boolean | undefined): boolean {
  return Boolean(matchesStandaloneMediaQuery) || iosStandaloneFlag === true
}

function useDeferredInstallPrompt() {
  return useState<BeforeInstallPromptEvent | null>('eldra-install-deferred-prompt', () => null)
}

function useIsInstalledState() {
  return useState<boolean>('eldra-install-is-installed', () => false)
}

function detectInstalled(): boolean {
  if (typeof window === 'undefined') return false

  const matchesStandalone = Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  const nav = navigator as Navigator & { standalone?: boolean }

  return isStandaloneLaunch(matchesStandalone, nav.standalone)
}

// Attached exactly once per page load, regardless of how many of the
// component instances above call useInstallPrompt() -- a plain
// module-level flag is enough for this (not reactive state) since the
// module itself only ever loads once per browser tab.
let listenersAttached = false

function attachListenersOnce(deferredPrompt: ReturnType<typeof useDeferredInstallPrompt>, isInstalled: ReturnType<typeof useIsInstalledState>) {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true

  isInstalled.value = detectInstalled()

  window.addEventListener('beforeinstallprompt', (event) => {
    // Chrome fires this automatically; suppressing its own mini-infobar
    // and holding the event is what lets "Install Eldra" invoke the SAME
    // real prompt later, only from an explicit click, per this task's
    // own "invoke it only from an explicit user action" rule.
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null
    isInstalled.value = true
  })

  const standaloneQuery = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null
  standaloneQuery?.addEventListener?.('change', (event) => {
    if (event.matches) isInstalled.value = true
  })
}

export function useInstallPrompt() {
  const deferredPrompt = useDeferredInstallPrompt()
  const isInstalled = useIsInstalledState()

  attachListenersOnce(deferredPrompt, isInstalled)

  // True only once the browser has ACTUALLY offered the event -- never
  // assumed from browser/platform sniffing. This is what makes the
  // button real rather than a guess at Chromium's own install
  // eligibility heuristics (HTTPS, manifest validity, engagement).
  const canPrompt = computed(() => !isInstalled.value && deferredPrompt.value !== null)

  const isIOSSafari = computed(() => {
    if (typeof navigator === 'undefined') return false
    return isIOSSafariUserAgent(navigator.userAgent, navigator.maxTouchPoints)
  })

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = deferredPrompt.value
    if (!event) return 'unavailable'

    await event.prompt()
    const choice = await event.userChoice

    // A captured beforeinstallprompt event can only ever be used once,
    // accepted or not -- Chrome does not refire it for the same page
    // load, so there is nothing left to retry with.
    deferredPrompt.value = null
    if (choice.outcome === 'accepted') isInstalled.value = true

    return choice.outcome
  }

  return {
    isInstalled: computed(() => isInstalled.value),
    canPrompt,
    isIOSSafari,
    promptInstall
  }
}
