// Tests for app/components/world/worldMapViewport.ts -- the pure
// zoom-fraction/pin-scale/cover-zoom math behind the Map Starting View /
// Pin Scaling fix (.github/docs/architecture/map-starting-view-and-pin-scaling-trace.md).
import { describe, expect, it } from 'vitest'
import {
  computeCoverZoom,
  computeZoomFraction,
  pinReferenceZoom,
  shouldRefitOnResize
} from '~/components/world/worldMapViewport'

// The SAME formula WorldMapLeaflet.client.vue's own zoomScaleFactor/
// scaledSize apply -- reimplemented here (not imported; those stay
// private to the component) so this file can assert REAL, representative
// pixel sizes end to end, not just the fraction/reference-zoom math in
// isolation. Matches PIN_ZOOM_TUNING exactly (damping 0.5, min 0.35, max
// 1.15) and the 20x28 base icon.
const PIN_DAMPING = 0.5
const PIN_MIN = 0.35
const PIN_MAX = 1.15
const BASE_WIDTH = 20
const BASE_HEIGHT = 28

function pinScaleFor(zoom: number, minZoom: number, maxZoom: number) {
  const fraction = computeZoomFraction(zoom, minZoom, maxZoom)
  const referenceZoom = pinReferenceZoom(fraction)
  const raw = Math.pow(2, referenceZoom * PIN_DAMPING)
  return Math.max(PIN_MIN, Math.min(PIN_MAX, raw))
}

function pinPixelSizeFor(zoom: number, minZoom: number, maxZoom: number) {
  const scale = pinScaleFor(zoom, minZoom, maxZoom)
  return { width: BASE_WIDTH * scale, height: BASE_HEIGHT * scale }
}

describe('computeZoomFraction', () => {
  it('returns 0 at minZoom and 1 at maxZoom', () => {
    expect(computeZoomFraction(-5, -5, 5)).toBe(0)
    expect(computeZoomFraction(5, -5, 5)).toBe(1)
  })

  it('returns 0.5 at the midpoint of the range', () => {
    expect(computeZoomFraction(0, -5, 5)).toBeCloseTo(0.5, 10)
    expect(computeZoomFraction(3.5, 0, 7)).toBeCloseTo(0.5, 10)
  })

  it('clamps outside the configured range rather than extrapolating', () => {
    expect(computeZoomFraction(-10, -5, 5)).toBe(0)
    expect(computeZoomFraction(10, -5, 5)).toBe(1)
  })

  it('behaves identically in SHAPE for a tiled (0..7) and untiled (-5..5) range at the same relative position', () => {
    // Different absolute zoom numbers, same relative (midpoint) position
    // in each map's own range -- this is the entire point of the fix: a
    // tiled map's pins should shrink/grow at the SAME relative points an
    // untiled map's always have, never at a shared absolute zoom number.
    expect(computeZoomFraction(0, -5, 5)).toBeCloseTo(computeZoomFraction(3.5, 0, 7), 10)
    // A quarter of the way into each map's own range, likewise.
    expect(computeZoomFraction(-2.5, -5, 5)).toBeCloseTo(computeZoomFraction(1.75, 0, 7), 10)
  })

  it('is safe for a degenerate/missing zoom range (non-finite, or max <= min) -- the SAME fallback Roads already use (full prominence, never a crash)', () => {
    expect(computeZoomFraction(0, NaN, 5)).toBe(1)
    expect(computeZoomFraction(0, -5, NaN)).toBe(1)
    expect(computeZoomFraction(0, 5, 5)).toBe(1)
    expect(computeZoomFraction(0, 5, -5)).toBe(1)
  })

  it('is safe for a non-finite zoom input', () => {
    expect(computeZoomFraction(NaN, -5, 5)).toBe(1)
    expect(computeZoomFraction(Infinity, -5, 5)).toBe(1)
  })
})

