// Tests for app/components/world/authoredD20ThreeChoreography.ts. Eldra
// Roll System Phase 4B.1 (Authored Three.js d20 Proof of Concept,
// ADR-024 Option 2) + Phase 4B.2 (Visual Polish + Skin-Ready Material
// Architecture, which added the squash/shadow/glint blocks below). This
// task's own explicit ask: "Test pure animation/choreography helpers
// where practical: duration budget, target orientation, deterministic
// final state, optional trajectory selection invariants." No WebGL/DOM/
// `three` import needed here -- this module is deliberately plain math,
// importable and testable without a browser (matching
// app/lib/rolls/dice-adapter.ts's own established "pure logic lives
// outside .vue files" convention).

import { describe, expect, it } from 'vitest'
import {
  bezierPoint,
  easeOutBack,
  easeOutCubic,
  ENTER_MS,
  EXIT_MS,
  FLOURISH_EMISSIVE_BOOST_PEAK,
  FLOURISH_MS,
  FLOURISH_SCALE_PEAK,
  flourishEmissiveBoost,
  flourishScale,
  LAND_BOB_HEIGHT,
  LAND_MS,
  LAND_OVERSHOOT,
  LAND_SQUASH_XZ,
  LAND_SQUASH_Y,
  landBobOffset,
  landSquashScaleXZ,
  landSquashScaleY,
  ROLL_MS,
  SHADOW_HEIGHT_FALLOFF,
  SHADOW_MAX_OPACITY,
  SHADOW_MAX_SCALE,
  SHADOW_MIN_SCALE,
  shadowOpacityForHeight,
  shadowScaleForHeight,
  SPIN_X_TURNS,
  SPIN_Y_TURNS,
  THROW_LAND_POSITION,
  THROW_MS,
  THROW_PEAK_POSITION,
  THROW_START_POSITION,
  TOTAL_CEREMONY_MS
} from '../../../app/components/world/authoredD20ThreeChoreography'

describe('duration budget -- this phase\'s own CHOREOGRAPHY/DURATION BUDGET sections', () => {
  it('THROW_MS is exactly ENTER_MS + ROLL_MS', () => {
    expect(THROW_MS).toBe(ENTER_MS + ROLL_MS)
  })

  it('each beat falls within ADR-024 §6 / this phase\'s own target ranges', () => {
    expect(ENTER_MS).toBeGreaterThanOrEqual(80)
    expect(ENTER_MS).toBeLessThanOrEqual(120)

    expect(ROLL_MS).toBeGreaterThanOrEqual(300)
    expect(ROLL_MS).toBeLessThanOrEqual(400)

    expect(LAND_MS).toBeGreaterThanOrEqual(150)
    expect(LAND_MS).toBeLessThanOrEqual(200)

    expect(EXIT_MS).toBeGreaterThanOrEqual(100)
    expect(EXIT_MS).toBeLessThanOrEqual(150)
  })

  it('TOTAL_CEREMONY_MS is the sum of every beat, inside the 700-900ms target and under the 1000ms hard ceiling', () => {
    expect(TOTAL_CEREMONY_MS).toBe(THROW_MS + LAND_MS + FLOURISH_MS + EXIT_MS)
    expect(TOTAL_CEREMONY_MS).toBeGreaterThanOrEqual(700)
    expect(TOTAL_CEREMONY_MS).toBeLessThanOrEqual(900)
    expect(TOTAL_CEREMONY_MS).toBeLessThan(1000)
  })

  it('Phase 4B.2 widened LAND_MS for the new squash-and-stretch, but the throw\'s own arc/spin timing is untouched (no redesign without browser evidence)', () => {
    expect(ENTER_MS).toBe(100)
    expect(ROLL_MS).toBe(350)
    expect(LAND_MS).toBe(190)
  })
})

