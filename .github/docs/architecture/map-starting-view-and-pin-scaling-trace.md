# Map Starting View, Clamping, and Pin Scaling — Trace Report

Read-only investigation. No implementation, no commit, no production access. Both issues were
reported from real gameplay:

1. The map starts too far zoomed out.
2. Pins are much too large relative to the map when zoomed out; their zoomed-in appearance is
   acceptable, but they do not scale as expected across zoom levels.

## 1. Active renderer and scope

`app/components/world/WorldMapLeaflet.client.vue` is the only active renderer (client-only, Leaflet
-backed, `CRS.Simple`). It is mounted from `app/pages/worlds/[id]/index.vue:1508` behind
`v-if="mapImageUrl"`, keyed `` `${worldId}-${selectedMapSlug}-${mapImageUrl}` `` — switching maps
**destroys and recreates the whole component** (a fresh `onMounted`), it never updates in place
despite a `watch` on `props.mapImageUrl`/tile props existing in the renderer (`:1121-1135`) for that
purpose; that watch is effectively dead code from this call site, confirmed by the `:key`, not
exercised in this trace.

There is no retired/alternative renderer in the tree to confuse this with — `grep` for `L.map(` /
`leaflet` across `app/components` returns only this one file. Thumbnails are not involved in bounds
or dimensions: the untiled path calls `loadImageDimensions(props.mapImageUrl)` (`:545-551`, a real
`new Image()` load) to get the **original** file's pixel size, and the tiled path uses
`props.tileOriginalWidth`/`tileOriginalHeight` (`:1046-1047`), which `server/api/worlds/[id]/maps/upload.post.ts`
populates from `sharp(...).metadata()` on the **original** upload (`server/utils/map-tiles.ts:40-44`) —
never a derived thumbnail.

## 2. Initial fit, zoom, and clamping — full call chain

`renderMap()` (`:1031-1110`), the only place the starting view is computed, every time this component
mounts:

1. `ensureMap()` constructs `L.map(rootEl.value, { crs: L.CRS.Simple, minZoom: -5, maxZoom: 5,
   zoomSnap: 0.25, ... })` (`:575-586`) — **fixed, hardcoded `-5..5`** range for the untiled path.
2. For a tiled map, `minZoom`/`maxZoom` are then immediately overridden per-map from
   `props.tileMinZoom`/`tileMaxZoom` (`:1059-1063`) — in production these come from
   `server/api/worlds/[id]/maps/upload.post.ts:62-65`, whose own defaults are **`tileMinZoom: 0`,
   `tileMaxZoom: 7`** (clamped `[0,10]`), confirmed by reading the upload route directly, not assumed.
3. `currentBounds` is computed from the real dimensions (§1), and for a tiled map is **pre-divided by
   `2^tileMaxZoom`** (`mapCoordinateScale()`, `:566-568`) so that at `zoom === tileMaxZoom` the map
   shows the source image at native 1:1 resolution — i.e. **zoom 0 is nowhere near "fit the whole
   map"** for a tiled map; it is simply the bottom of that map's own configured range.
4. `getCoverZoom(currentBounds)` (`:1013-1029`) computes the starting zoom: `coverScale =
   max(size.x/imageWidth, size.y/imageHeight)`, `zoom = log2(coverScale)`, clamped to
   `[map.getMinZoom(), map.getMaxZoom()]`. This is a **cover** fit (CSS `background-size: cover`
   equivalent — fill the viewport, crop the overflow axis), not **contain** (`background-size:
   contain`, fit the whole map with letterboxing) — `Math.max` is the cover choice; `Math.min` would be
   contain. This matters for §4's recommendation.
5. `map.setMaxBounds(insetMaxBounds(startZoom))`, `map.setView(visibleCenter(center, startZoom),
   startZoom, { animate: false })` (`:1094-1096`) apply it, then exactly one
   `requestAnimationFrame` (`:1100-1109`) calls `map.invalidateSize()`, re-applies `maxBounds`, and
   re-`setView`s — **with the SAME, already-computed `startZoom` value, never a fresh
   `getCoverZoom()` call**. This is the one and only self-correction step this component has.

