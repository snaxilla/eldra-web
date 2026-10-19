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
