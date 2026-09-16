<script setup lang="ts">
// WorldAuthoredThreeDiceRenderer -- Eldra Roll System Phase 4B.1
// (Authored Three.js d20 Proof of Concept) + Phase 4B.2 (Visual Polish +
// Skin-Ready Material Architecture). Implements ADR-024
// (.github/docs/architecture/adr-024-authored-dice-presentation.md) §11/
// §12's own Option 2 (Canvas/WebGL authored dice, without physics),
// invoked as this task's own explicit fallback after Phase 4B's CSS/DOM
// proof of concept (WorldAuthoredDiceRenderer.vue) did not clear ADR-024's
// visual-quality gate.
//
// ---------------------------------------------------------------------------
// THIS IS NOT A RETURN TO PHYSICS. WHY THIS IS DIFFERENT FROM BOTH
// REJECTED APPROACHES.
// ---------------------------------------------------------------------------
// vs. @3d-dice/dice-box-threejs (the CURRENT physics renderer,
// WorldDiceThreeRenderer.client.vue): that renderer discovers a face by
// running cannon-es rigid-body physics TWICE (once silently, once
// visibly) and texture-swaps to hide the difference between "what physics
// found" and "what the server said" -- see that file's own Phase 3F
// header for the full, hard-won account of how fragile that reconciliation
// proved. THIS FILE HAS NO PHYSICS ENGINE AT ALL. There is no
// `cannon-es` import anywhere in this file or its siblings
// (authoredD20ThreeOrientation.ts, authoredD20ThreeChoreography.ts,
// authoredD20ThreeSkin.ts, worldAuthoredThreeDiceRendererAdapter.ts) --
// verified by direct grep, reported in this phase's own summary, not
// merely asserted here. `three` is used ONLY as a rendering/graphics
// library (scene graph, geometry, materials, a render loop) -- never as a
// physics/simulation engine, and this file never calls anything
// resembling `world.step()`, never constructs a rigid body, and never
// asks a physics engine "where did this land."
//
// vs. WorldAuthoredDiceRenderer.vue (Phase 4B's own CSS/DOM proof of
// concept -- never committed to git, and not registered by any committed
// code; see useDiceRendererMode.ts's own header for the deployment-fix
// account of why): that approach proved the ARCHITECTURE (authored
// presentation, deterministic targets, fixed duration, DiceRendererAdapter
// as the correct seam) but its "sphere of 20 independent face cards"
// visual did not read as a real 3D die. This file builds a GENUINE, single,
// rigid icosahedral mesh -- `THREE.IcosahedronGeometry`, the same solid a
// real d20 has -- and rotates the WHOLE OBJECT as one piece, the way an
// actual die tumbles.
//
// THE ONE RULE BOTH REJECTED APPROACHES SHARE WITH THIS ONE, UNCHANGED:
// the server decides reality; this file only ever presents it. `playD20
// (face)` receives `face` as an INPUT, already final, already
// authoritative, before a single frame of animation plays. There is no
// step anywhere in this file that "discovers," simulates, or randomizes a
// resting face -- there is only a precomputed target
// (authoredD20ThreeOrientation.ts's own `landingQuaternionForFace`) that
// every throw is authored to arrive at exactly. Phase 4B.2 (this pass)
// touches ONLY appearance and motion polish (material, geometry shading,
// lighting, a contact shadow, squash/glint) -- see PHASE 4B.2 SCOPE below
// for the precise boundary and why none of it can affect the face.
//
// ---------------------------------------------------------------------------
// OWNERSHIP -- THREE.JS AS A LIBRARY, NOT dice-box-threejs AS A RUNTIME
// ---------------------------------------------------------------------------
// This file imports `three` directly (`package.json`'s own dependency,
// added in Phase 4B.1). It does NOT import @3d-dice/dice-box-threejs,
// does not call its `roll()`/`simulateThrow()`/`animateThrow()`, and does
// not monkey-patch anything on it (contrast WorldDiceThreeRenderer
// .client.vue's own Phase 3F `spawnDice` hook, which this file has no
// equivalent of, because it has no physics body to hook). Geometry/
// material KNOWLEDGE -- how to build an icosahedron, how per-face
// materials/UVs work, how to soften vertex normals or draw an edge
// outline -- is general Three.js knowledge, independently verified this
// phase against three@0.143.0's own shipped source (see
// authoredD20ThreeSkin.ts's own header for the exact API citations), never
// read from or coupled to dice-box-threejs's own runtime.
//
// ---------------------------------------------------------------------------
// PHASE 4B.2 SCOPE -- WHY NONE OF THIS CAN TOUCH CORRECTNESS
// ---------------------------------------------------------------------------
// Every change in this pass falls into exactly one of three buckets, and
// every bucket is structurally incapable of reaching the face:
//   1. APPEARANCE (authoredD20ThreeSkin.ts's own `DiceSkin` -- base color,
//      roughness, metalness, emissive, numeral treatment, optional
//      texture maps). Consumed by `buildMaterials`/`createFaceTexture`
//      below, which produce `THREE.Material`s -- materials never
//      participate in `landingQuaternionForFace`'s own lookup, and
//      changing every color in `ELDRA_DEFAULT_D20_SKIN` to something else
//      would not move a single vertex or change which face value maps to
//      which quaternion.
//   2. GEOMETRY SHADING (`applySoftenedEdgeNormals`, `buildEdgeOutline`).
//      Both operate EXCLUSIVELY on the `normal` attribute (lighting
//      response) or add a purely decorative child object (the edge
//      outline) -- neither ever writes to the `position` attribute, which
//      is the ONLY thing authoredD20ThreeOrientation.ts's own derivation
//      depends on (see that file's own header). The existing, unmodified
//      orientation test suite (tests/components/world/
//      authoredD20ThreeOrientation.test.ts) is therefore still a complete
//      proof of correctness after this phase -- it was never given a
//      reason to change, and re-running it (this phase's own Verification
//      results) confirms that directly rather than by argument alone.
//   3. MOTION POLISH (squash-and-stretch scale, contact-shadow
//      scale/opacity, the FLOURISH emissive glint -- all in
//      authoredD20ThreeChoreography.ts). Squash only ever writes to
//      `die.scale`; the shadow is a SEPARATE object with no bearing on the
//      die's own transform; the glint only ever writes to each material's
//      own `emissiveIntensity`. None of the three ever reads or writes
//      `die.quaternion` or `die.position`'s FINAL (post-LAND) values --
//      the same hard-assignment-to-exact-target this file already
//      performed in Phase 4B.1 (see LAND, below) is completely unchanged.
//
// ---------------------------------------------------------------------------
// GEOMETRY -- A REAL ICOSAHEDRON, SOFTENED, NOT REBUILT
// ---------------------------------------------------------------------------
// `new THREE.IcosahedronGeometry(DIE_RADIUS, 0)` -- one rigid, convex,
// 20-triangle solid, VERTEX POSITIONS UNCHANGED FROM PHASE 4B.1. Its
// default spherical (azimuth/inclination) UVs are replaced with a
// canonical top/bottom-right/bottom-left triangle, IDENTICALLY repeated
// for all 20 faces (`buildGeometry` below) -- the default UVs would map
// each face to an arbitrary, badly-distorted sliver of a global
// equirectangular texture; a fixed, repeated triangle instead makes every
// face's own separately-baked numeral texture (`createFaceTexture`)
// render consistently regardless of where that face sits on the sphere.
// `geometry.addGroup(3f, 3, f)` assigns each face its OWN materialIndex
// (0-19), so 20 independent `MeshStandardMaterial`s (one numeral each)
// can be painted onto one physical mesh.
//
// Buffer-vertex 0 of face `f` (position index `3f`) is, by construction,
// the SAME vertex authoredD20ThreeOrientation.ts's own derivation treats
// as that face's "up" reference (see that file's own header, step 2) --
// this is why that vertex is assigned the TOP uv coordinate here: it is
// what makes a landed face's printed numeral appear upright on screen.
//
// PHASE 4B.2 -- "RAZOR-SHARP MATHEMATICAL EDGES" (this phase's own
// GEOMETRY QUALITY section). Investigated and rejected: rebuilding the
// geometry with real bevel/chamfer faces (inserting extra triangles along
// every edge and at every vertex) -- this would multiply the face count
// well beyond 20, invalidating the `materialIndex`/orientation
// correspondence this renderer and its entire test suite depend on, for a
// purely cosmetic gain, and is real CSG geometry engineering with a much
// larger risk surface than this phase's stated goal justifies (this
// phase's own explicit "Correctness wins over prettier geometry").
// Adopted instead, in order of how much they matter:
//   (a) `applySoftenedEdgeNormals` -- blends each vertex's own hard, flat
//       face normal with the AVERAGE normal of every face sharing that
//       same underlying vertex POSITION, at a modest blend factor
//       (`EDGE_NORMAL_SOFTEN`). This is an ordinary, well-known low-poly
//       stylization technique ("partial smoothing" / a soft "smoothing
//       angle") -- it changes ONLY how light responds near an edge
//       (a gentler falloff instead of a knife-sharp crease), never a
//       vertex position, so it is unconditionally safe with respect to
//       the orientation table (see PHASE 4B.2 SCOPE above).
//   (b) `buildEdgeOutline` -- a thin `THREE.LineSegments` traced along the
//       geometry's real edges (`THREE.EdgesGeometry`) in the skin's own
//       accent color, added as a CHILD of the die mesh so it automatically
//       inherits every frame's position/quaternion/scale with zero extra
//       per-frame work. This is the classic "faceted/cut-gem" technique
//       many stylized low-poly renderers use specifically to read as
//       "manufactured with defined edges" without any geometry rebuild.
// Together these produce "subtle bevel/chamfer, readable edges" (this
// phase's own desired result) while leaving `position` -- and therefore
// every existing orientation guarantee -- completely untouched.
//
// ---------------------------------------------------------------------------
// MATERIAL / SKIN (authoredD20ThreeSkin.ts)
// ---------------------------------------------------------------------------
// `buildMaterials`/`createFaceTexture` below are the ONLY place a
// `DiceSkin` becomes real `THREE.Material`/`THREE.Texture` instances --
// see authoredD20ThreeSkin.ts's own header for the full skin/appearance
// contract, the custom-texture pipeline (`resolveAuxTexture`, reused here
// for every optional PBR map slot), and why this file has no hardcoded
// color/roughness/metalness literals anymore (Phase 4B.1 had them inline;
// they now live entirely in `ELDRA_DEFAULT_D20_SKIN`). `MeshStandardMaterial`
// remains the material class (physically-based, needs real light sources
// -- intentional, an unlit material would look flat and fail this
// phase's own "lighting... communicate real 3D volume" requirement).
//
// ---------------------------------------------------------------------------
// LIGHTING
// ---------------------------------------------------------------------------
// A small, fixed, four-light rig -- ambient fill (soft, low), a warm key
// light (primary shape/shading), a cool rim light (edge separation from
// the background), and a small warm point light near the camera (a
// travelling specular highlight as the die rotates, the single strongest
// cue for "polished material" per this phase's own "specular response
// through lighting/material interaction"). Not a cinematic sequence --
// every light is static for the lifetime of the renderer; nothing about
// lighting is animated per-roll.
//
// ---------------------------------------------------------------------------
// CONTACT SHADOW (authoredD20ThreeChoreography.ts's own
// `shadowScaleForHeight`/`shadowOpacityForHeight`)
// ---------------------------------------------------------------------------
// A flat, radially-gradient-textured plane, built ONCE in `ensureScene`,
// whose scale/opacity/horizontal position are updated every animation
// frame from the die's OWN already-computed position -- not a physics
// contact, not a real-time shadow map (which would cost a full extra
// render pass for a small decorative UI element), just the well-
// established cheap "blob shadow" technique. It tightens and darkens as
// the die approaches the floor and loosens/fades as the die is "in the
// air," giving the single biggest available sense of weight for the
// lowest implementation/performance cost among this phase's own listed
// CONTACT / WEIGHT options.
//
// ---------------------------------------------------------------------------
// THE THROW -- AUTHORED position(t)/rotation(t)/scale(t), NEVER
// force/gravity/sleep-state
// ---------------------------------------------------------------------------
// All motion math (the Bezier arc, the spin turn-counts, the
// overshoot-and-settle easing, squash-and-stretch, shadow response, every
// duration) lives in authoredD20ThreeChoreography.ts, a plain, WebGL-free
// module -- this file only ever reads those constants/functions and
// applies their output to real `THREE.Object3D.position`/`.quaternion`/
// `.scale` each animation frame. See that file's own header for the full
// beat-by-beat account, and for exactly why Phase 4B.2 changed only
// `LAND_MS` (170ms -> 190ms, to give the new squash room to read) and left
// the throw's own arc/spin numbers untouched (no browser evidence asked
// for a redesign there).
//
// THE FINAL ORIENTATION IS GUARANTEED EXACT, NOT MERELY "CLOSE ENOUGH
// AFTER EASING." `easeOutBack(1)` is algebraically exactly `1`, so the
// slerp already lands exactly on target -- but this file ALSO
// hard-assigns the die's quaternion to the literal target values once
// LAND's own animation loop exits, overriding any floating-point drift
// from 60+ frames of incremental slerping. The same defensive-exactness
// posture applies to position (dead center) and, new this phase, to scale
// (exactly `1,1,1`) once the squash beat's own recovery finishes.
//
// ---------------------------------------------------------------------------
// REDUCED MOTION -- SEAM DOCUMENTED, NOT IMPLEMENTED THIS PHASE
// ---------------------------------------------------------------------------
// This phase's own REDUCED MOTION section: "do not architect... in a way
// that prevents `prefers-reduced-motion` support later... no further
// implementation required unless a tiny obvious improvement falls
// naturally out." `playD20` below is structured as a strict, linear
// sequence of `await animatePhase(...)` calls with no shared mutable
// timing state outside that function -- a future reduced-motion check has
// exactly one place to intervene (immediately after computing `target`
// and before the THROW `animatePhase` call), either skipping straight to
// a short LAND-only motion or collapsing THROW_MS to a much smaller value
// before proceeding, with no other line in this file needing to change.
// Deliberately NOT implemented now: this phase is scoped to visual
// quality/skin architecture, and gating real behavior on a media query
// is its own small feature with its own testing/verification surface,
// better done as a deliberate, reviewed change than an incidental one.
//
// ---------------------------------------------------------------------------
// PHASE 4B.3 -- LIFECYCLE: THE TRACED ROOT CAUSE OF THE "DIE STAYS VISIBLE
// FOREVER" DEFECT
// ---------------------------------------------------------------------------
// Real browser feedback: after a roll completes, the die could remain on
// screen indefinitely. Traced (not guessed) through the full chain --
// `DiceRendererAdapter.play()` (worldAuthoredThreeDiceRendererAdapter.ts)
// awaits `exposed.playD20(face)`, which awaits a sequence of
// `animatePhase()` calls, each a `new Promise` driven purely by
// `requestAnimationFrame`. NOTHING in that chain had a `reject` path or a
// wall-clock ceiling. Two concrete, provable ways that breaks:
//   1. A per-frame exception (`onFrame(t)` or `renderer.render(...)`
//      throwing inside `step()`) is NOT caught by `playD20`'s own
//      `try/catch` -- `requestAnimationFrame` invokes `step` in a LATER,
//      detached browser task, outside the call stack that originally
//      awaited the Promise. An uncaught throw there simply never reaches
//      `if (t < 1) ... else resolve()` -- the Promise stays pending
//      forever, `await animatePhase(...)` in `playD20` never returns, and
//      since `visible` was already set `true` before that await, the die
//      is stuck visible with no code path left to un-stick it.
//   2. Browsers throttle or fully suspend `requestAnimationFrame` for a
//      backgrounded/minimized tab -- a beat waiting purely on rAF can
//      stall for an arbitrary, unbounded amount of real time even with no
//      error at all.
// Either failure ALSO stalls `useDiceAnimationQueue.ts`'s own
// `runQueue()` (it `await`s the exact same `renderer.play()` call), which
// is consistent with, and a superset of, the reported symptom.
//
// THE FIX, in two parts:
//   (a) `animatePhase` (below) now takes a `generation` token and races
//       its own rAF loop against a `setTimeout` WATCHDOG
//       (authoredD20ThreeChoreography.ts's own `ANIMATION_WATCHDOG_MS`),
//       and wraps each frame's own work in try/catch -- ANY per-frame
//       exception, ANY stalled/throttled rAF, or a newer roll superseding
//       an older one (the same `generation`-token idiom
//       useDiceAnimationQueue.ts's own `runQueue`/`clear` already
//       establishes for the identical reason) now finishes that beat's
//       Promise instead of leaving it pending. This never fires in the
//       ordinary case -- the watchdog margin is generous relative to
//       every beat's own nominal duration -- so it adds no latency to a
//       normal roll.
//   (b) `playD20`'s own OUTER lifecycle is now a genuine `try/finally`,
//       not two independent copies of "set `visible.value = false`" (one
//       at the end of the happy path, one in `catch`) that depended on
//       one of those two exact lines being reached. The `finally` block
//       is the ONLY place that hides the stage, and it runs on every
//       possible exit from the try block -- return, throw, or normal
//       completion -- so cleanup is a structural guarantee, not a
//       byproduct of the happy path finishing. This is this task's own
//       CLEANUP section's own suggested shape, applied literally: "show
//       stage / try: play authored ceremony / finally: hide/reset stage."
//
// ---------------------------------------------------------------------------
// STAGE / DOCKING -- REUSED, NOT REINVENTED
// ---------------------------------------------------------------------------
// Docked at the EXACT same shelf every prior Dice Presentation Layer
// renderer uses (`bottom-40`/`h-56`/`w-56` mobile,
// `sm:right-6`/`h-72`/`w-72` desktop, `origin-bottom`). `visible` (not
// `v-show`) drives the outer container's own fade/scale -- this component
// never reads `container.clientWidth` (it uses a fixed internal render
// resolution, `SCENE_PX`), so the `display:none` hazard
// WorldDiceThreeRenderer.client.vue's own header documents does not apply
// here, but keeping every renderer's outer-stage mechanics identical is
// its own, simpler justification. EXIT/"Record" (ADR-024 §6) is exactly
// this same outer-stage fade -- the die's own pose is already fully
// settled by the time this beat begins; only the framing around it fades.

