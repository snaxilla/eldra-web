// Unit tests for the Eldra theme registry + resolution
// (app/lib/eldra/themes.ts, Theming Architecture Phase 2). See
// .github/docs/architecture/theming.md for the three-level model under test:
// platform default -> GM World theme -> viewer accessibility preferences.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ELDRA_THEMES,
  MAX_PANEL_BLUR,
  MIN_PANEL_OPACITY,
  PLATFORM_DEFAULT_THEME_KEY,
  getTheme,
  isKnownThemeKey,
  isPathInWorld,
  listThemes,
  resolveTheme,
  sanitizeAccessibilityPreferences,
  sanitizeThemeOptions,
  sanitizeWorldThemeSelection
} from '../../../app/lib/eldra/themes'

const fantasyDefaults = getTheme('fantasy').defaults

describe('theme registry', () => {
  it('contains the platform default theme', () => {
    expect(PLATFORM_DEFAULT_THEME_KEY).toBe('fantasy')
    expect(isKnownThemeKey(PLATFORM_DEFAULT_THEME_KEY)).toBe(true)
    expect(listThemes()).toBe(ELDRA_THEMES)
  })

  it('has unique keys and complete definitions', () => {
    const keys = ELDRA_THEMES.map((theme) => theme.key)
    expect(new Set(keys).size).toBe(keys.length)

    for (const theme of ELDRA_THEMES) {
      expect(theme.label).toBeTruthy()
      expect(theme.nuxtUi.primary).toBeTruthy()
      expect(theme.nuxtUi.neutral).toBeTruthy()
      // A theme's own defaults must already satisfy the sanitizer's limits.
      expect(sanitizeThemeOptions(theme.defaults)).toEqual(theme.defaults)
    }
  })

  it('getTheme falls back to the platform default for unknown keys', () => {
    expect(getTheme('cyberpunk-not-installed').key).toBe(PLATFORM_DEFAULT_THEME_KEY)
    expect(getTheme(undefined).key).toBe(PLATFORM_DEFAULT_THEME_KEY)
    expect(getTheme(42).key).toBe(PLATFORM_DEFAULT_THEME_KEY)
  })

  it('isKnownThemeKey rejects non-strings and unknown keys', () => {
    expect(isKnownThemeKey('fantasy')).toBe(true)
    expect(isKnownThemeKey('FANTASY')).toBe(false)
    expect(isKnownThemeKey(null)).toBe(false)
    expect(isKnownThemeKey({ key: 'fantasy' })).toBe(false)
  })
})

describe('resolveTheme -- platform fallback', () => {
  it('uses the platform default with no input', () => {
    const resolved = resolveTheme()
    expect(resolved.themeKey).toBe('fantasy')
    expect(resolved.source).toBe('platform')
    expect(resolved.options).toEqual(fantasyDefaults)
    expect(resolved.attributes['data-eldra-theme']).toBe('fantasy')
  })

  it('uses the platform default when the World has no selection', () => {
    expect(resolveTheme({ world: null }).source).toBe('platform')
    expect(resolveTheme({ world: { themeKey: null, themeOptions: {} } }).source).toBe('platform')
  })

  it('emits runtime CSS variables from the resolved options', () => {
    const resolved = resolveTheme()
    expect(resolved.cssVariables).toEqual({
      '--eldra-panel-alpha': String(fantasyDefaults.panelOpacity),
      '--eldra-panel-blur': `${fantasyDefaults.panelBlur}px`
    })
  })

  it('maps Nuxt UI colors from the theme (Phase 2 keeps the existing palette)', () => {
    expect(resolveTheme().nuxtUi).toEqual({ primary: 'green', neutral: 'slate' })
  })
})

describe('resolveTheme -- World theme inheritance', () => {
  it('applies the GM-selected theme with source "world"', () => {
    const resolved = resolveTheme({ world: { themeKey: 'fantasy', themeOptions: {} } })
    expect(resolved.themeKey).toBe('fantasy')
    expect(resolved.source).toBe('world')
  })

  it('layers GM options over the theme defaults', () => {
    const resolved = resolveTheme({
      world: { themeKey: 'fantasy', themeOptions: { panelOpacity: 0.7, panelBlur: 4 } }
    })
    expect(resolved.options).toEqual({ ...fantasyDefaults, panelOpacity: 0.7, panelBlur: 4 })
    expect(resolved.cssVariables['--eldra-panel-alpha']).toBe('0.7')
    expect(resolved.cssVariables['--eldra-panel-blur']).toBe('4px')
  })

  it('applies GM options to the platform default when no key is stored', () => {
    const resolved = resolveTheme({ world: { themeKey: null, themeOptions: { atmosphere: false } } })
    expect(resolved.source).toBe('platform')
    expect(resolved.options.atmosphere).toBe(false)
    expect(resolved.attributes['data-eldra-atmosphere']).toBe('off')
  })
})