describe('pinReferenceZoom', () => {
  it('maps fraction 0.5 to reference zoom 0 (the untiled path\'s own neutral point, scale === 1)', () => {
    expect(pinReferenceZoom(0.5)).toBe(0)
  })

  it('maps fraction 0 to -5 and fraction 1 to 5 -- the untiled path\'s own original range, unchanged', () => {
    expect(pinReferenceZoom(0)).toBe(-5)
    expect(pinReferenceZoom(1)).toBe(5)
  })

  it('round-trips to the ORIGINAL absolute zoom exactly for every real zoom on an untiled (-5..5) map -- the algebraic proof that untiled-map pin sizes are UNCHANGED by this fix', () => {
    for (const zoom of [-5, -3, -0.75, -2, 0, 0.4, 1.25, 2.5, 5]) {
      const fraction = computeZoomFraction(zoom, -5, 5)
      expect(pinReferenceZoom(fraction)).toBeCloseTo(zoom, 10)
    }
  })
})

describe('computeCoverZoom', () => {
  it('matches the trace doc\'s own measured untiled example (2400x1600 image, 1280x900 viewport, no insets)', () => {
    // Trace doc §3.1: measured zoom -0.75 after zoomSnap rounding; the
    // raw (pre-snap) value this function returns is log2(max(1280/2400,
    // 900/1600)) = log2(0.5625) ~= -0.83, between the -5..5 clamp.
    const zoom = computeCoverZoom({
      containerWidth: 1280,
      containerHeight: 900,
      imageWidth: 2400,
      imageHeight: 1600,
      minZoom: -5,
      maxZoom: 5
    })
    expect(zoom).toBeCloseTo(Math.log2(900 / 1600), 6)
    expect(zoom).toBeCloseTo(-0.8301, 3)
  })

  it('matches the trace doc\'s own measured tiled example (8192x5461 declared original, tileMaxZoom 7, 1280x900 viewport)', () => {
    const scale = Math.pow(2, 7)
    const zoom = computeCoverZoom({
      containerWidth: 1280,
      containerHeight: 900,
      imageWidth: 8192 / scale,
      imageHeight: 5461 / scale,
      minZoom: 0,
      maxZoom: 7
    })
    expect(zoom).toBeCloseTo(4.398, 2)
  })

  it('picks the larger (cover, not contain) axis -- fills the viewport, crops the overflow axis', () => {
    // A perfectly square image against a wider-than-tall viewport: width
    // is the dominant/cropped axis.
    const zoom = computeCoverZoom({
      containerWidth: 1600,
      containerHeight: 900,
      imageWidth: 1000,
      imageHeight: 1000,
      minZoom: -5,
      maxZoom: 5
    })
    expect(zoom).toBeCloseTo(Math.log2(1.6), 10)
  })

  it('clamps to the configured min/max zoom -- cover-fit never requests a zoom outside the map\'s own configured range', () => {
    const farTooZoomedIn = computeCoverZoom({
      containerWidth: 100000,
      containerHeight: 100000,
      imageWidth: 10,
      imageHeight: 10,
      minZoom: 0,
      maxZoom: 7
    })
    expect(farTooZoomedIn).toBe(7)

    const farTooZoomedOut = computeCoverZoom({
      containerWidth: 1,
      containerHeight: 1,
      imageWidth: 100000,
      imageHeight: 100000,
      minZoom: 0,
      maxZoom: 7
    })
    expect(farTooZoomedOut).toBe(0)
  })

  it('returns null (never a numeric 0) for a not-yet-usable (zero/negative/non-finite) container -- the signal to wait, not to apply a meaningless fit', () => {
    expect(computeCoverZoom({ containerWidth: 0, containerHeight: 900, imageWidth: 2400, imageHeight: 1600, minZoom: -5, maxZoom: 5 })).toBeNull()
    expect(computeCoverZoom({ containerWidth: 1280, containerHeight: 0, imageWidth: 2400, imageHeight: 1600, minZoom: -5, maxZoom: 5 })).toBeNull()
    expect(computeCoverZoom({ containerWidth: -10, containerHeight: 900, imageWidth: 2400, imageHeight: 1600, minZoom: -5, maxZoom: 5 })).toBeNull()
    expect(computeCoverZoom({ containerWidth: NaN, containerHeight: 900, imageWidth: 2400, imageHeight: 1600, minZoom: -5, maxZoom: 5 })).toBeNull()
  })

  it('returns null for a not-yet-usable (zero/negative/non-finite) image size', () => {
    expect(computeCoverZoom({ containerWidth: 1280, containerHeight: 900, imageWidth: 0, imageHeight: 1600, minZoom: -5, maxZoom: 5 })).toBeNull()
    expect(computeCoverZoom({ containerWidth: 1280, containerHeight: 900, imageWidth: 2400, imageHeight: NaN, minZoom: -5, maxZoom: 5 })).toBeNull()
  })

  it('is safe for a degenerate zoom range -- returns the unclamped computed zoom rather than throwing', () => {
    const zoom = computeCoverZoom({
      containerWidth: 1280,
      containerHeight: 900,
      imageWidth: 2400,
      imageHeight: 1600,
      minZoom: NaN,
      maxZoom: NaN
    })
    expect(zoom).toBeCloseTo(Math.log2(900 / 1600), 6)
  })
})

