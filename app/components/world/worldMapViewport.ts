// World Map viewport math -- Map Starting View / Pin Scaling fix pass.
// Pure functions only (no Leaflet, no DOM) extracted out of
// WorldMapLeaflet.client.vue so the calculations the trace doc
// (.github/docs/architecture/map-starting-view-and-pin-scaling-trace.md)
// identified as the actual bugs are independently unit-testable, following
// this directory's own established pattern of a sibling pure-logic module
// next to a renderer component (see authoredD20Orientation.ts).

// ---------------------------------------------------------------------------
// Map-relative zoom fraction -- the SAME convention Roads already use
// (roadZoomFraction in WorldMapLeaflet.client.vue), extracted here so Pins
// can reuse the identical function rather than a second, parallel
// implementation. 0 at this map's own configured minZoom, 1 at its own
// maxZoom -- never an absolute zoom number, so this behaves identically
// whether the underlying map is a small untiled raster image (a fixed,
// narrow -5..5 range) or a large tiled one (whatever tileMinZoom/
// tileMaxZoom that map was generated with, commonly 0..7).
//
// Degenerate range (non-finite, or max <= min) returns 1 -- the SAME
// fallback Roads already chose (full prominence/size rather than hiding or
// throwing), kept consistent here rather than inventing a second policy.
// ---------------------------------------------------------------------------
export function computeZoomFraction(zoom: number, minZoom: number, maxZoom: number): number {
  if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom) || maxZoom <= minZoom) return 1
  if (!Number.isFinite(zoom)) return 1

  return Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)))
}

// ---------------------------------------------------------------------------
// Pin scaling -- map-relative replacement for the old absolute-zero
// calibration (ZOOM_SCALE_REFERENCE = 0 in WorldMapLeaflet.client.vue),
// which was tuned ONLY against the untiled path's own fixed -5..5 range and
// silently broke on a tiled map's own, unrelated absolute zoom numbers (see
// the trace doc's own measured §3).
//
// PROVABLY BEHAVIOR-PRESERVING ON EVERY EXISTING UNTILED MAP. For an
// untiled map (minZoom -5, maxZoom 5, so fraction = (zoom + 5) / 10),
// `pinReferenceZoom(fraction) = fraction * 10 - 5` algebraically reduces
// back to exactly `zoom` -- i.e. pinReferenceZoom(computeZoomFraction(zoom,
// -5, 5)) === zoom for every real zoom value. Feeding that back into the
// UNCHANGED, already-owner-approved zoomScaleFactor/scaledSize formula
// (damping 0.5, clamp [0.35, 1.15]) therefore produces the EXACT SAME pixel
// size at every zoom level on every untiled map as before this change --
// confirmed algebraically, not just approximately, and exercised directly
// in worldMapViewport.test.ts. For a TILED map, the same fraction is now
// computed against THAT map's own tileMinZoom/tileMaxZoom instead of the
// untiled range, so the identical formula shrinks/grows relative to what
// that map can actually show, instead of saturating at the ceiling across
// nearly its whole practical range (the reproduced defect).
//
// 10 and -5 are not new tuning knobs -- they are exactly the width and
// floor of the untiled path's own pre-existing minZoom/maxZoom, written
// out so this reduction is the SAME reference frame the original tuning
// constants (damping/min/max) were already calibrated against, never a
// second, independently-chosen scale.
const PIN_REFERENCE_RANGE_WIDTH = 10
const PIN_REFERENCE_RANGE_FLOOR = -5

export function pinReferenceZoom(zoomFraction: number): number {
  return zoomFraction * PIN_REFERENCE_RANGE_WIDTH + PIN_REFERENCE_RANGE_FLOOR
}

// ---------------------------------------------------------------------------
// Cover-fit zoom -- pure extraction of WorldMapLeaflet.client.vue's own
// getCoverZoom, so the "fill the viewport, crop the overflow axis" math
// (CSS background-size: cover's equivalent) can be verified directly
// without mocking Leaflet. `containerWidth` is the ALREADY inset-adjusted
// visible width (the caller subtracts viewportInsets before calling this --
// see getCoverZoom's own comment in the component for why the two now
// agree with insetMaxBounds/visibleCenter instead of disagreeing, the
// trace doc's own §2.1 finding).
//
// Returns `null` -- never a numeric 0 -- when the inputs are not yet
// usable (zero/negative/non-finite container or image dimensions), so a
// caller can tell "not ready, wait and retry" apart from "a real,
// computed cover zoom that happens to be 0". This is what lets the
// initial fit WAIT for valid geometry (the resize-observer path in the
// component) instead of silently computing a meaningless zoom against a
// transiently-0-sized container.
//
// Policy, explicit: the result is clamped to [minZoom, maxZoom] exactly
// as before. If the ideal cover-fit zoom would exceed a map's own
// configured limits (e.g. an unusually small image against a very large
// viewport), the clamp means the map will NOT fully cover the viewport in
// that case -- intentional. The alternative (zooming past what tiles
// exist for, or rewriting a map's configured zoom limits to make cover
// always achievable) is explicitly out of scope; this function never
// requests a zoom outside the range it is given.
export function computeCoverZoom(input: {
  containerWidth: number
  containerHeight: number
  imageWidth: number
  imageHeight: number
  minZoom: number
  maxZoom: number
}): number | null {
  const { containerWidth, containerHeight, imageWidth, imageHeight, minZoom, maxZoom } = input

  if (
    !Number.isFinite(containerWidth) || containerWidth <= 0 ||
    !Number.isFinite(containerHeight) || containerHeight <= 0 ||
    !Number.isFinite(imageWidth) || imageWidth <= 0 ||
    !Number.isFinite(imageHeight) || imageHeight <= 0
  ) {
    return null
  }

  const coverScale = Math.max(containerWidth / imageWidth, containerHeight / imageHeight)
  const zoom = Math.log2(coverScale)

  if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom) || maxZoom <= minZoom) return zoom

  return Math.max(minZoom, Math.min(maxZoom, zoom))
}

// ---------------------------------------------------------------------------
// Resize policy -- "while still in the initial automatic-fit state,
// resizing may refit; after intentional user pan/zoom, resizing must
// preserve their chosen view as far as the current bounds allow." One
// named, tested decision point rather than an inline condition at each of
// the (two) call sites that need to agree on it.
// ---------------------------------------------------------------------------
export function shouldRefitOnResize(hasUserInteracted: boolean): boolean {
  return !hasUserInteracted
}