**No restored/persisted viewport state exists anywhere in this stack** — confirmed by grepping
`index.vue` and the renderer for `localStorage`/`sessionStorage`/`useCookie`/any "last zoom" concept:
none. So the brief's own "what wins when initial fit, configured zoom, and restored state disagree"
does not apply here — there is nothing to disagree with; the fresh cover-fit computation is the
*only* thing that ever sets the initial view, every single mount.

**Resize handling**: there is no `ResizeObserver` anywhere in this component (confirmed by grep).
Leaflet itself auto-binds a `window` `resize` listener internally and will call its own internal
resize bookkeeping, but that preserves the *current* zoom/center — it does not re-fit. So an actual
browser window resize after load is not a problem (and re-fitting on every resize would be
undesirable UX regardless); the **only** place a wrong container size can leak into a wrong zoom is
the one-shot computation in step 4 above, at the exact moment of mount.

**Rail/panel open-close**: on the World Map page specifically, `pageKey === 'world-map'` makes
`isFullBleedMap` true (`app/layouts/world-workspace.vue:215`), which sets `--wksp-cols:
minmax(0,1fr)` (`:220`) — the map's grid cell is **always the full available width**; the app's left
nav becomes a `fixed`/overlaid panel on this page (`sidebarWrapperDesktopClass`, `:245`), not an
in-flow grid column. Confirmed no CSS `transition` touches the grid container or that map cell
(`grep transition` on the layout only matches the mobile drawer's `translate-x` and a background
fade — neither affects the map container's box size). **This specific layout therefore does not
create the race I initially hypothesized** (sidebar grid-column width settling asynchronously); that
hypothesis is ruled out by reading the layout, not merely assumed.

### 2.1 A real, confirmed (but wrongly-signed) inconsistency: zoom ignores viewport insets, pan/center do not

The floating sidebar's covered width is tracked as `viewportInsets.left` (`app/pages/worlds/[id]/index.vue:868`,
`--eldra-map-inset-left: 80px` collapsed / `292px` expanded, `world-workspace.vue:228`) and **is**
accounted for by `insetMaxBounds()`/`visibleCenter()` (`:941-971`) when panning/centering — but
**`getCoverZoom()` uses the full, uninset `map.getSize()`** (step 4 above has no inset awareness at
all). I confirmed via live measurement (§3) that the `.leaflet-container` itself spans the **full**
viewport width underneath the floating sidebar (1280px in my 1280×900 test, not ~988px), exactly as
the code implies.

I worked the algebra and verified the **direction** this discrepancy pushes the initial zoom: using
the full (uninset) width can only ever make `coverScale` **larger or equal**, never smaller, than
computing it against the true visible width — i.e. this specific inconsistency biases the initial
zoom **slightly more zoomed-IN** than ideal (in the aspect-ratio cases where the inset-covered axis is
the dominant one), the **opposite** of "starts too far zoomed out." My own 2400×1600 test image
happened to be in the regime where the two computations agree exactly (height, not width, was
already the dominant/cropped axis), so I could not get a live pixel delta from it either way — but
the sign of the effect is settled by the formula itself, not a guess. **This is a real, worth-fixing
inconsistency (zoom and recentring should agree on what "visible" means) but it is not the explanation
for issue #1.**

### 2.2 What I could, and could not, reproduce for issue #1

Live-measured (headless Chromium against a disposable instance; see §3): a 1280×900 fresh load,
hard refresh, and a 390×844 narrow-viewport fresh load **all** produced a `.leaflet-container` of
the correct, matching size and a `getCoverZoom` result consistent with that size to three decimal
places (cross-checked by hand). **I could not force a wrong-sized-container race in this
environment.** Per the brief's own instruction not to present a theoretical concern as the reproduced
root cause: **issue #1 is not confirmed reproduced here.**

What *is* confirmed, by reading the code alone, is the structural precondition for such a race: the
fit is computed exactly once, synchronously, at mount, from whatever `rootEl.value.clientWidth/
clientHeight` happens to read at that instant, with no later recomputation if that instant's reading
turns out to be transient. The most plausible real-world trigger I can name without owner evidence is
a mobile browser's dynamic toolbar collapsing (changing effective viewport height) in the moments
after `onMounted`'s `await nextTick()` resolves but before the one `requestAnimationFrame` correction
fires with a *stale* zoom number — this is a hypothesis for the owner to confirm against the actual
device/browser where it was seen, not a measured defect.