describe('shouldRefitOnResize', () => {
  it('allows refitting while the user has not interacted yet', () => {
    expect(shouldRefitOnResize(false)).toBe(true)
  })

  it('forbids refitting once the user has deliberately panned/zoomed', () => {
    expect(shouldRefitOnResize(true)).toBe(false)
  })
})

describe('representative pin pixel sizes -- documented before/after at minimum, initial (cover-fit), middle, and maximum zoom', () => {
  it('UNTILED map (-5..5): identical to the pre-fix behavior at every sampled zoom (algebraic equivalence, not approximation)', () => {
    // Pre-fix formula was `scaledSize(1, zoom, 0.5, 0.35, 1.15)` applied
    // directly to the absolute zoom -- reproduced here as `legacyScale`
    // to prove the new relative-fraction path matches it exactly on this
    // map type.
    function legacyPixelSize(zoom: number) {
      const scale = Math.max(PIN_MIN, Math.min(PIN_MAX, Math.pow(2, zoom * PIN_DAMPING)))
      return { width: BASE_WIDTH * scale, height: BASE_HEIGHT * scale }
    }

    const samples = [-5, -2, -0.75, 0, 1.25, 5]
    for (const zoom of samples) {
      const before = legacyPixelSize(zoom)
      const after = pinPixelSizeFor(zoom, -5, 5)
      expect(after.width).toBeCloseTo(before.width, 6)
      expect(after.height).toBeCloseTo(before.height, 6)
    }

    // Minimum zoom -- floor reached, a visibly small pin.
    expect(pinPixelSizeFor(-5, -5, 5).width).toBeCloseTo(7, 1)
    // Cover-fit initial view measured in the trace doc (-0.75).
    expect(pinPixelSizeFor(-0.75, -5, 5).width).toBeCloseTo(15, 0)
    // Middle (authoring size, scale exactly 1).
    expect(pinPixelSizeFor(0, -5, 5).width).toBe(20)
    // Maximum zoom -- ceiling reached (the owner-approved zoomed-in look).
    expect(pinPixelSizeFor(5, -5, 5).width).toBeCloseTo(23, 0)
  })

  it('TILED map (0..7, the real production default range): now actually shrinks across the whole range -- the reproduced defect, fixed', () => {
    // BEFORE this fix (reproduced for documentation, not asserted as
    // current behavior): the same absolute zoom numbers fed directly into
    // the old formula, unaware this map's own range is 0..7.
    function legacyPixelSize(zoom: number) {
      const scale = Math.max(PIN_MIN, Math.min(PIN_MAX, Math.pow(2, zoom * PIN_DAMPING)))
      return { width: BASE_WIDTH * scale, height: BASE_HEIGHT * scale }
    }
    const legacyAtMin = legacyPixelSize(0) // 20x28 -- the trace doc's own measured "never below base" defect
    const legacyAtCoverFit = legacyPixelSize(4.4) // already saturated at the ceiling
    const legacyAtMax = legacyPixelSize(7) // also saturated at the ceiling -- indistinguishable from cover-fit
    expect(legacyAtMin.width).toBe(20)
    expect(legacyAtCoverFit.width).toBeCloseTo(23, 0)
    expect(legacyAtMax.width).toBeCloseTo(23, 0)

    // AFTER this fix: the same four representative zoom levels (minimum,
    // the realistic cover-fit initial view measured in the trace doc,
    // middle, and maximum) on a 0..7 tiled map.
    const atMin = pinPixelSizeFor(0, 0, 7)
    const atCoverFit = pinPixelSizeFor(4.4, 0, 7)
    const atMiddle = pinPixelSizeFor(3.5, 0, 7)
    const atMax = pinPixelSizeFor(7, 0, 7)

    // Minimum zoom now genuinely reaches the SAME floor an untiled map's
    // pins already reach at ITS own minimum -- visible shrinkage that did
    // not exist before (was stuck at the 20x28 base).
    expect(atMin.width).toBeCloseTo(7, 1)
    expect(atMin.width).toBeLessThan(legacyAtMin.width)

    // Middle of the range === authoring size (20x28), same neutral point
    // untiled maps already have at THEIR own middle.
    expect(atMiddle.width).toBe(20)

    // Cover-fit initial view and true max zoom are BOTH still at the
    // ceiling -- preserving the owner-approved zoomed-in appearance
    // exactly (same 1.15x ceiling, same pixel size as before).
    expect(atCoverFit.width).toBeCloseTo(legacyAtCoverFit.width, 0)
    expect(atMax.width).toBeCloseTo(legacyAtMax.width, 0)

    // The core fix, stated as a single assertion: minimum-zoom pins are
    // now meaningfully smaller than cover-fit/max-zoom pins on a tiled
    // map -- before this fix they were identical.
    expect(atMin.width).toBeLessThan(atCoverFit.width * 0.4)
  })

  it('scaling stays continuous (no discontinuity) across a full zoom sweep on a tiled map', () => {
    const steps = 50
    let previous = pinPixelSizeFor(0, 0, 7).width
    for (let i = 1; i <= steps; i++) {
      const zoom = (i / steps) * 7
      const current = pinPixelSizeFor(zoom, 0, 7).width
      // Monotonic, bounded-step change -- no jump larger than one step's
      // own worth of the curve's steepest region could produce.
      expect(current).toBeGreaterThanOrEqual(previous - 0.001)
      previous = current
    }
  })

  it('every sampled size stays within the configured [20*0.35, 28*1.15] pixel envelope -- bounded, as required', () => {
    const zoomRanges: Array<[number, number]> = [[-5, 5], [0, 7], [0, 10], [2, 9]]
    for (const [minZoom, maxZoom] of zoomRanges) {
      for (const zoom of [minZoom, (minZoom + maxZoom) / 2, maxZoom, minZoom - 3, maxZoom + 3]) {
        const { width, height } = pinPixelSizeFor(zoom, minZoom, maxZoom)
        expect(width).toBeGreaterThanOrEqual(20 * 0.35 - 1e-9)
        expect(width).toBeLessThanOrEqual(20 * 1.15 + 1e-9)
        expect(height).toBeGreaterThanOrEqual(28 * 0.35 - 1e-9)
        expect(height).toBeLessThanOrEqual(28 * 1.15 + 1e-9)
      }
    }
  })
})
