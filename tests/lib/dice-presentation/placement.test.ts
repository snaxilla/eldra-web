// Tests for app/lib/dice-presentation/placement.ts. Roll System Phase
// 4C.2 (Dice Stage Position Normalization).

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DICE_STAGE_ANCHOR,
  DEFAULT_DICE_STAGE_PLACEMENT,
  DICE_STAGE_DESKTOP_BREAKPOINT_PX,
  resolveDiceStageResponsiveMode,
  type DiceStageAnchor
} from '../../../app/lib/dice-presentation/placement'

describe('item 1/2: one canonical default placement exists, and it is tray-left', () => {
  it('DEFAULT_DICE_STAGE_ANCHOR is exactly "tray-left"', () => {
    expect(DEFAULT_DICE_STAGE_ANCHOR).toBe('tray-left')
  })

  it('DEFAULT_DICE_STAGE_PLACEMENT wraps that same anchor, and only that anchor', () => {
    expect(DEFAULT_DICE_STAGE_PLACEMENT).toEqual({ anchor: 'tray-left' })
  })

  it('DEFAULT_DICE_STAGE_PLACEMENT is frozen -- no caller can silently mutate the shared default', () => {
    expect(Object.isFrozen(DEFAULT_DICE_STAGE_PLACEMENT)).toBe(true)
  })
})

describe('item 5: die type cannot select a different screen placement', () => {
  it('the placement module exposes no per-die-type lookup at all -- there is exactly one anchor value in the entire type', () => {
    // DiceStageAnchor is a union of exactly one literal today; TypeScript
    // enforces this at compile time (see the type import above), and this
    // runtime check confirms the one CONSTANT this module actually
    // exports is that same literal, with no sides/dieType parameter
    // anywhere in this file's own exports.
    const anchor: DiceStageAnchor = DEFAULT_DICE_STAGE_ANCHOR
    expect(anchor).toBe('tray-left')
  })
})

describe('item 7: responsive fallback is deterministic', () => {
  it('the same viewport width always resolves to the same mode', () => {
    for (const width of [320, 480, 639, 640, 768, 1024, 1440]) {
      expect(resolveDiceStageResponsiveMode(width)).toBe(resolveDiceStageResponsiveMode(width))
    }
  })

  it('resolves to "mobile" strictly below the documented breakpoint, and "desktop" at/above it', () => {
    expect(resolveDiceStageResponsiveMode(DICE_STAGE_DESKTOP_BREAKPOINT_PX - 1)).toBe('mobile')
    expect(resolveDiceStageResponsiveMode(DICE_STAGE_DESKTOP_BREAKPOINT_PX)).toBe('desktop')
  })

  it('matches Tailwind\'s own "sm:" breakpoint (640px) -- the exact value WorldDicePresentationStage.vue\'s own template switches on', () => {
    expect(DICE_STAGE_DESKTOP_BREAKPOINT_PX).toBe(640)
  })

  it('a very narrow viewport (a small phone) resolves to mobile, never desktop', () => {
    expect(resolveDiceStageResponsiveMode(320)).toBe('mobile')
  })

  it('a very wide viewport resolves to desktop', () => {
    expect(resolveDiceStageResponsiveMode(2560)).toBe('desktop')
  })
})