describe('resolveTheme -- accessibility overrides', () => {
  const gmWorld = {
    themeKey: 'fantasy',
    themeOptions: { panelOpacity: 0.6, panelBlur: 20, atmosphere: true }
  }

  it('reduceTransparency forces solid, unblurred panels over GM options', () => {
    const resolved = resolveTheme({ world: gmWorld, accessibility: { reduceTransparency: true } })
    expect(resolved.options.panelOpacity).toBe(1)
    expect(resolved.options.panelBlur).toBe(0)
    expect(resolved.attributes['data-eldra-transparency']).toBe('reduced')
    // Transparency alone does not disable atmosphere.
    expect(resolved.options.atmosphere).toBe(true)
  })

  it('reducedMotion turns atmosphere off even when the GM turned it on', () => {
    const resolved = resolveTheme({ world: gmWorld, accessibility: { reducedMotion: true } })
    expect(resolved.options.atmosphere).toBe(false)
    expect(resolved.attributes['data-eldra-motion']).toBe('reduced')
    expect(resolved.attributes['data-eldra-atmosphere']).toBe('off')
    // Motion alone leaves the GM's transparency choice in place.
    expect(resolved.options.panelOpacity).toBe(0.6)
  })

  it('highContrast forces solid panels and disables atmosphere', () => {
    const resolved = resolveTheme({ world: gmWorld, accessibility: { highContrast: true } })
    expect(resolved.options).toMatchObject({ panelOpacity: 1, panelBlur: 0, atmosphere: false })
    expect(resolved.attributes['data-eldra-contrast']).toBe('high')
  })

  it('defaults every preference off', () => {
    const resolved = resolveTheme({ world: gmWorld })
    expect(resolved.accessibility).toEqual({ reducedMotion: false, highContrast: false, reduceTransparency: false })
    expect(resolved.attributes).toMatchObject({
      'data-eldra-motion': 'full',
      'data-eldra-contrast': 'normal',
      'data-eldra-transparency': 'full'
    })
  })

  it('accessibility CSS is imported after every theme scope so it wins on equal specificity', () => {
    const mainCss = readFileSync(
      fileURLToPath(new URL('../../../app/assets/css/main.css', import.meta.url)),
      'utf8'
    )
    const imports = [...mainCss.matchAll(/@import\s+"\.\/themes\/([^"]+)"/g)].map((match) => match[1])
    expect(imports[0]).toBe('tokens.css')
    expect(imports[imports.length - 1]).toBe('accessibility.css')
    for (const theme of ELDRA_THEMES) {
      expect(imports).toContain(`${theme.key}.css`)
    }
  })
})

describe('invalid or missing theme configuration', () => {
  it('treats an unknown stored theme key as the platform default', () => {
    const resolved = resolveTheme({ world: { themeKey: 'removed-theme', themeOptions: {} } })
    expect(resolved.themeKey).toBe('fantasy')
    expect(resolved.source).toBe('platform')
  })

  it('sanitizeWorldThemeSelection tolerates garbage input', () => {
    for (const input of [null, undefined, 'fantasy', 7, [], { themeKey: 3, themeOptions: 'x' }]) {
      expect(sanitizeWorldThemeSelection(input)).toEqual({ themeKey: null, themeOptions: {} })
    }
  })

  it('clamps options to the readability floor and blur ceiling', () => {
    expect(sanitizeThemeOptions({ panelOpacity: 0, panelBlur: 500 })).toEqual({
      panelOpacity: MIN_PANEL_OPACITY,
      panelBlur: MAX_PANEL_BLUR
    })
    expect(sanitizeThemeOptions({ panelOpacity: 3, panelBlur: -4 })).toEqual({ panelOpacity: 1, panelBlur: 0 })
  })

  it('drops unknown keys and non-finite or mistyped values', () => {
    expect(sanitizeThemeOptions({
      panelOpacity: Number.NaN,
      panelBlur: 'lots',
      atmosphere: 'yes',
      injected: 'url(evil)'
    })).toEqual({})
  })

  it('accepts numeric strings (JSON round-trips through Directus)', () => {
    expect(sanitizeThemeOptions({ panelOpacity: '0.75', panelBlur: '6.4' })).toEqual({ panelOpacity: 0.75, panelBlur: 6 })
  })

  it('sanitizeAccessibilityPreferences only accepts literal true', () => {
    expect(sanitizeAccessibilityPreferences({ reducedMotion: 'true', highContrast: 1, reduceTransparency: true }))
      .toEqual({ reducedMotion: false, highContrast: false, reduceTransparency: true })
    expect(sanitizeAccessibilityPreferences('nonsense'))
      .toEqual({ reducedMotion: false, highContrast: false, reduceTransparency: false })
  })
})

describe('isPathInWorld -- World theme scope', () => {
  it('matches the World workspace routes for that World only', () => {
    expect(isPathInWorld('/worlds/12', '12')).toBe(true)
    expect(isPathInWorld('/worlds/12/admin', '12')).toBe(true)
    expect(isPathInWorld('/play/worlds/12/map', '12')).toBe(true)
    expect(isPathInWorld('/worlds/123', '12')).toBe(false)
    expect(isPathInWorld('/worlds/13/admin', '12')).toBe(false)
  })

  it('is false outside any World (platform default applies)', () => {
    expect(isPathInWorld('/', '12')).toBe(false)
    expect(isPathInWorld('/admin', '12')).toBe(false)
    expect(isPathInWorld('/login', '12')).toBe(false)
    expect(isPathInWorld('/worlds/12', null)).toBe(false)
  })
})