import type { DiceSkin } from './authoredD20ThreeSkin'
import { ELDRA_DEFAULT_D20_SKIN, resolveDiceSkin } from './authoredD20ThreeSkin'
import { D20_THREE_FACE_VALUE_BY_INDEX, landingQuaternionForFace } from './authoredD20ThreeOrientation'
import {
  ANIMATION_WATCHDOG_MS,
  bezierPoint,
  easeOutBack,
  easeOutCubic,
  EXIT_MS,
  flourishEmissiveBoost,
  flourishScale,
  FLOURISH_MS,
  landBobOffset,
  landSquashScaleXZ,
  landSquashScaleY,
  LAND_MS,
  shadowOpacityForHeight,
  shadowScaleForHeight,
  SPIN_X_TURNS,
  SPIN_Y_TURNS,
  THROW_LAND_POSITION,
  THROW_MS,
  THROW_PEAK_POSITION,
  THROW_START_POSITION
} from './authoredD20ThreeChoreography'

const error = ref('')
const visible = ref(false)
const containerEl = ref<HTMLDivElement | null>(null)

// Fixed internal render resolution -- deliberately NOT breakpoint-aware
// (see this file's own header, STAGE / DOCKING).
const SCENE_PX = 200
const DIE_RADIUS = 1

// Texture resolution for the per-face numeral/albedo canvas and for any
// optional aux (normal/roughness/metalness/emissive) map painted via a
// `{ kind: 'canvas' }` DiceTextureSource. Bumped from Phase 4B.1's 128 to
// 256 for crisper numeral edges/outline (this phase's own NUMERALS
// section: "crisp... sufficient contrast") -- still tiny, and built ONCE
// per face at init, never per-roll (see PERFORMANCE, below).
const FACE_TEXTURE_SIZE = 256
const AUX_TEXTURE_SIZE = 256