## 3. Pin sizing — full chain, confirmed mathematically and by live measurement

`renderPins()` (`:885-927`): authoring size is a fixed base icon of **20×28px**. The only zoom-driven
scaling is `scaledSize(1, map.getZoom(), PIN_ZOOM_TUNING.damping, PIN_ZOOM_TUNING.min,
PIN_ZOOM_TUNING.max)` (`:892`), reusing the generic helper Roads also use:

```
zoomScaleFactor(zoom, damping) = 2 ^ ((zoom - ZOOM_SCALE_REFERENCE) * damping)   // :43-45
scaledSize(size, zoom, damping, min, max) = clamp(size * zoomScaleFactor(...), min, max)  // :47-50
PIN_ZOOM_TUNING = { damping: 0.5, min: 0.35, max: 1.15 }                          // :128-132
ZOOM_SCALE_REFERENCE = 0                                                           // :41
```

`iconSize`/`iconAnchor` are passed straight to Leaflet's `L.divIcon` in **CSS pixels** — this is the
real rendered size *and* the real click/interaction hit area (no separate, larger touch target; a
shrunk pin is also a shrunk click target). The tooltip/label and selection ring are not independently
scaled; the selected state only changes the icon's HTML/color via `makePinHtml`, not its size. There
is **no Play/Build difference in pin visual size** — `buildMode` only changes `map.getContainer().style
.cursor` (`:1201-1207`); `renderPins()` never reads it.

**The bug**: `ZOOM_SCALE_REFERENCE = 0` and the `[0.35, 1.15]` clamp band are a fixed, absolute-zoom
calibration. For the untiled path this coincides with the middle of that map type's own fixed `-5..5`
range, so it behaves reasonably. For a **tiled** map, the usable range is **`tileMinZoom..tileMaxZoom`**
(production default `0..7`, §2) — entirely disconnected from where `0` sits, and the *cover-fit*
starting zoom for a realistically large tiled map lands well into the upper half of that range (see
measurement below), where `zoomScaleFactor` is already saturated at its `1.15×` ceiling. Roads avoid
exactly this trap via `roadZoomFraction()` (`:79-88`), which normalizes against **this map's own**
`getMinZoom()`/`getMaxZoom()` rather than an absolute reference — pins do not use an equivalent
relative measure, which is the root mechanical cause of "they do not scale as expected."

### 3.1 Live measurement (headless Chromium, disposable instance — see §5 for fixture detail)

**Untiled map** (2400×1600 real image, fixed `-5..5` range):

| State | Measured zoom | Pin size (px) |
| --- | --- | --- |
| Fresh load / hard refresh (cover-fit, 1280×900) | −0.75 | 15×22 |
| Zoomed in (6 wheel notches) | 1.25 | 23×32 *(at the 1.15× ceiling)* |
| Zoomed out (14 wheel notches back) | −2.0 | 10×14 |
| Narrow viewport (390×844) fresh load | −1.0 | 14×20 |

Behaves acceptably here: the cover-fit start (−0.75) sits inside the scaling band, and the pin visibly
shrinks on further zoom-out. (The ceiling is still reached quickly on zoom-in, around zoom ≈ 0.39 —
a smaller version of the same saturation, but the owner explicitly said the zoomed-in look is fine.)

**Tiled map** (8192×5461 declared original size, `tile_min_zoom 0` / `tile_max_zoom 7` — the real
production defaults, §2):

