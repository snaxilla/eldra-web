// Unit tests for the pure presentation resolver in
// app/composables/useCharacterSheetPresentation.ts (Phase 4C). The
// composable itself needs a DOM (ResizeObserver) and Nuxt (useCookie),
// which this repo's plain-Vitest setup does not provide.

import { describe, expect, it } from 'vitest'
import {
  DESKTOP_FULL_MIN_WIDTH,
  DESKTOP_MIN_WIDTH,
  resolveCharacterSheetPresentation
} from '../../app/composables/useCharacterSheetPresentation'

describe('resolveCharacterSheetPresentation', () => {
  it('uses the full desktop presentation from 1280px of workspace', () => {
    expect(resolveCharacterSheetPresentation(DESKTOP_FULL_MIN_WIDTH)).toEqual({ presentation: 'desktop', density: 'full' })
    expect(resolveCharacterSheetPresentation(1852)).toEqual({ presentation: 'desktop', density: 'full' })
  })

  it('uses the compact desktop presentation from 800px to 1279px', () => {
    expect(resolveCharacterSheetPresentation(DESKTOP_MIN_WIDTH)).toEqual({ presentation: 'desktop', density: 'compact' })
    expect(resolveCharacterSheetPresentation(1279)).toEqual({ presentation: 'desktop', density: 'compact' })
  })

  it('uses the companion presentation below 800px', () => {
    expect(resolveCharacterSheetPresentation(799).presentation).toBe('companion')
    expect(resolveCharacterSheetPresentation(390).presentation).toBe('companion')
  })
})
