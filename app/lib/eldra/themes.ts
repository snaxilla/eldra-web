// Eldra theme registry + resolution (Theming Architecture, Phase 2).
//
// Pure module -- no Vue, no Nuxt, no DOM -- so it is shared verbatim by the
// client runtime (app/composables/useEldraTheme.ts), the server persistence
// boundary (server/utils/world-presentation-settings.ts), and unit tests
// (tests/lib/themes/themes.test.ts). See
// .github/docs/architecture/theming.md for the full architecture.
//
// Three levels, resolved in this order, each overriding the one before:
//
//   1. Platform default  -- PLATFORM_DEFAULT_THEME_KEY ('fantasy').
//   2. World theme       -- the GM's selection, persisted per World in the
//                           `world_presentation_settings` collection.
//   3. Accessibility     -- the individual viewer's own preferences
//                           (motion, contrast, transparency). These always
//                           win over level 2; a GM's theme can never
//                           re-enable an effect a viewer has turned off.
//
// A theme is a CSS scope (`[data-eldra-theme="<key>"]` in
// app/assets/css/themes/*.css) plus an entry here. Adding a theme never
// requires a new component tree -- see theming.md "Adding a theme".

export type EldraThemeKey = string

// GM-tunable knobs a theme exposes. Every value is optional in storage; the
// theme's own defaults fill the gaps.
export type EldraThemeOptions = {
  // 0..1 -- background alpha of darkglass panels.
  panelOpacity: number
  // px -- backdrop blur radius of darkglass panels.
  panelBlur: number
  // Whether optional atmospheric effects (glows, ambient motion) render.
  atmosphere: boolean
}

// Nuxt UI palette names (Tailwind color scales registered in main.css)
// this theme maps Nuxt UI's semantic colors onto. Applied at runtime to
// app config `ui.colors`, so `<UButton>` etc. follow the active theme.
export type EldraThemeNuxtUiColors = {
  primary: string
  neutral: string
}

export type EldraThemeDefinition = {
  key: EldraThemeKey
  label: string
  description: string
  defaults: EldraThemeOptions
  nuxtUi: EldraThemeNuxtUiColors
}

export type EldraAccessibilityPreferences = {
  reducedMotion: boolean
  highContrast: boolean
  reduceTransparency: boolean
}

export type EldraWorldThemeSelection = {
  themeKey: EldraThemeKey | null
  themeOptions: Partial<EldraThemeOptions>
}

export type EldraResolvedTheme = {
  themeKey: EldraThemeKey
  // Which level supplied themeKey -- useful for UI copy and tests.
  source: 'platform' | 'world'
  options: EldraThemeOptions
  nuxtUi: EldraThemeNuxtUiColors
  accessibility: EldraAccessibilityPreferences
  // Attributes to set on the theme root (<html>).
  attributes: Record<string, string>
  // CSS custom properties to set on the theme root.
  cssVariables: Record<string, string>
}

export const PLATFORM_DEFAULT_THEME_KEY: EldraThemeKey = 'fantasy'

// Readability floor: no theme option may make a panel more transparent
// than this, whatever is stored.
export const MIN_PANEL_OPACITY = 0.55
export const MAX_PANEL_BLUR = 24

export const ELDRA_THEMES: readonly EldraThemeDefinition[] = [
  {
    key: 'fantasy',
    label: 'Fantasy',
    description: 'Antique gold, ornate frames, smoky darkglass.',
    defaults: {
      panelOpacity: 0.86,
      panelBlur: 12,
      atmosphere: true
    },
    // Phase 2 keeps Nuxt UI's existing palette so the app looks unchanged.
    // eldra-design-language.md §5 calls for gold primary actions; Phase 3
    // flips this to 'gold' (scale already registered in main.css).
    nuxtUi: {
      primary: 'green',
      neutral: 'slate'
    }
  }
]

export const DEFAULT_ACCESSIBILITY_PREFERENCES: EldraAccessibilityPreferences = {
  reducedMotion: false,
  highContrast: false,
  reduceTransparency: false
}

export function listThemes(): readonly EldraThemeDefinition[] {
  return ELDRA_THEMES
}

export function isKnownThemeKey(key: unknown): key is EldraThemeKey {
  return typeof key === 'string' && ELDRA_THEMES.some((theme) => theme.key === key)
}

export function getTheme(key: unknown): EldraThemeDefinition {
  const found = ELDRA_THEMES.find((theme) => theme.key === key)
  if (found) return found

  const fallback = ELDRA_THEMES.find((theme) => theme.key === PLATFORM_DEFAULT_THEME_KEY)
  if (!fallback) {
    throw new Error(`Eldra theme registry is missing the platform default theme '${PLATFORM_DEFAULT_THEME_KEY}'`)
  }
  return fallback
}