// How strongly `applySoftenedEdgeNormals` blends each hard, flat face
// normal toward its neighbor-averaged "smooth" normal -- 0 leaves the
// original razor-sharp per-face shading untouched, 1 would read as a
// nearly spherical, facet-less blob. Lowered this phase (0.35 -> 0.15):
// real browser feedback named the edge/face separation as "too subtle at
// gameplay scale" -- Phase 4B.2's own blend softened edges FOR a
// polished look, which directly worked against the distinct per-facet
// brightness contrast this task's own EDGE READ section now asks for.
// Less smoothing means each face reads as a more clearly separate flat
// facet under directional light, which combines with the bolder edge
// outline (`buildEdgeOutline`, below) for a much stronger "obviously a
// d20" read.
const EDGE_NORMAL_SOFTEN = 0.15

// The active skin -- resolved ONCE, here, not per-roll. This phase's own
// DEFAULT SKIN section: "No selector. No user preference storage." A
// future phase that adds real skin selection changes only this one line
// (and whatever composable it reads from) -- see authoredD20ThreeSkin
// .ts's own `resolveDiceSkin` header for why the fallback lives there,
// not here.
const activeSkin: DiceSkin = resolveDiceSkin(ELDRA_DEFAULT_D20_SKIN)

// Module-scoped (not `ref()` -- none of this needs to be reactive),
// created lazily on the first roll, matching WorldDiceThreeRenderer
// .client.vue's own `ensureBox()` convention exactly. Only one instance
// of this component is ever mounted (WorldDiceOverlay.vue, world-scoped),
// so this closure lives for the lifetime of the World layout.
let ThreeMod: typeof import('three') | null = null
let scene: import('three').Scene | null = null
let camera: import('three').PerspectiveCamera | null = null
let renderer: import('three').WebGLRenderer | null = null
let dieMesh: import('three').Mesh | null = null
let contactShadow: import('three').Mesh | null = null
let readyPromise: Promise<void> | null = null

