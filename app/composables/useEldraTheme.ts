// Eldra theme runtime (Theming Architecture, Phase 2). See
// .github/docs/architecture/theming.md.
//
// - useWorldThemeState(): the current World's GM-selected theme, set by
//   app/layouts/world-workspace.vue from /api/worlds/:id/presentation-settings
//   and updated in place after a GM save (no reload).
// - useAccessibilityPreferences(): the viewer's own preferences. Stored in a
//   cookie rather than localStorage so SSR renders the right attributes on
//   the first paint.
// - useEldraThemeRoot(): called once, from app.vue. Resolves the three
//   levels and applies the result to <html>.
//
// Distinct from the legacy useThemeState()/'eldra-theme' key in
// useTheme.ts (per-browser card colors used by a few legacy components),
// and from sheet.vue's per-user sheet presentation, which is scoped to its
// own [data-sheet-*] attributes and is unaffected.

import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  cssVariablesToStyle,
  isPathInWorld,
  resolveTheme,
  sanitizeAccessibilityPreferences,
  sanitizeWorldThemeSelection,
  type EldraAccessibilityPreferences,
  type EldraWorldThemeSelection
} from '~/lib/eldra/themes'

export type WorldThemeState = {
  worldId: string
  selection: EldraWorldThemeSelection
} | null

const ACCESSIBILITY_COOKIE = 'eldra-a11y'

export const useWorldThemeState = () =>
  useState<WorldThemeState>('eldra-world-theme', () => null)

export function setWorldTheme(worldId: string, selection: unknown) {
  useWorldThemeState().value = {
    worldId: String(worldId),
    selection: sanitizeWorldThemeSelection(selection)
  }
}

function accessibilityCookie() {
  return useCookie<Partial<EldraAccessibilityPreferences> | null>(ACCESSIBILITY_COOKIE, {
    default: () => ({ ...DEFAULT_ACCESSIBILITY_PREFERENCES }),
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/'
  })
}

export const useAccessibilityPreferences = () =>
  useState<EldraAccessibilityPreferences>('eldra-accessibility', () =>
    sanitizeAccessibilityPreferences(accessibilityCookie().value)
  )

export function useEldraThemeRoot() {
  const route = useRoute()
  const appConfig = useAppConfig()
  const worldTheme = useWorldThemeState()
  const accessibility = useAccessibilityPreferences()
  const cookie = accessibilityCookie()

  const resolved = computed(() => {
    const current = worldTheme.value
    const world = current && isPathInWorld(route.path, current.worldId) ? current.selection : null
    return resolveTheme({ world, accessibility: accessibility.value })
  })

  useHead(() => ({
    htmlAttrs: {
      ...resolved.value.attributes,
      style: cssVariablesToStyle(resolved.value.cssVariables)
    }
  }))

  function applyNuxtUiColors() {
    const colors = appConfig.ui?.colors as Record<string, string> | undefined
    if (!colors) return
    const next = resolved.value.nuxtUi
    if (colors.primary !== next.primary) colors.primary = next.primary
    if (colors.neutral !== next.neutral) colors.neutral = next.neutral
  }

  // Once synchronously so SSR output matches, then on every change.
  applyNuxtUiColors()
  watch(() => resolved.value.nuxtUi, applyNuxtUiColors, { deep: true })

  watch(accessibility, (value) => {
    cookie.value = { ...value }
  }, { deep: true })

  return { resolved }
}