function finiteNumber(value: unknown): number | null {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof num === 'number' && Number.isFinite(num) ? num : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// Accepts anything (stored JSON, request bodies) and returns only the
// recognised, in-range option fields. Unknown keys and invalid values are
// dropped, never thrown on -- a bad row must not break the workspace.
export function sanitizeThemeOptions(raw: unknown): Partial<EldraThemeOptions> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const source = raw as Record<string, unknown>
  const result: Partial<EldraThemeOptions> = {}

  const opacity = finiteNumber(source.panelOpacity)
  if (opacity !== null) result.panelOpacity = clamp(opacity, MIN_PANEL_OPACITY, 1)

  const blur = finiteNumber(source.panelBlur)
  if (blur !== null) result.panelBlur = clamp(Math.round(blur), 0, MAX_PANEL_BLUR)

  if (typeof source.atmosphere === 'boolean') result.atmosphere = source.atmosphere

  return result
}

// Normalises a stored/submitted World selection. An unknown theme key
// becomes `null` (inherit the platform default) rather than an error.
export function sanitizeWorldThemeSelection(raw: unknown): EldraWorldThemeSelection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { themeKey: null, themeOptions: {} }
  }

  const source = raw as Record<string, unknown>
  return {
    themeKey: isKnownThemeKey(source.themeKey) ? source.themeKey : null,
    themeOptions: sanitizeThemeOptions(source.themeOptions)
  }
}

export function sanitizeAccessibilityPreferences(raw: unknown): EldraAccessibilityPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ACCESSIBILITY_PREFERENCES }
  }

  const source = raw as Record<string, unknown>
  return {
    reducedMotion: source.reducedMotion === true,
    highContrast: source.highContrast === true,
    reduceTransparency: source.reduceTransparency === true
  }
}

export function resolveTheme(input: {
  world?: EldraWorldThemeSelection | null
  accessibility?: Partial<EldraAccessibilityPreferences> | null
} = {}): EldraResolvedTheme {
  const world = input.world ? sanitizeWorldThemeSelection(input.world) : null
  const accessibility = sanitizeAccessibilityPreferences(input.accessibility)

  const source: EldraResolvedTheme['source'] = world?.themeKey ? 'world' : 'platform'
  const theme = getTheme(world?.themeKey ?? PLATFORM_DEFAULT_THEME_KEY)

  // Level 2: the GM's options are theme-agnostic knobs layered over the
  // active theme's own defaults (including the platform default, when the
  // World stores options but no explicit key).
  const options: EldraThemeOptions = {
    ...theme.defaults,
    ...(world?.themeOptions ?? {})
  }

  // Level 3: the viewer's accessibility preferences always win.
  if (accessibility.reduceTransparency || accessibility.highContrast) {
    options.panelOpacity = 1
    options.panelBlur = 0
  }
  if (accessibility.reducedMotion || accessibility.highContrast) {
    options.atmosphere = false
  }

  return {
    themeKey: theme.key,
    source,
    options,
    nuxtUi: { ...theme.nuxtUi },
    accessibility,
    attributes: {
      'data-eldra-theme': theme.key,
      'data-eldra-motion': accessibility.reducedMotion ? 'reduced' : 'full',
      'data-eldra-contrast': accessibility.highContrast ? 'high' : 'normal',
      'data-eldra-transparency': accessibility.reduceTransparency ? 'reduced' : 'full',
      'data-eldra-atmosphere': options.atmosphere ? 'on' : 'off'
    },
    cssVariables: {
      '--eldra-panel-alpha': String(options.panelOpacity),
      '--eldra-panel-blur': `${options.panelBlur}px`
    }
  }
}

export function cssVariablesToStyle(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ')
}

// Whether `path` is inside the World workspace for `worldId` -- the only
// place a World's theme applies. Everywhere else (dashboard, login,
// platform admin, another World) uses the platform default. Mirrors the
// route shapes app/layouts/default.vue already treats as "in a World".
export function isPathInWorld(path: string, worldId: string | null | undefined): boolean {
  if (!worldId) return false
  const match =
    String(path || '').match(/^\/worlds\/([^/?#]+)/) ||
    String(path || '').match(/^\/(?:play|run)\/worlds\/([^/?#]+)/)
  return !!match && decodeURIComponent(match[1] || '') === String(worldId)
}