// PHASE 4B.3 -- incremented once per `playD20()` call, matching
// useDiceAnimationQueue.ts's own `generation` idiom exactly. Each
// `animatePhase()` call captures the token active when IT started; if a
// newer `playD20()` call has since begun (defensive -- the queue's own
// strict serialization should make this unreachable in practice, but
// costs nothing to guard), a stale beat finishes itself immediately
// instead of continuing to animate or render on behalf of a roll that no
// longer owns the stage. See this file's own header, PHASE 4B.3 --
// LIFECYCLE, for the full root-cause account this is part of the fix for.
let animationGeneration = 0

// Real THREE.Vector3 axis constants -- constructed once ThreeMod is
// loaded (ensureScene, below), not plain `{x,y,z}` literals, so
// `Quaternion.setFromAxisAngle` receives the real type it expects.
let xAxis: import('three').Vector3 | null = null
let yAxis: import('three').Vector3 | null = null

// ---------------------------------------------------------------------------
// Skin -> real Three.js resources
// ---------------------------------------------------------------------------

// Resolves ONE optional `DiceTextureSource` (any PBR map slot except the
// numeral-bearing albedo map, which has its own composited path in
// `createFaceTexture`/`paintFaceBackground` below) into a real
// `THREE.Texture`, or `null` if the skin didn't specify one. Both
// `DiceTextureSource` kinds are handled for real, not merely typed -- see
// authoredD20ThreeSkin.ts's own header, CUSTOM TEXTURE SUPPORT, for the
// exact three@0.143.0 APIs this was verified against.
async function resolveAuxTexture(
  three: typeof import('three'),
  source: import('./authoredD20ThreeSkin').DiceTextureSource | undefined
): Promise<import('three').Texture | null> {
  if (!source) return null

  if (source.kind === 'canvas') {
    const canvas = document.createElement('canvas')
    canvas.width = AUX_TEXTURE_SIZE
    canvas.height = AUX_TEXTURE_SIZE
    const ctx = canvas.getContext('2d')!
    source.draw(ctx, AUX_TEXTURE_SIZE)
    const texture = new three.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

  const image = await loadImage(source.url)
  const texture = new three.Texture(image)
  texture.needsUpdate = true
  return texture
}

// Loads an external image for a `{ kind: 'url' }` DiceTextureSource.
// `crossOrigin = 'anonymous'` matches `THREE.Loader`'s own default (see
// authoredD20ThreeSkin.ts's own header) -- required for a cross-origin
// image to be usable as a WebGL texture without tainting the canvas.
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`WorldAuthoredThreeDiceRenderer: failed to load dice texture "${url}"`))
    image.src = url
  })
}