describe('bezierPoint -- the authored throw trajectory', () => {
  it('is exactly the start position at t=0', () => {
    const p = bezierPoint(0, THROW_START_POSITION, THROW_PEAK_POSITION, THROW_LAND_POSITION)
    expect(p).toEqual(THROW_START_POSITION)
  })

  it('is EXACTLY the end position at t=1 -- not merely close, algebraically exact', () => {
    const p = bezierPoint(1, THROW_START_POSITION, THROW_PEAK_POSITION, THROW_LAND_POSITION)
    expect(p).toEqual(THROW_LAND_POSITION)
  })

  it('passes visibly near the control point at t=0.5 (a real arc, not a straight line)', () => {
    const mid = bezierPoint(0.5, THROW_START_POSITION, THROW_PEAK_POSITION, THROW_LAND_POSITION)
    const straightLineMidY = (THROW_START_POSITION.y + THROW_LAND_POSITION.y) / 2
    // The control point is well above the straight start->end line on Y;
    // a genuine arc's own midpoint should be pulled noticeably toward it.
    expect(mid.y).toBeGreaterThan(straightLineMidY)
  })

  it('the configured trajectory starts lower/right and arrives at dead center (this phase\'s own THE THROW section)', () => {
    expect(THROW_START_POSITION.x).toBeGreaterThan(0)
    expect(THROW_START_POSITION.y).toBeLessThan(0)
    expect(THROW_LAND_POSITION).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('easeOutCubic', () => {
  it('is exactly 0 at t=0 and exactly 1 at t=1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('is monotonically non-decreasing', () => {
    let prev = -Infinity
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeOutCubic(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('easeOutBack -- LAND\'s rotational overshoot-and-settle', () => {
  it('is ~0 at t=0 and EXACTLY 1 at t=1 -- the algebraic guarantee the final orientation relies on', () => {
    // t=0 is subject to ordinary floating-point rounding (the algebraic
    // result is exactly 0, but `(t-1)^3`/`(t-1)^2` at t=0 don't cancel to
    // a bit-exact zero) -- harmless, since nothing depends on t=0 being
    // bit-exact. t=1 DOES matter (it's what the final-orientation
    // guarantee in WorldAuthoredThreeDiceRenderer.client.vue's own header
    // relies on) and is checked with exact equality, because at t=1,
    // `(t-1)` is exactly 0, so every term but the leading `1` vanishes
    // with no rounding involved at all.
    expect(easeOutBack(0)).toBeCloseTo(0, 10)
    expect(easeOutBack(1)).toBe(1)
  })

  it('rises measurably ABOVE 1 partway through -- a real overshoot, not just an ease-in-out', () => {
    const values = Array.from({ length: 21 }, (_, i) => easeOutBack(i / 20))
    expect(Math.max(...values)).toBeGreaterThan(1)
  })

  it('the overshoot is controlled -- default LAND_OVERSHOOT keeps the peak modest, not a bouncy exaggeration', () => {
    const values = Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100))
    const peak = Math.max(...values)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.3)
    expect(LAND_OVERSHOOT).toBeLessThan(2)
  })
})

describe('landBobOffset -- LAND\'s tiny impact dip', () => {
  it('is exactly 0 at the start and end of the beat', () => {
    expect(landBobOffset(0)).toBe(0)
    expect(landBobOffset(1)).toBeCloseTo(0, 10)
  })

  it('peaks at LAND_BOB_HEIGHT partway through, and never exceeds it', () => {
    const values = Array.from({ length: 101 }, (_, i) => landBobOffset(i / 100))
    expect(Math.max(...values)).toBeCloseTo(LAND_BOB_HEIGHT, 3)
    for (const v of values) expect(v).toBeLessThanOrEqual(LAND_BOB_HEIGHT + 1e-9)
  })
})

describe('flourishScale -- FLOURISH\'s minimal, tier-blind pulse', () => {
  it('is exactly 1 at the start and end of the beat', () => {
    expect(flourishScale(0)).toBe(1)
    expect(flourishScale(1)).toBeCloseTo(1, 10)
  })

  it('peaks at FLOURISH_SCALE_PEAK, a deliberately small bump ("minimal for this phase")', () => {
    const values = Array.from({ length: 101 }, (_, i) => flourishScale(i / 100))
    expect(Math.max(...values)).toBeCloseTo(FLOURISH_SCALE_PEAK, 3)
    expect(FLOURISH_SCALE_PEAK).toBeLessThan(1.15)
  })
})

describe('spin configuration -- this phase\'s own ROTATION STRATEGY ("deliberate extra rotations", "not a model viewer")', () => {
  it('spins more than one full turn on at least one axis', () => {
    expect(Math.max(SPIN_X_TURNS, SPIN_Y_TURNS)).toBeGreaterThan(1)
  })

  it('uses two DIFFERENT turn counts on the two spin axes -- an irregular tumble, not a single clean spin', () => {
    expect(SPIN_X_TURNS).not.toBe(SPIN_Y_TURNS)
  })
})

// ---------------------------------------------------------------------------
// PHASE 4B.2 -- CONTACT / WEIGHT
// ---------------------------------------------------------------------------

describe('landSquashScaleY / landSquashScaleXZ -- impact squash-and-stretch', () => {
  it('starts compressed (Y below 1, XZ above 1) at the instant of impact', () => {
    expect(landSquashScaleY(0)).toBeCloseTo(LAND_SQUASH_Y, 6)
    expect(landSquashScaleXZ(0)).toBeCloseTo(LAND_SQUASH_XZ, 6)
    expect(LAND_SQUASH_Y).toBeLessThan(1)
    expect(LAND_SQUASH_XZ).toBeGreaterThan(1)
  })

  it('fully recovers to neutral (1,1,1) well before LAND ends, leaving room for FLOURISH\'s own separate pulse', () => {
    expect(landSquashScaleY(1)).toBeCloseTo(1, 6)
    expect(landSquashScaleXZ(1)).toBeCloseTo(1, 6)
  })

  it('never inflates beyond a modest, controlled range -- a bounce, not a cartoon wobble', () => {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      expect(landSquashScaleY(t)).toBeGreaterThan(0.7)
      expect(landSquashScaleY(t)).toBeLessThan(1.05)
      expect(landSquashScaleXZ(t)).toBeGreaterThan(0.95)
      expect(landSquashScaleXZ(t)).toBeLessThan(1.15)
    }
  })
})

describe('shadowScaleForHeight / shadowOpacityForHeight -- the contact shadow', () => {
  it('is largest and darkest exactly at the floor (height 0)', () => {
    expect(shadowScaleForHeight(0)).toBeCloseTo(SHADOW_MAX_SCALE, 6)
    expect(shadowOpacityForHeight(0)).toBeCloseTo(SHADOW_MAX_OPACITY, 6)
  })

  it('shrinks and fades as height increases, reaching its floor at/beyond SHADOW_HEIGHT_FALLOFF', () => {
    expect(shadowScaleForHeight(SHADOW_HEIGHT_FALLOFF)).toBeCloseTo(SHADOW_MIN_SCALE, 6)
    expect(shadowOpacityForHeight(SHADOW_HEIGHT_FALLOFF)).toBeCloseTo(0, 6)
    // Beyond the falloff distance, it does not go negative or invert.
    expect(shadowScaleForHeight(SHADOW_HEIGHT_FALLOFF * 3)).toBeCloseTo(SHADOW_MIN_SCALE, 6)
    expect(shadowOpacityForHeight(SHADOW_HEIGHT_FALLOFF * 3)).toBeCloseTo(0, 6)
  })

  it('treats height as unsigned -- the authored trajectory dips below the floor (negative y) at THROW_START_POSITION', () => {
    expect(shadowScaleForHeight(-0.5)).toBeCloseTo(shadowScaleForHeight(0.5), 6)
    expect(shadowOpacityForHeight(-0.5)).toBeCloseTo(shadowOpacityForHeight(0.5), 6)
  })

  it('is monotonic -- moving farther from the floor never makes the shadow tighter or darker', () => {
    let prevScale = Infinity
    let prevOpacity = Infinity
    for (let i = 0; i <= 20; i++) {
      const height = (i / 20) * SHADOW_HEIGHT_FALLOFF
      const scale = shadowScaleForHeight(height)
      const opacity = shadowOpacityForHeight(height)
      expect(scale).toBeLessThanOrEqual(prevScale + 1e-9)
      expect(opacity).toBeLessThanOrEqual(prevOpacity + 1e-9)
      prevScale = scale
      prevOpacity = opacity
    }
  })
})

describe('flourishEmissiveBoost -- the FLOURISH glint', () => {
  it('is zero at the start and end of the beat', () => {
    expect(flourishEmissiveBoost(0)).toBe(0)
    expect(flourishEmissiveBoost(1)).toBeCloseTo(0, 10)
  })

  it('peaks at FLOURISH_EMISSIVE_BOOST_PEAK, kept small ("extremely subtle")', () => {
    const values = Array.from({ length: 101 }, (_, i) => flourishEmissiveBoost(i / 100))
    expect(Math.max(...values)).toBeCloseTo(FLOURISH_EMISSIVE_BOOST_PEAK, 3)
    expect(FLOURISH_EMISSIVE_BOOST_PEAK).toBeLessThan(0.6)
  })

  it('never goes negative -- a glint only ever adds glow, never subtracts it', () => {
    for (let i = 0; i <= 100; i++) {
      expect(flourishEmissiveBoost(i / 100)).toBeGreaterThanOrEqual(0)
    }
  })
})