| State | Pin size (px) |
| --- | --- |
| Fresh load (cover-fit zoom ≈ 4.4, computed by hand from the real numbers: `coverScale = max(1280/64, 900/42.66) ≈ 21.1`, `log2 ≈ 4.4`) | **23×32 — already at the 1.15× ceiling** |
| Zoomed all the way out (true `minZoom = 0`) | 20×28 *(scale exactly 1.0 — the base size, never below it anywhere in this map's whole range)* |
| Zoomed all the way in (true `maxZoom = 7`) | 23×32 *(identical to fresh load)* |

This is the reproduced, measured confirmation of issue #2: on a realistically-sized tiled map, the pin
renders at its **maximum** size on first load, stays there through zoom-in, and the *only* place it
is ever smaller is the single absolute floor of the map's range — where it is still never smaller
than its own undamped base size (20×28), because this map's zoom range (`0..7`) never reaches far
enough negative (`≈ −3.03`) to engage the `0.35` floor at all. Pin size is, for all practical purposes,
**constant** across this map's entire usable range — exactly "they do not scale as expected across
zoom levels," reproduced with real pixel numbers rather than inferred.

## 4. Recommended smallest coherent fix (not implemented)

### Issue #1 — starting view / clamping
- Keep the **cover-fit strategy** (`Math.max`) — it is already more conservative (more zoomed-in, never
  more zoomed-out) than a contain fit would be, and the measured formula behaves correctly whenever
  the container size is correct. I found no evidence the formula or the `-5..5` / `0..7` constants
  themselves are wrong.
- Make the viewport-inset awareness consistent: have `getCoverZoom()` subtract the same
  `viewportInsets` width `insetMaxBounds()`/`visibleCenter()` already use, so zoom and
  centering agree on what "visible" means (§2.1). Small, self-contained, and fixes a real (if
  wrongly-signed-for-this-complaint) inconsistency while it's being looked at.
- Add a genuine recomputation path instead of only re-applying the same `startZoom`: either a
  `ResizeObserver` on `rootEl` that re-runs `getCoverZoom()`/`setView()` once, the first time the
  observed size differs meaningfully from what was used for the initial fit (not on every later
  resize — only to correct a wrong *first* measurement), or at minimum recompute `getCoverZoom()`
  fresh inside the existing `requestAnimationFrame` callback instead of reusing the closed-over
  `startZoom`. This directly targets the race in §2.2 without changing steady-state resize behavior.
- Tradeoff to state plainly to the owner: cover-fit **always** crops one axis when the map's aspect
  ratio does not match the viewport's — that is inherent to "fill the screen, no letterboxing" and is
  not a bug. If what's actually wanted is "show the whole map first, letterboxed," that is a
  **different, contain-based** starting-view policy (`Math.min` instead of `Math.max`) — a product
  decision, not a fix to the current one, and worth confirming with the owner before changing it,
  since nothing today suggests contain was the intent.

### Issue #2 — pin scaling
- Replace pins' absolute-zoom reference with a **relative** one, the same shape Roads already use
  (`roadZoomFraction`, §3) — fraction of *this map's own* `getMinZoom()..getMaxZoom()` range, not a
  hardcoded `0`. This is the minimal change: `scaledSize`/`zoomScaleFactor`'s signature can stay the
  same; only what's passed as the "zoom" input changes from `map.getZoom()` to a per-map-normalized
  equivalent, with the tuning constants (`damping 0.5`, `min 0.35`, `max 1.15`) re-expressed against a
  0..1 fraction instead of an absolute zoom delta. This preserves the owner-approved zoomed-in
  appearance at the top of a map's own range while finally giving zoomed-out views on large tiled maps
  room to actually shrink, matching Roads' own established, already-correct pattern — not inventing a
  second scaling policy.
- Keep the visual-size floor separate from the touch-target question (§3): if accessibility is a
  concern once pins can shrink further, that is a **second**, independent decision (e.g. a larger
  invisible hit-area via Leaflet's own `iconSize` vs. a separate hit layer) — out of scope for this
  trace's own fix, flagged for the owner rather than silently bundled in.
- No data migration: nothing here touches persisted pin coordinates, Scene Graph objects, map
  records, or stored zoom (there is none to migrate, §2). This is a renderer-only change, exactly like
  Roads' own existing scaling policy already is.

### Files/functions affected (for the eventual implementation)
- `app/components/world/WorldMapLeaflet.client.vue`: `getCoverZoom` (inset-awareness), `renderMap`'s
  `requestAnimationFrame` callback (recompute instead of reuse), a new resize-observation hook, and
  `renderPins`'s zoom input (relative fraction instead of absolute `map.getZoom()`).
- No server/API changes anticipated; no schema changes.

### Focused regression and browser acceptance plan (for whoever implements §4)
- Unit/pure-function coverage for the new relative-zoom-fraction pin scale, mirroring
  `roadZoomFraction`'s own existing test coverage if any exists, across both a `-5..5` and a `0..7`
  (or other large) configured range.
- Browser acceptance, both untiled and tiled fixtures (reuse the fixture technique in §5): fresh load,
  hard refresh, map switch, zoomed-out/middle/zoomed-in pin size samples, desktop and narrow
  viewport, confirming (a) the owner's liked zoomed-in appearance is unchanged, (b) pins now visibly
  shrink at the zoomed-out end of a **tiled** map's range, (c) the starting zoom is unchanged or only
  minimally adjusted (the inset fix) on existing untiled maps, (d) Play vs. Build mode pin size remains
  identical.
- Confirm no regression to Roads' own `roadZoomFraction`-based visibility gating if `scaledSize`'s
  shared signature changes at all.

## 5. Reproduction fixtures (disposable instance only, never production)

The disposable Directus instance (`127.0.0.1:18055`) used by prior sessions in this repo had **no**
`maps` or `map_pins` collection at all (confirmed: neither appears in `/collections`, and no
`scripts/directus/*.mjs` script provisions them either — a gap in this repo's own schema-provisioning
scripts worth flagging separately, not in this trace's scope). I provisioned both collections
directly against the disposable instance only (uuid-keyed `maps`, matching the real schema's own
convention — confirmed indirectly via `scene_layer_objects.map_id`'s column type rejecting an integer
id), created one World with an untiled map (a real 2400×1600 generated placeholder image, so
`loadImageDimensions` reads a realistic size) and one tiled map (declared `8192×5461`,
`tile_min_zoom 0`/`tile_max_zoom 7` — the real upload-route defaults; tile *images* were never
generated, which is irrelevant to this trace since it concerns the zoom/bounds/pin-size math, not
raster content), and one pin on each. Measured via a cached headless Chromium
(`playwright-core`, no network/install) reading real DOM (`.leaflet-container`, `.leaflet-image-layer`,
`.eldra-leaflet-pin`) bounding boxes — never a source-code edit, nothing added to the app itself.
All of this is scratch infrastructure in a disposable environment; nothing under this repo's own
`scripts/directus/` was modified, and no production system was touched.

## 6. Weekend backlog (recorded per the owner's agreed order; nothing below is fixed)

No existing doc in `.github/docs/architecture/` already tracks this general, cross-cutting list (the
two closest-named docs, `character-decisions-presentation-backlog.md` and
`content-publishing-backlog.md`, are each scoped to one specific subsystem already, and the former is
currently mid-edit by unrelated, uncommitted work this session preserved untouched) — recorded here
instead, as the only reasonably-sized home.

Agreed order:
1. Map starting view/clamping and pin scaling — this trace. Not fixed.
2. Species/Class context usefulness, raw JSON in Class descriptions, and missing Enemy context
   images. Not started.
3. World-default background inheritance, Show Background toggle, and gold navigation-scrollbar
   styling. Not started.
4. World-wide search with results opening the right-hand context rail and an optional full-article
   link. Not started.
5. Media usage visibility, followed by multi-select/delete. Not started.
6. Music design/mock-up, then implementation. Not started.

Audio requirement already decided (not started, not begun this pass): GM-controlled synchronized
table audio for all players, map-assigned defaults, manual battle override, personal player
volume/mute, late-join synchronization, and an explicit Enable Table Audio interaction when needed.

Character Roll Tray already collapses — confirmed working, not listed as unfinished.

## 7. Status (investigation pass)

**Investigation only. No code changed.** Issue #2 (pin scaling) is confirmed and measured. Issue #1
(starting zoom) has a plausible, code-confirmed structural cause (a one-shot, non-recomputed initial
fit with no resize-correction path) but could not be force-reproduced in this environment — flagged as
a hypothesis for the owner to confirm against the real device/scenario where it was seen, not
presented as settled. A secondary, confirmed-but-wrongly-signed inconsistency (zoom ignores viewport
insets that pan/centering already account for) was found and is worth fixing alongside #1 regardless.

## 8. Implementation (bounded fixes from §4, this pass)

Implements the two fixes §4 recommended. Does not repeat the investigation above or expand scope
beyond it.

### 8.1 Pin scaling — map-relative, not absolute-zero

New pure module `app/components/world/worldMapViewport.ts` (mirroring this directory's own
established sibling-pure-module pattern, e.g. `authoredD20Orientation.ts`):
- `computeZoomFraction(zoom, minZoom, maxZoom)` — the exact 0..1 fraction logic
  `roadZoomFraction` already had, extracted so Pins reuse the IDENTICAL function instead of a second,
  parallel implementation (the "reuse Roads' established zoom-range convention" the task asked for).
  Degenerate range (non-finite, or max <= min) returns `1`, the same fallback Roads already chose.
- `pinReferenceZoom(fraction)` — maps that 0..1 fraction back onto the untiled path's own original
  `-5..5` reference frame (`fraction * 10 - 5`). This is the entire fix: `renderPins()` now computes
  `pinReferenceZoom(computeZoomFraction(map.getZoom(), map.getMinZoom(), map.getMaxZoom()))` and
  passes THAT into the existing, completely unchanged `scaledSize`/`zoomScaleFactor`/`PIN_ZOOM_TUNING`
  (damping 0.5, clamp `[0.35, 1.15]`), instead of passing `map.getZoom()` directly. Algebraically, for
  any untiled map (`minZoom -5, maxZoom 5`) this composition reduces to exactly the original absolute
  zoom — proven in `worldMapViewport.test.ts`'s own round-trip test, not just asserted by eye. For a
  tiled map, the same formula now operates on that map's own range instead of a shared absolute scale.
- `computeCoverZoom(...)` and `shouldRefitOnResize(...)` — see 8.2.

**Representative pixel sizes, measured in a real browser (headless Chromium, disposable instance,
base 20x28 icon)**:

| Map type | Minimum zoom | Initial (cover-fit) | Maximum zoom |
| --- | --- | --- | --- |
| Tiled (0..7, production defaults) | **7x10** (was stuck at 20x28 before this fix — never shrank) | 23x32 (ceiling, unchanged) | 23x32 (ceiling, unchanged) |
| Untiled (-5..5) | 7x10 (unchanged) | 15x22 (unchanged) | 23x32 (ceiling, unchanged) |

The owner-approved zoomed-in appearance (23x32, the 1.15x ceiling) is pixel-identical before and after
this change on both map types. The reproduced defect — a tiled map's pins stuck at that same ceiling
across its ENTIRE practical range, never shrinking — is fixed: minimum zoom now reaches the same 7x10
floor an untiled map already had, and the transition between is continuous (verified by a 50-step
sweep in `worldMapViewport.test.ts`, no discontinuity).

**Anchors/position/selection/labels/permissions**: unchanged — the fix touches only the `width`/
`height` scale multiplier passed into the existing `L.divIcon`/`iconSize`/`iconAnchor` call; the pin's
`L.latLng`, click handler, tooltip, and `makePinHtml` selected-state logic are untouched. Pin dragging
was searched for and does not exist anywhere in this codebase today (confirmed by grep for
`draggable`/`dragend` in this component and `index.vue`) — nothing to preserve there, nothing to
newly implement; the brief's own "preserve... dragging" is trivially satisfied.

**Visual size vs. interaction target**: the pin's `iconSize` IS its own click/hit area (Leaflet's
`divIcon` has no separate, larger hit region) — this was already true before this change and is
unchanged by it. At the new 7x10 floor (same floor the untiled path already reached before this fix)
the click target is objectively small; this is flagged, not silently bundled into a second fix (the
brief's own §1: "a second, independent decision... out of scope for this trace's own fix"). Verified in
the browser that a pin remains clickable at a deliberately zoomed-in level (§8.4 below); the floor case
was not separately click-tested this pass since it is numerically unchanged from pre-existing untiled
behavior.

### 8.2 Viewport fit / resize

`getCoverZoom` now subtracts `viewportInsets` before computing cover scale (`containerWidth = size.x -
left - right`), delegating the actual math to the new pure `computeCoverZoom`, which returns `null`
(never a numeric `0`) when the container/image geometry isn't usable yet — this is what lets the
initial fit WAIT rather than apply a meaningless zoom. `insetMaxBounds`/`visibleCenter` already
accounted for this same inset; they now agree with zoom about what "visible" means (the trace doc's
own §2.1 finding), consistent with the stated cover-fit policy (`Math.max`, unchanged) and its own
explicit clamp-to-configured-limits behavior (also unchanged, now documented directly in
`computeCoverZoom`'s own header).

**Interaction tracking** (`hasUserInteracted`, a plain per-mount `let`, reset for free on every
remount by Vue's own `<script setup>` instantiation model — switching maps already forces a remount
via `index.vue`'s own `:key`): a `zoomend moveend` listener sets it `true`, UNLESS the view change was
this component's own programmatic one. Programmatic calls are wrapped in a nesting-safe depth counter
(`withProgrammaticViewChange`) rather than a boolean, so a correction that itself makes several nested
internal calls (bounds padding, then the view) in one tick can never be misread as a user gesture by a
premature reset.

**`ResizeObserver`** set up once in `onMounted` (observing `rootEl`), torn down in `onBeforeUnmount`
alongside the existing `map.remove()`. Its callback:
- always calls `map.invalidateSize()` (Leaflet's own within-bounds correction, wrapped as
  programmatic);
- while `!hasUserInteracted` (`shouldRefitOnResize`), recomputes `getCoverZoom` fresh from the
  CURRENT container size and applies it (`attemptInitialFit`) — "resizing may refit" while still in
  the automatic-fit state, satisfied, and this is also what makes the initial fit itself robust: if the
  container's size isn't usable yet at mount (the one case this pass could not force-reproduce, see
  §2.2 above), this observer's own first callback is what completes the fit once it is, with no bogus
  intermediate zoom ever applied;
- once `hasUserInteracted`, instead only keeps bounds padding in sync (`applyMaxBounds`) — the user's
  chosen view is preserved as far as current bounds allow (Leaflet's own `invalidateSize` default
  behavior), never reset to cover-fit.

`renderMap()` still attempts the fit synchronously once, immediately, as a fast path (no visible delay
in the common case this pass's own measurements confirm is in fact the common case) — the
`ResizeObserver` is the robustness net, not the only path. The old one-shot
`requestAnimationFrame` that re-applied the SAME closed-over `startZoom` (never recomputing it) is
removed entirely; every re-application now goes through `attemptInitialFit`'s fresh computation.

No feedback loop is possible by construction: nothing this component does changes `rootEl`'s own box
size (it is sized by its parent, `h-full w-full` inside `absolute inset-0`), so observing it can never
trigger another resize of itself.

### 8.3 What changed vs. what didn't

Unchanged, confirmed by reading the diff: stored pin/map coordinates, original image dimensions, tile
geometry/tile-layer configuration, image overlays, roads, Scene Graph hierarchy, permissions/capability
checks, the cover-fit policy itself, and the configured zoom-limit clamp. No schema change, no
production access, no stored-setting rewrite. `git diff --check` is clean.

### 8.4 Verification

**Unit** (`tests/components/world/worldMapViewport.test.ts`, 22 tests, all passing): zoom-fraction
boundary/midpoint/clamping/degenerate-range behavior; the untiled-equivalence round-trip proof;
cover-zoom matching this doc's own §3.1 measured examples by hand-computed value, cover-vs-contain
axis selection, configured-limit clamping, and the `null`-for-not-ready contract; the resize policy
function; and a representative before/after pixel-size table at minimum/initial/middle/maximum zoom
for both a tiled and an untiled range, plus a 50-step continuity sweep and an envelope-bounds check
across four different configured ranges.

**Real browser** (headless Chromium, disposable instance, 4 fresh fixture maps — tiled and untiled,
landscape and portrait, one pin each, none reused from the investigation pass's own fixtures): 28/28
checks passed —
- fresh load, hard refresh, and a 390x844 narrow viewport all render a correctly-sized container and
  exactly one pin, for all four map type/orientation combinations;
- a container resize BEFORE any interaction genuinely refits: inferred zoom moved from -0.750 (at
  1280x900) to -1.749 (at 640x480), matching the expected cover-fit formula for the new size to within
  0.3 of a zoom level;
- a container resize AFTER a deliberate zoom-in preserves the chosen view exactly: inferred zoom and
  pin pixel size were IDENTICAL before (1.250 / 23x32) and after (1.250 / 23x32) the resize — no
  reset to a fresh cover-fit;
- switching maps (hard zoomed-in on one map, then navigating to another) does not carry the previous
  map's zoom state over — the new map opened at its own fresh cover-fit size (15x22), not the
  previous map's saturated ceiling (23x32);
- a pin remained clickable both at the initial view and after a deliberate zoom-in;
- across 60 zoom-in + 100 zoom-out wheel notches on a tiled map (far past any reasonable bound in
  either direction), every `/api/map-tiles/.../{z}/{x}/{y}` request stayed within the configured
  `0..7` range — no request for a nonexistent tile level, confirmed by capturing real network
  requests, not inferred.

**Full regression suite**: `pnpm vitest run` — 329 files, 6600 tests, all passing (22 new).
`pnpm run lint`: clean against baseline (27 pre-existing errors in this file, identical count and
set, confirmed by line-for-line comparison against `git show HEAD`; new files clean). `pnpm run
typecheck`: 902 pre-existing errors, identical count after this change (one new error was
introduced and fixed during this pass — see 8.5 — and one pre-existing, unrelated `Element`/
`webworker`-lib type conflict was worked around locally with a documented, narrowly-scoped cast,
consistent with this file's own existing, extensive use of `any` at the Leaflet interop boundary).
`pnpm build`: succeeds. `git diff --check`: clean.

### 8.5 A real typecheck regression caught during this pass, not shipped

An early version of this pass's own resize-observer setup (`resizeObserver.observe(el)`) failed
`pnpm run typecheck` with a structurally-unrelated `Element` type conflict, traced to this project's
own `.nuxt/tsconfig.app.json` including both the `dom` and `webworker` lib sets together (a known
TypeScript combination that produces two incompatible ambient `Element` types) — pre-existing to this
repo, unrelated to this change, out of scope to fix here; worked around with a narrow, commented
`as unknown as Element` cast at the one call site that needs it, and confirmed the typecheck error
count returned to the exact 902 baseline afterward (not merely "a similar count").

### 8.6 Remaining uncertainty

- **The owner's own "starts too far zoomed out" symptom was NOT reproduced by this pass, and this
  implementation does not claim to have fixed it.** What this pass adds (inset-aware cover-fit,
  fresh-recompute-on-resize instead of a stale reused zoom, and a genuine resize-observation path that
  did not exist before) are confirmed CODE IMPROVEMENTS to the exact structural gap identified in §2.2
  as the most plausible cause — a one-shot fit with no correction path. Whether they actually resolve
  what the owner saw is a production-acceptance question, not something this disposable-instance,
  headless-browser pass can settle on its own. If the symptom recurs after this ships, the next useful
  evidence is the owner's own device/browser and viewport size at the moment it was observed.
- Quick Edit field-set gating, unauthorized/shared-source boundaries, and the Scene Graph's own
  renderer-compatibility fallback branches (identified as dead but unremoved in earlier Scene Graph
  Cleanup work) were not touched and not re-verified this pass — out of this task's own bounded scope.
- The rail/inset-change watcher itself (`applyMaxBounds`/`ensureSelectedPinVisible` reacting to
  `viewportInsets` changing) was not independently re-exercised against a live sidebar-collapse toggle
  in the browser this pass, for time — its own internal logic is unchanged by this fix (only wrapped
  in the new programmatic-view-change guard, which is a no-op addition to its existing behavior,
  confirmed by reading the diff), so this is a lower-confidence, reasoned-rather-than-measured
  statement, flagged as such rather than silently assumed equivalent to the already-measured items
  above.

## 9. Status (implementation pass)

**Implemented, verified (22 new unit tests + 28/28 real-browser checks across tiled/untiled,
landscape/portrait, desktop/narrow, fresh-load/refresh/resize/map-switch/pin-selection/tile-request
scenarios), not yet committed** — awaiting review. The starting-zoom symptom itself remains
unconfirmed in production, per §8.6.