// The default procedural face background -- a flat fill in the skin's own
// base color plus a soft radial vignette (subtly darker toward the
// canvas's own edges). This phase's own NUMERALS section named the
// problem directly: "numerals feel pasted onto faces." A perfectly flat,
// single-color fill is exactly what makes a printed number look like a
// sticker; a gentle vignette gives the face itself a lit, faceted
// appearance to sit inside, so the numeral reads as printed ON a surface
// rather than floating in front of a flat color block.
function paintDefaultFaceBackground(ctx: CanvasRenderingContext2D, size: number, baseColor: string): void {
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)

  const gradient = ctx.createRadialGradient(
    size / 2, size * 0.55, size * 0.12,
    size / 2, size * 0.55, size * 0.62
  )
  // PHASE 4B.3 -- warm gold highlight (was a plain white 0.12 highlight),
  // matching the new near-black `--eldra-charcoal` base so the face's own
  // "lit" side reads as warm metal catching light, not a generic glossy
  // plastic sheen -- part of this phase's "same world as Eldra's
  // charcoal/gold interface" visual target, not just a body-color swap.
  gradient.addColorStop(0, 'rgba(201,164,90,0.14)')
  gradient.addColorStop(0.55, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.30)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
}

// Paints the face's own background layer -- either the skin's own custom
// `material.map` (if present, composited FIRST so the numeral always
// draws on top of it) or the default procedural vignette above. See
// authoredD20ThreeSkin.ts's own `DiceMaterialDescriptor.map` doc for why
// this is the one map slot with compositing logic, unlike the other four
// (normal/roughness/metalness/emissive), which never need to share canvas
// space with a numeral.
async function paintFaceBackground(ctx: CanvasRenderingContext2D, size: number, skin: DiceSkin): Promise<void> {
  const source = skin.material.map
  if (source?.kind === 'canvas') {
    source.draw(ctx, size)
    return
  }
  if (source?.kind === 'url') {
    const image = await loadImage(source.url)
    ctx.drawImage(image, 0, 0, size, size)
    return
  }
  paintDefaultFaceBackground(ctx, size, skin.material.baseColor)
}

