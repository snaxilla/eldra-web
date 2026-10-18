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

  it('maps Nuxt UI colors from the theme (Fantasy: gold primary)', () => {
    expect(resolveTheme().nuxtUi).toEqual({ primary: 'gold', neutral: 'slate' })
  })

  it('never themes semantic status colors (success/warning/error keep their meaning)', () => {
    for (const theme of ELDRA_THEMES) {
      expect(Object.keys(theme.nuxtUi).sort()).toEqual(['neutral', 'primary'])
    }
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

    // ...and after every other stylesheet main.css imports (legacy
    // component styles and the shared surfaces included).
    const allImports = [...mainCss.matchAll(/@import\s+"([^"]+)"/g)].map((match) => match[1])
    expect(allImports[allImports.length - 1]).toBe('./themes/accessibility.css')
  })
})

describe('shared surface primitives', () => {
  const surfacesCss = readFileSync(
    fileURLToPath(new URL('../../../app/assets/css/themes/surfaces.css', import.meta.url)),
    'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '')

  it('contain no hardcoded theme colors -- every color comes from a token', () => {
    expect(surfacesCss).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    // Plain black shadows are palette-neutral; anything else must be a var().
    const literalColors = [...surfacesCss.matchAll(/rgba?\(\s*(\d[^)]*)\)/g)]
      .map((match) => match[1]!.replace(/\s+/g, ' ').trim())
      .filter((channels) => !/^0 0 0 \/ [\d.]+$/.test(channels) && !/^0, 0, 0, [\d.]+$/.test(channels))
    expect(literalColors).toEqual([])
  })

  it('keep decorative ornament layers out of pointer interaction', () => {
    for (const selector of ['.eldra-ornament-frame', '.eldra-ornament-divider', '.eldra-ornament-emblem']) {
      const block = surfacesCss.slice(surfacesCss.indexOf(`${selector} {`))
      expect(block.slice(0, block.indexOf('}'))).toContain('pointer-events: none')
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

describe('shared components migrated onto theme tokens', () => {
  // Phase 3B-2 migrated these shared surfaces off hardcoded Fantasy colors.
  // New markup must use token utilities (border-eldra-accent/24,
  // text-eldra-text-soft, ...) so other themes can restyle it.
  const migrated = [
    'app/layouts/world-workspace.vue',
    'app/components/AppTopbar.vue',
    'app/components/AppSidebar.vue',
    'app/components/MobileBottomNav.vue',
    'app/components/EldraAccessibilityMenu.vue',
    'app/components/world/WorldWorkspaceSidebar.vue',
    'app/components/world/WorldEntityContextDrawer.vue',
    'app/components/world/WorldEntityRelationshipsPanel.vue',
    'app/components/world/WorldEntityInteractivePage.vue',
    'app/components/world/WorldPagePresentationPanel.vue',
    'app/components/world/WorldThemeSettingsPanel.vue',
    'app/components/world/map/MapBreadcrumbs.vue',
    'app/components/world/map/MapBuildBanner.vue',
    'app/components/world/map/MapImageOverlayEditor.vue',
    'app/components/world/map/MapLayerPanel.vue',
    'app/components/world/map/MapPinEditor.vue',
    'app/components/world/map/MapPinEditorHeader.vue',
    'app/components/world/map/MapRoadEditor.vue',
    'app/components/world/map/MapSelectedPinCard.vue'
  ]
  const forbidden = /-\[(?:rgba\(\s*201\s*,\s*164\s*,\s*90|#(?:c9a45a|fff7df|efe2bd|d8ceb8|b5a88d|9f9278|f5e7bd)\])/i

  for (const file of migrated) {
    it(`${file} has no hardcoded Fantasy color classes`, () => {
      const source = readFileSync(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), 'utf8')
      const offending = source.split('\n').filter((line) => forbidden.test(line))
      expect(offending).toEqual([])
    })
  }
})
