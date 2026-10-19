// Phase 3C guard: the shared glass surfaces and the workspace page backdrop
// take their strength from theme tokens derived from the GM's panel
// opacity/blur, never from literal fills, so the GM controls stay
// authoritative and the accessibility overrides reach every surface.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const tokens = read('app/assets/css/themes/tokens.css')
const fieldguide = read('app/assets/css/eldra-fieldguide.css')
const surfaces = read('app/assets/css/themes/surfaces.css')
const accessibility = read('app/assets/css/themes/accessibility.css')
const workspace = read('app/layouts/world-workspace.vue')

// The top-level declaration block of a selector, e.g.
// rule(css, '.eldra-ornate-card').
function rule(css: string, selector: string) {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, `${selector} exists`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('surface hierarchy tokens', () => {
  it.each(['nav', 'card', 'reading', 'inspector', 'overlay'])('derives the %s level from the GM panel opacity', (level) => {
    const match = tokens.match(new RegExp(`--eldra-surface-${level}-alpha:([^;]+);`))
    expect(match?.[1]).toContain('var(--eldra-panel-alpha)')
  })

  it('derives the card blur from the GM panel blur', () => {
    expect(tokens).toMatch(/--eldra-surface-card-blur:[^;]*var\(--eldra-panel-blur\)/)
  })
})

describe('shared surfaces', () => {
  it.each([
    ['.eldra-ornate-card', '--eldra-surface-card-alpha'],
    ['.eldra-ornate-panel', '--eldra-surface-reading-alpha']
  ])('%s fills from %s with no literal colour', (selector, token) => {
    const block = rule(fieldguide, selector)
    expect(block).toContain(`var(${token})`)
    expect(block).toMatch(/backdrop-filter: blur\(var\(--eldra-(surface-card|panel)-blur\)\)/)
    // The old near-opaque literal fill.
    expect(block).not.toMatch(/rgba\(16,\s*15,\s*12/)
  })

  it('the V2 sheet panel is a reading surface', () => {
    expect(rule(surfaces, '.eldra-sheet-panel')).toContain('var(--eldra-surface-reading-alpha)')
  })

  it('accessibility removes the blur from every shared glass surface', () => {
    for (const cls of ['.eldra-ornate-panel', '.eldra-ornate-card', '.eldra-sheet-panel']) {
      expect(accessibility).toContain(cls)
    }
  })
})

describe('workspace page backdrop', () => {
  it('takes its strength and scrim from tokens, not literals', () => {
    expect(workspace).toContain('var(--eldra-backdrop-${backdropTone}-opacity)')
    expect(workspace).toContain('var(--eldra-backdrop-${backdropTone}-scrim)')
    expect(workspace).not.toMatch(/opacity: presentationMode === 'immersive' \? '0\.\d+'/)
    expect(workspace).not.toMatch(/rgba\(9,11,15/)
  })

  it('shows no artwork in neutral mode', () => {
    expect(workspace).toMatch(/hasPageBackdrop = computed\(\(\) =>[\s\S]*presentationMode\.value !== 'neutral'/)
  })
})

describe('Eldra universe backdrop (Game Admin, World Selection)', () => {
  const admin = read('app/pages/worlds/[id]/admin.vue')
  const universe = read('app/components/WorldChooserThpace.vue')

  it('Game Admin declares the universe and no longer draws its own copy', () => {
    expect(admin).toMatch(/eldraBackdrop: 'universe'/)
    expect(admin).not.toContain('<WorldChooserThpace')
    expect(admin).not.toContain('-mt-[100dvh]')
  })

  it('the layout draws the universe behind the whole workspace, never replaced by a page background', () => {
    expect(workspace).toMatch(/usesUniverseBackdrop = computed\(\(\) => !isFullBleedMap\.value && route\.meta\.eldraBackdrop === 'universe'\)/)
    expect(workspace).toMatch(/hasPageBackdrop = computed\(\(\) =>[\s\S]*!usesUniverseBackdrop\.value/)
    expect(workspace).toMatch(/<WorldChooserThpace\s+v-else-if="usesUniverseBackdrop"\s+mode="absolute"/)
  })

  it('stops rendering when hidden or under reduced motion, and tears down on unmount', () => {
    expect(universe).toContain("matchMedia?.('(prefers-reduced-motion: reduce)')")
    expect(universe).toContain('accessibility.value.reducedMotion')
    expect(universe).toMatch(/if \(hidden\.value\) \{\s+instance\.stop\(\)/)
    expect(universe).toContain("window.removeEventListener('resize', instance.resize)")
    expect(universe).toContain("getExtension?.('WEBGL_lose_context')?.loseContext()")
    // thpace has no remove(); calling it was a silent no-op.
    expect(universe).not.toContain('.remove()')
  })
})

describe('readability floors', () => {
  // Resolve a level at a given GM opacity from its declaration.
  function level(name: string, panelAlpha: number) {
    const expr = tokens.match(new RegExp(`--eldra-surface-${name}-alpha:([^;]+);`))![1]!
      .replace(/var\(--eldra-panel-alpha\)/g, String(panelAlpha))
      .replace(/calc\(/g, '(')
    return Function(`"use strict"; const min = Math.min, max = Math.max; return (${expr})`)() as number
  }

  it('keeps the hierarchy ordered at the GM minimum, with reading surfaces densest', () => {
    const at = (alpha: number) => ({
      nav: level('nav', alpha),
      card: level('card', alpha),
      inspector: level('inspector', alpha),
      reading: level('reading', alpha)
    })
    const min = at(0.55)
    expect(min.nav).toBe(0.55)
    expect(min.nav).toBeLessThan(min.card)
    expect(min.card).toBeLessThan(min.inspector)
    expect(min.inspector).toBeLessThan(min.reading)
    expect(min.reading).toBeGreaterThanOrEqual(0.82)
  })

  it('changes nothing at the platform default opacity', () => {
    expect(level('nav', 0.74)).toBe(0.74)
    expect(level('card', 0.74)).toBe(0.74)
    expect(level('inspector', 0.74)).toBe(0.74)
    expect(level('reading', 0.74)).toBeCloseTo(0.84)
  })

  it('accessibility (alpha 1) makes every level solid', () => {
    for (const name of ['nav', 'card', 'inspector', 'reading', 'overlay']) expect(level(name, 1)).toBe(1)
  })

  it('the context inspector reads the inspector level in every placement', () => {
    expect(surfaces).toMatch(/\.eldra-ornate-panel\.eldra-glass-surface:is\(\[data-world-context-rail\], \[data-sheet-detail-rail\], \[data-context-inline\]\) \{\s+background:\s+var\(--eldra-glass-sheen\),\s+rgb\(var\(--eldra-panel-rgb\) \/ var\(--eldra-surface-inspector-alpha\)\)/)
  })
})