// Draws the numeral itself -- a soft engraved-look drop shadow beneath an
// optionally outlined, filled glyph, per the skin's own
// `DiceNumeralTreatment` (authoredD20ThreeSkin.ts). Centered on the
// SAMPLED triangle's own centroid (uv y ~= 0.08/0.92/0.92 -> centroid y
// ~= 0.64 of the canvas height, see `buildGeometry`'s own UV assignment
// below), not the canvas's own geometric center, so it reads centered
// once only that triangular slice of the texture is visible on the die.
function paintFaceNumeral(ctx: CanvasRenderingContext2D, size: number, value: number, skin: DiceSkin): void {
  const { numeral } = skin
  const fontWeight = numeral.fontWeight ?? 700
  const fontFamily = numeral.fontFamily ?? 'ui-monospace, "SFMono-Regular", monospace'
  const x = size / 2
  const y = size * 0.64

  // PHASE 4B.3 -- 0.44 -> 0.50: NUMERALS section, "large enough, centered,
  // high contrast, crisp, immediately readable" at LAND.
  ctx.font = `${fontWeight} ${Math.round(size * 0.50)}px ${fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = size * 0.035
  ctx.shadowOffsetX = size * 0.012
  ctx.shadowOffsetY = size * 0.02

  if (numeral.outlineColor && numeral.outlineWidth) {
    ctx.lineWidth = numeral.outlineWidth * (size / 256)
    ctx.strokeStyle = numeral.outlineColor
    ctx.strokeText(String(value), x, y)
  }

  ctx.fillStyle = numeral.color
  ctx.fillText(String(value), x, y)
  ctx.restore()
}

// Builds ONE face's complete texture -- background (skin-aware) then
// numeral, composited onto the same canvas, matching Phase 4B.1's own
// established "one CanvasTexture per numbered face" approach (kept, not
// replaced -- this phase's own NUMERALS section: "If retained, improve it
// rather than replacing it merely for novelty").
async function createFaceTexture(three: typeof import('three'), value: number, skin: DiceSkin): Promise<import('three').CanvasTexture> {
  const canvas = document.createElement('canvas')
  canvas.width = FACE_TEXTURE_SIZE
  canvas.height = FACE_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')!

  await paintFaceBackground(ctx, FACE_TEXTURE_SIZE, skin)
  paintFaceNumeral(ctx, FACE_TEXTURE_SIZE, value, skin)

  const texture = new three.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

// Builds the 20 per-face materials from the active skin -- the aux PBR
// maps (normal/roughness/metalness/emissive) are resolved once, shared
// across all 20 materials (a skin's surface-detail texture is the SAME
// physical material repeated per face, not 20 independent images), while
// the albedo/numeral map is necessarily unique per face.
async function buildMaterials(three: typeof import('three'), skin: DiceSkin): Promise<import('three').MeshStandardMaterial[]> {
  const [normalMap, roughnessMap, metalnessMap, emissiveMap] = await Promise.all([
    resolveAuxTexture(three, skin.material.normalMap),
    resolveAuxTexture(three, skin.material.roughnessMap),
    resolveAuxTexture(three, skin.material.metalnessMap),
    resolveAuxTexture(three, skin.material.emissiveMap)
  ])

  const faceTextures = await Promise.all(
    D20_THREE_FACE_VALUE_BY_INDEX.map((value) => createFaceTexture(three, value, skin))
  )

  const emissive = new three.Color(skin.material.emissiveColor ?? '#000000')

  return faceTextures.map((map) => new three.MeshStandardMaterial({
    map,
    normalMap: normalMap ?? undefined,
    roughnessMap: roughnessMap ?? undefined,
    metalnessMap: metalnessMap ?? undefined,
    emissiveMap: emissiveMap ?? undefined,
    color: 0xffffff,
    roughness: skin.material.roughness,
    metalness: skin.material.metalness,
    emissive,
    emissiveIntensity: skin.material.emissiveIntensity ?? 0
  }))
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

// Replaces IcosahedronGeometry's own default spherical UVs with a
// canonical, per-face-identical triangle, assigns each face its own
// materialIndex, and softens the edge shading -- see this file's own
// header, GEOMETRY section, for the full rationale of each step.
function buildGeometry(three: typeof import('three')): import('three').IcosahedronGeometry {
  const geometry = new three.IcosahedronGeometry(DIE_RADIUS, 0)

  const FACE_COUNT = 20
  const uvs = new Float32Array(FACE_COUNT * 3 * 2)
  for (let f = 0; f < FACE_COUNT; f++) {
    const base = f * 6
    uvs[base + 0] = 0.5; uvs[base + 1] = 0.08 // buffer-vertex 0 -- "top"
    uvs[base + 2] = 0.92; uvs[base + 3] = 0.92 // buffer-vertex 1 -- "bottom right"
    uvs[base + 4] = 0.08; uvs[base + 5] = 0.92 // buffer-vertex 2 -- "bottom left"
  }
  geometry.setAttribute('uv', new three.BufferAttribute(uvs, 2))

  geometry.clearGroups()
  for (let f = 0; f < FACE_COUNT; f++) geometry.addGroup(f * 3, 3, f)

  applySoftenedEdgeNormals(three, geometry, EDGE_NORMAL_SOFTEN)

  return geometry
}

// Blends each vertex's own per-face FLAT normal with the AVERAGE normal
// of every face sharing that same underlying vertex position -- softens
// the perceived hardness of each edge WITHOUT moving a single vertex
// position, so authoredD20ThreeOrientation.ts's own face-landing guarantee
// (which depends only on vertex POSITIONS, never normals) is completely
// unaffected -- see this file's own header, GEOMETRY section, for why
// this was chosen over an actual beveled-geometry rebuild. Vertices are
// grouped by rounded position (the underlying icosahedron has only 12
// unique positions, each repeated across 5 of the 60 non-indexed buffer
// entries -- see authoredD20ThreeOrientation.ts's own DERIVATION for the
// same construction) rather than by any stored index, since this
// non-indexed geometry has none.
function applySoftenedEdgeNormals(three: typeof import('three'), geometry: import('three').BufferGeometry, blend: number): void {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')

  const keyFor = (i: number): string =>
    `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`

  const groups = new Map<string, number[]>()
  for (let i = 0; i < position.count; i++) {
    const key = keyFor(i)
    const list = groups.get(key)
    if (list) list.push(i)
    else groups.set(key, [i])
  }

  const smoothedByKey = new Map<string, import('three').Vector3>()
  for (const [key, indices] of groups) {
    const sum = new three.Vector3()
    for (const i of indices) sum.add(new three.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)))
    smoothedByKey.set(key, sum.normalize())
  }

  for (let i = 0; i < position.count; i++) {
    const flat = new three.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i))
    const smooth = smoothedByKey.get(keyFor(i))!
    const blended = flat.lerp(smooth, blend).normalize()
    normal.setXYZ(i, blended.x, blended.y, blended.z)
  }
  normal.needsUpdate = true
}

// A thin outline traced along the geometry's real edges, in the skin's
// own accent color -- see this file's own header, GEOMETRY section, for
// why this (plus the softened normals above) was chosen over rebuilding
// the geometry with real bevel faces. Added as a CHILD of the die mesh by
// the caller, so it inherits every frame's transform automatically.
function buildEdgeOutline(three: typeof import('three'), geometry: import('three').BufferGeometry, accentColor: string): import('three').LineSegments {
  const edges = new three.EdgesGeometry(geometry, 1)
  // PHASE 4B.3 -- 0.32 -> 0.85: EDGE READ section, "increase face
  // separation... edge accent." Raised via opacity, not `linewidth` --
  // `LineBasicMaterial.linewidth` is capped at ~1px on most WebGL/ANGLE
  // implementations regardless of the requested value, so opacity is the
  // only lever that reliably makes the traced edges more visible.
  const material = new three.LineBasicMaterial({ color: accentColor, transparent: true, opacity: 0.85 })
  return new three.LineSegments(edges, material)
}

// A soft, radially-gradient "blob shadow" plane -- see this file's own
// header, CONTACT SHADOW section. Built ONCE; its scale/opacity/position
// are updated per-frame from the die's own already-computed position (see
// `playD20`, below), never recreated.
function buildContactShadow(three: typeof import('three')): import('three').Mesh {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(0,0,0,0.85)')
  gradient.addColorStop(0.65, 'rgba(0,0,0,0.32)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new three.CanvasTexture(canvas)
  texture.needsUpdate = true

  const geometry = new three.PlaneGeometry(1.7, 1.7)
  const material = new three.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const mesh = new three.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, -1.05, 0)
  return mesh
}

async function ensureScene(): Promise<void> {
  if (renderer) return
  if (readyPromise) return readyPromise

  readyPromise = (async () => {
    if (!ThreeMod) {
      ThreeMod = await import('three')
    }
    const three = ThreeMod
    xAxis = new three.Vector3(1, 0, 0)
    yAxis = new three.Vector3(0, 1, 0)
    await nextTick()

    const container = containerEl.value
    if (!container) throw new Error('WorldAuthoredThreeDiceRenderer stage is not mounted')

    scene = new three.Scene()

    camera = new three.PerspectiveCamera(40, 1, 0.1, 10)
    // Slightly elevated, not dead-on -- reads as photographed/dimensional
    // rather than a flat model-viewer thumbnail. The landing math itself
    // targets world +Z exactly (authoredD20ThreeOrientation.ts's own
    // header) -- this small camera tilt is a separate, purely cosmetic
    // choice, not baked into the orientation table.
    camera.position.set(0, 0.35, 3.4)
    camera.lookAt(0, 0, 0)

    renderer = new three.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(SCENE_PX, SCENE_PX)
    container.appendChild(renderer.domElement)

    // PHASE 4B.2 -- lighting rig. See this file's own header, LIGHTING,
    // for the role each light plays. PHASE 4B.3 -- intensities raised
    // (ambient lowered) for deliberately MORE light/shadow separation on
    // the new dark body: a near-black die under the old, flatter rig read
    // as a featureless silhouette rather than a lit object.
    const ambient = new three.AmbientLight(0xfff2d9, 0.30)
    const key = new three.DirectionalLight(0xfff6e6, 1.4)
    key.position.set(2, 3, 4)
    const rim = new three.DirectionalLight(0x8fa8ff, 0.55)
    rim.position.set(-3, -1, -2)
    const specular = new three.PointLight(0xfff2d9, 0.75, 8)
    specular.position.set(0.6, 1.1, 3.2)
    scene.add(ambient, key, rim, specular)

    const geometry = buildGeometry(three)
    const materials = await buildMaterials(three, activeSkin)
    dieMesh = new three.Mesh(geometry, materials)
    dieMesh.add(buildEdgeOutline(three, geometry, activeSkin.material.accentColor ?? activeSkin.material.baseColor))
    scene.add(dieMesh)

    contactShadow = buildContactShadow(three)
    scene.add(contactShadow)

    // Draw one initial frame at rest so nothing flashes before the first
    // roll's own reset-and-fade-in.
    dieMesh.position.set(0, 0, 0)
    dieMesh.quaternion.identity()
    updateContactShadow(0, 0)
    renderer.render(scene, camera)
  })()

  return readyPromise
}

// Updates the shared contact-shadow mesh from the die's own current
// horizontal position and height -- see authoredD20ThreeChoreography.ts's
// own `shadowScaleForHeight`/`shadowOpacityForHeight` header for why this
// reuses already-computed position data rather than simulating anything.
function updateContactShadow(x: number, y: number, z = 0): void {
  if (!contactShadow) return
  contactShadow.position.x = x
  contactShadow.position.z = z
  contactShadow.scale.setScalar(shadowScaleForHeight(y))
  const material = contactShadow.material as import('three').MeshBasicMaterial
  material.opacity = shadowOpacityForHeight(y)
}

// Runs `onFrame(t)` on every animation frame for `durationMs`, `t`
// clamped to `[0, 1]` (`t` reaches exactly `1` on the final call before
// resolving), rendering the scene after each call. Pure orchestration --
// all actual motion math lives in authoredD20ThreeChoreography.ts.
//
// PHASE 4B.3 -- GUARANTEED TO SETTLE. See this file's own header, PHASE
// 4B.3 -- LIFECYCLE, for the full traced root cause. Three independent
// guards, any ONE of which is enough to finish this Promise instead of
// leaving it pending forever:
//   - a `generation` mismatch (a newer `playD20()` call has since begun)
//   - a per-frame exception (`onFrame`/`renderer.render` throwing)
//   - a wall-clock WATCHDOG (`ANIMATION_WATCHDOG_MS` beyond `durationMs`),
//     which also covers a stalled/throttled `requestAnimationFrame` (a
//     backgrounded tab) even with no exception at all.
// `finish()` is idempotent (`settled` guard) since more than one of these
// can fire in practice (e.g. the watchdog AND a later stray rAF callback).
function animatePhase(generation: number, durationMs: number, onFrame: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const start = performance.now()
    function step(now: number) {
      if (settled) return
      if (generation !== animationGeneration) {
        finish()
        return
      }
      try {
        const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs)
        onFrame(t)
        renderer?.render(scene!, camera!)
        if (t < 1) {
          requestAnimationFrame(step)
        } else {
          finish()
        }
      } catch {
        // A per-frame failure (a lost WebGL context, a disposed renderer
        // mid-frame, ...) must never leave this Promise -- and therefore
        // the whole ceremony's own cleanup -- pending forever. Matches
        // worldAuthoredThreeDiceRendererAdapter.ts's own "a presentation
        // failure is never a gameplay failure" posture, one layer deeper.
        finish()
      }
    }

    requestAnimationFrame(step)
    setTimeout(finish, durationMs + ANIMATION_WATCHDOG_MS)
  })
}

// The one method this component exposes -- see this file's own header for
// why it takes a bare `face: number`. Never rejects: any internal failure
// (WebGL unavailable, the stage not yet mounted, an out-of-range face) is
// caught and recorded in `error`, matching every sibling renderer's
// identical `roll()`/`playD20()`/`error` contract.
async function playD20(face: number): Promise<void> {
  error.value = ''

  const target = landingQuaternionForFace(face)
  if (!target) {
    error.value = `No authored orientation for face ${face} -- this renderer only supports d20 faces 1-20`
    return
  }

  // PHASE 4B.3 -- see this file's own header, PHASE 4B.3 -- LIFECYCLE.
  // `myGeneration` is this call's own token, passed to every
  // `animatePhase` call below so a stale beat can recognize a NEWER
  // `playD20()` has since started. `shown` tracks whether this call ever
  // actually made the stage visible, so the `finally` block below never
  // runs an unnecessary exit-wait for a call that failed before showing
  // anything.
  const myGeneration = ++animationGeneration
  let shown = false

  try {
    await ensureScene()
    const three = ThreeMod
    if (!three || !renderer || !scene || !camera || !dieMesh || !contactShadow || !xAxis || !yAxis) {
      error.value = 'WorldAuthoredThreeDiceRenderer failed to initialize'
      return
    }
    // Local `const` captures -- TS narrows `let` variables per-statement,
    // not across the closures passed to `animatePhase` below, since a
    // mutable outer binding could in principle change between the check
    // above and a later callback invocation.
    const die = dieMesh
    const spinXAxis = xAxis
    const spinYAxis = yAxis
    const materials = die.material as import('three').MeshStandardMaterial[]
    const baseEmissiveIntensity = activeSkin.material.emissiveIntensity ?? 0

    const targetQuat = new three.Quaternion(target.x, target.y, target.z, target.w)

    // Reset to the authored throw's own starting pose BEFORE fading in,
    // so a fast-repeating roll never flashes the PREVIOUS roll's landed
    // face during its own entrance -- matches every sibling renderer's
    // identical "reset before fade-in" posture.
    die.position.set(THROW_START_POSITION.x, THROW_START_POSITION.y, THROW_START_POSITION.z)
    die.quaternion.identity()
    die.scale.setScalar(1)
    updateContactShadow(THROW_START_POSITION.x, THROW_START_POSITION.y, THROW_START_POSITION.z)
    renderer.render(scene, camera)
    visible.value = true
    shown = true

    // THROW (Enter + Roll, one continuous motion). Position follows the
    // authored Bezier arc; rotation is a fast, multi-axis spin that does
    // NOT target the authoritative face -- LAND (next) is what arrives at
    // the exact, already-known target. The contact shadow tracks the same
    // position data, tightening as the die nears the floor.
    await animatePhase(myGeneration, THROW_MS, (t) => {
      const eased = easeOutCubic(t)
      const pos = bezierPoint(eased, THROW_START_POSITION, THROW_PEAK_POSITION, THROW_LAND_POSITION)
      die.position.set(pos.x, pos.y, pos.z)
      updateContactShadow(pos.x, pos.y, pos.z)

      const qx = new three.Quaternion().setFromAxisAngle(spinXAxis, SPIN_X_TURNS * Math.PI * 2 * eased)
      const qy = new three.Quaternion().setFromAxisAngle(spinYAxis, SPIN_Y_TURNS * Math.PI * 2 * eased)
      die.quaternion.copy(qy).multiply(qx)
    })

    // The throw's own ending quaternion -- a fully-known, authored
    // intermediate value (a deterministic function of SPIN_X_TURNS/
    // SPIN_Y_TURNS and THROW_MS, never randomized, never read back from a
    // simulation), NOT something this code "discovers." LAND slerps from
    // exactly this value.
    const throwEndQuat = die.quaternion.clone()

    // LAND -- decelerate onto the authoritative face, with a small,
    // controlled rotational overshoot-and-settle (`easeOutBack`), a tiny
    // landing-impact position dip, and squash-and-stretch scale for a
    // real sense of contact. `target` was read directly from
    // authoredD20ThreeOrientation.ts's own explicit table before this
    // beat (or any beat) began.
    await animatePhase(myGeneration, LAND_MS, (t) => {
      const eased = easeOutBack(t)
      die.quaternion.slerpQuaternions(throwEndQuat, targetQuat, eased)
      const y = -landBobOffset(t)
      die.position.set(0, y, 0)
      die.scale.set(landSquashScaleXZ(t), landSquashScaleY(t), landSquashScaleXZ(t))
      updateContactShadow(0, y, 0)
    })

    // Exact, guaranteed final pose -- overrides any floating-point drift
    // from 60+ frames of incremental slerping/scaling ("THE FINAL
    // ORIENTATION IS GUARANTEED EXACT," this file's own header).
    die.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w)
    die.position.set(0, 0, 0)
    die.scale.set(1, 1, 1)
    updateContactShadow(0, 0, 0)
    renderer.render(scene, camera)

    // FLOURISH -- deliberately minimal (this phase's own instruction): a
    // small, tier-blind scale pulse plus a brief emissive glint, nothing
    // result-quality-aware (Natural 20/1 effects remain Phase 4D).
    await animatePhase(myGeneration, FLOURISH_MS, (t) => {
      die.scale.setScalar(flourishScale(t))
      const boosted = baseEmissiveIntensity + flourishEmissiveBoost(t)
      for (const material of materials) material.emissiveIntensity = boosted
    })
    die.scale.setScalar(1)
    for (const material of materials) material.emissiveIntensity = baseEmissiveIntensity
    renderer.render(scene, camera)
  } catch (err: any) {
    error.value = err?.message || 'Authored Three.js d20 renderer failed.'
  } finally {
    // PHASE 4B.3 -- THE ONE PLACE THE STAGE IS HIDDEN. Runs on every
    // possible exit from the try block above -- normal completion, an
    // early `return`, or a caught exception -- so cleanup is a structural
    // guarantee rather than something that depended on the happy path
    // reaching one particular line (this task's own CLEANUP section).
    // `shown` skips the exit-wait entirely for a call that never actually
    // displayed anything (e.g. the "failed to initialize" early return);
    // the `myGeneration` check skips it for a call that has since been
    // superseded by a newer one, which already owns `visible` -- an old
    // call's `finally` must never hide a NEWER roll's own die.
    if (shown && myGeneration === animationGeneration) {
      // EXIT ("Record" in ADR-024 §6) -- the die's own pose is already
      // fully settled (or, on failure, no longer matters -- only the
      // outer stage's own fade/scale, template below, needs to run now).
      visible.value = false
      await new Promise((resolve) => setTimeout(resolve, EXIT_MS))
    }
  }
}

onBeforeUnmount(() => {
  // PHASE 4B.3 -- invalidate any in-flight `playD20()` immediately on
  // unmount. `animatePhase`'s per-frame `step()` checks this generation
  // every rAF tick and resolves early on mismatch, and `playD20()`'s own
  // `finally` block checks it before touching `visible` -- so an
  // in-flight ceremony stops scheduling frames against a renderer that's
  // about to be disposed below, without racing this teardown.
  animationGeneration += 1
  try {
    renderer?.dispose()
    dieMesh?.geometry?.dispose()
    const materials = dieMesh?.material
    if (Array.isArray(materials)) {
      for (const material of materials as import('three').MeshStandardMaterial[]) {
        material.map?.dispose()
        material.normalMap?.dispose()
        material.roughnessMap?.dispose()
        material.metalnessMap?.dispose()
        material.emissiveMap?.dispose()
        material.dispose()
      }
    }
    contactShadow?.geometry?.dispose()
    const shadowMaterial = contactShadow?.material
    if (shadowMaterial && !Array.isArray(shadowMaterial)) {
      (shadowMaterial as import('three').MeshBasicMaterial).map?.dispose()
      shadowMaterial.dispose()
    }
  } catch {
    // Tearing down an already-broken renderer must never throw during
    // unmount -- matches every sibling renderer's identical posture.
  }
})

defineExpose({
  playD20,
  error
})
</script>

<template>
  <!-- Roll System Phase 4B.1/4B.2 -- docked at the EXACT same shelf every
       prior Dice Presentation Layer renderer uses -- see this file's own
       header. -->
  <div
    class="eldra-authored-three-d20-stage pointer-events-none fixed z-[175] bottom-40 left-1/2 h-56 w-56 origin-bottom -translate-x-1/2 transition duration-150 ease-out sm:left-auto sm:right-6 sm:h-72 sm:w-72 sm:translate-x-0"
    :class="visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'"
  >
    <div
      ref="containerEl"
      class="eldra-authored-three-d20-scene-wrap"
    />
  </div>
</template>

<style scoped>
.eldra-authored-three-d20-stage {
  display: flex;
  align-items: center;
  justify-content: center;
}

.eldra-authored-three-d20-scene-wrap {
  width: 200px;
  height: 200px;
}

.eldra-authored-three-d20-scene-wrap :deep(canvas) {
  display: block;
}
</style>
