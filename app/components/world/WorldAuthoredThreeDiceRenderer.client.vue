<script setup lang="ts">
// WorldAuthoredThreeDiceRenderer -- Eldra Roll System Phase 4B.1
// (Authored Three.js d20 Proof of Concept). Implements ADR-024
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
// worldAuthoredThreeDiceRendererAdapter.ts) -- verified by direct grep,
// reported in this phase's own summary, not merely asserted here. `three`
// is used ONLY as a rendering/graphics library (scene graph, geometry,
// materials, a render loop) -- never as a physics/simulation engine, and
// this file never calls anything resembling `world.step()`, never
// constructs a rigid body, and never asks a physics engine "where did
// this land."
//
// vs. WorldAuthoredDiceRenderer.vue (Phase 4B's own CSS/DOM proof of
// concept -- never committed to git, and not registered by any committed
// code; see useDiceRendererMode.ts's own header for the deployment-fix
// account of why): that approach proved the ARCHITECTURE (authored
// presentation, deterministic targets, fixed duration, DiceRendererAdapter
// as the correct seam) but
// its "sphere of 20 independent face cards" visual did not read as a real
// 3D die. This file builds a GENUINE, single, rigid icosahedral mesh --
// `THREE.IcosahedronGeometry`, the same solid a real d20 has -- and
// rotates the WHOLE OBJECT as one piece, the way an actual die tumbles.
//
// THE ONE RULE BOTH REJECTED APPROACHES SHARE WITH THIS ONE, UNCHANGED:
// the server decides reality; this file only ever presents it. `playD20
// (face)` receives `face` as an INPUT, already final, already
// authoritative, before a single frame of animation plays. There is no
// step anywhere in this file that "discovers," simulates, or randomizes a
// resting face -- there is only a precomputed target
// (authoredD20ThreeOrientation.ts's own `landingQuaternionForFace`) that
// every throw is authored to arrive at exactly.
//
// ---------------------------------------------------------------------------
// OWNERSHIP -- THREE.JS AS A LIBRARY, NOT dice-box-threejs AS A RUNTIME
// ---------------------------------------------------------------------------
// This file imports `three` directly (`package.json`'s own dependency,
// added this phase -- see this phase's own summary for why it was
// previously only a transitive dependency of
// @3d-dice/dice-box-threejs, and why that was no longer good enough once
// this file needed to import the library itself). It does NOT import
// @3d-dice/dice-box-threejs, does not call its `roll()`/
// `simulateThrow()`/`animateThrow()`, and does not monkey-patch anything
// on it (contrast WorldDiceThreeRenderer.client.vue's own Phase 3F
// `spawnDice` hook, which this file has no equivalent of, because it has
// no physics body to hook). Geometry/material KNOWLEDGE -- how to build
// an icosahedron, how per-face materials/UVs work -- is general Three.js
// knowledge, not anything read from or coupled to dice-box-threejs's own
// runtime; see authoredD20ThreeOrientation.ts's own header for exactly
// where this file's geometry construction was independently verified
// against three@0.143.0's own shipped source, not assumed.
//
// ---------------------------------------------------------------------------
// GEOMETRY -- A REAL ICOSAHEDRON, NOT TWENTY FLOATING CARDS
// ---------------------------------------------------------------------------
// `new THREE.IcosahedronGeometry(DIE_RADIUS, 0)` -- one rigid, convex,
// 20-triangle solid. Its default spherical (azimuth/inclination) UVs are
// replaced with a canonical top/bottom-right/bottom-left triangle,
// IDENTICALLY repeated for all 20 faces (`buildGeometry` below) -- the
// default UVs would map each face to an arbitrary, badly-distorted sliver
// of a global equirectangular texture; a fixed, repeated triangle instead
// makes every face's own separately-baked numeral texture (`createFace
// Texture`) render consistently regardless of where that face sits on the
// sphere. `geometry.addGroup(3f, 3, f)` assigns each face its OWN
// materialIndex (0-19), so 20 independent `MeshStandardMaterial`s (one
// numeral each) can be painted onto one physical mesh -- the standard
// Three.js "per-face material" technique, unrelated to and unlearned from
// dice-box-threejs.
//
// Buffer-vertex 0 of face `f` (position index `3f`) is, by construction,
// the SAME vertex authoredD20ThreeOrientation.ts's own derivation treats
// as that face's "up" reference (see that file's own header, step 2) --
// this is why that vertex is assigned the TOP uv coordinate here: it is
// what makes a landed face's printed numeral appear upright on screen,
// not a coincidence between two independently-tuned numbers.
//
// ---------------------------------------------------------------------------
// MATERIAL / LIGHTING
// ---------------------------------------------------------------------------
// `MeshStandardMaterial` (physically-based, needs real light sources --
// intentional: an unlit material would look flat and fail this task's own
// "lighting sufficient to make the geometry immediately legible"
// requirement). Each face's texture is drawn on a warm gold ground
// (`#c9a45a`, matching the same accent color WorldRollTray.vue/
// WorldDiceAnimation.vue already use throughout the Dice Presentation
// Layer) with a dark inlaid numeral, so the number reads as carved into
// the die rather than pasted onto it. One warm key light plus a cool rim
// light plus ambient fill give every face visible depth/shading without
// needing an environment map -- appropriate for a small, close-up,
// presentational object, not a claim this is final art direction (this
// phase's own "do not chase final art direction yet").
//
// ---------------------------------------------------------------------------
// THE THROW -- AUTHORED position(t)/rotation(t)/scale(t), NEVER
// force/gravity/sleep-state
// ---------------------------------------------------------------------------
// All motion math (the Bezier arc, the spin turn-counts, the
// overshoot-and-settle easing, every duration) lives in
// authoredD20ThreeChoreography.ts, a plain, WebGL-free module -- this file
// only ever reads those constants/functions and applies their output to
// real `THREE.Object3D.position`/`.quaternion`/`.scale` each animation
// frame. See that file's own header for the full beat-by-beat account of
// why Enter+Roll are one continuous motion, why the ROLL phase's own spin
// deliberately does NOT target the authoritative face (this task's own
// ROTATION STRATEGY: "Do NOT simply interpolate identity -> target
// face... that will look like a model viewer"), and exactly where LAND's
// slerp starts from a fully-known, authored intermediate quaternion --
// never a value "discovered" mid-animation.
//
// THE FINAL ORIENTATION IS GUARANTEED EXACT, NOT MERELY "CLOSE ENOUGH
// AFTER EASING." `easeOutBack(1)` is algebraically exactly `1` (see that
// function's own docstring), so the slerp already lands exactly on
// target -- but this file ALSO hard-assigns the die's quaternion to the
// literal target values once LAND's own animation loop exits, overriding
// any floating-point drift from 60+ frames of incremental slerping. The
// same defensive-exactness posture applies to position (`THROW_LAND
// _POSITION`, dead center) after LAND's own landing-bob settles to zero.
//
// ---------------------------------------------------------------------------
// STAGE / DOCKING -- REUSED, NOT REINVENTED
// ---------------------------------------------------------------------------
// Docked at the EXACT same shelf every prior Dice Presentation Layer
// renderer uses (`bottom-40`/`h-56`/`w-56` mobile,
// `sm:right-6`/`h-72`/`w-72` desktop, `origin-bottom`) -- Phase 3G
// established this position for the physics renderer, Phase 4B reused it
// for the CSS proof of concept, and this file reuses it a third time, so
// flipping useDiceRendererMode.ts between any of the three renderers
// never visibly relocates or resizes the stage. `visible` (not `v-show`)
// drives the outer container's own fade/scale -- WorldDiceThreeRenderer
// .client.vue's own header documents exactly why `display:none` would be
// a correctness hazard for a renderer that reads `container.clientWidth`;
// this component never reads that (it uses a fixed internal render
// resolution, `SCENE_PX`, matching Phase 4B's own identical reasoning),
// so the hazard does not apply here either, but keeping every renderer's
// outer-stage mechanics identical is its own, simpler justification.
// EXIT/"Record" (ADR-024 §6) is exactly this same outer-stage fade,
// reused unchanged a third time -- the die's own pose is already fully
// settled by the time this beat begins; only the framing around it fades.

import { D20_THREE_FACE_VALUE_BY_INDEX, landingQuaternionForFace } from './authoredD20ThreeOrientation'
import {
  bezierPoint,
  easeOutBack,
  easeOutCubic,
  EXIT_MS,
  flourishScale,
  FLOURISH_MS,
  landBobOffset,
  LAND_MS,
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

// Fixed internal render resolution -- deliberately NOT breakpoint-aware,
// matching Phase 4B's own identical reasoning (WorldAuthoredDiceRenderer
// .vue's own header): the OUTER stage box is responsive via Tailwind
// classes (template, below); this fixed-size inner scene is centered
// within it via flexbox, so the 3D setup itself never needs
// per-breakpoint recomputation.
const SCENE_PX = 200
const DIE_RADIUS = 1

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
let readyPromise: Promise<void> | null = null

// Real THREE.Vector3 axis constants -- constructed once ThreeMod is
// loaded (ensureScene, below), not plain `{x,y,z}` literals, so
// `Quaternion.setFromAxisAngle` receives the real type it expects.
let xAxis: import('three').Vector3 | null = null
let yAxis: import('three').Vector3 | null = null

// Draws one face's numeral onto a small canvas, warm-gold ground with a
// dark inlaid number -- see this file's own header for the palette
// rationale. The numeral is centered on the SAMPLED triangle's own
// centroid (uv y ~= 0.08/0.92/0.92 -> centroid y ~= 0.64 of the canvas
// height), not the canvas's own geometric center, so it reads centered
// once only that triangular slice of the texture is visible on the die.
function createFaceTexture(three: typeof import('three'), value: number): import('three').CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#c9a45a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#2a2013'
  ctx.font = '700 58px ui-monospace, "SFMono-Regular", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(value), canvas.width / 2, canvas.height * 0.64)

  const texture = new three.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

// Replaces IcosahedronGeometry's own default spherical UVs with a
// canonical, per-face-identical triangle, and assigns each face its own
// materialIndex -- see this file's own header, GEOMETRY section, for why.
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

  return geometry
}

function buildMaterials(three: typeof import('three')): import('three').MeshStandardMaterial[] {
  return D20_THREE_FACE_VALUE_BY_INDEX.map((value) => new three.MeshStandardMaterial({
    map: createFaceTexture(three, value),
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0.12
  }))
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
    // rather than a flat model-viewer thumbnail (this task's own
    // "perspective/depth" requirement). The landing math itself targets
    // world +Z exactly (authoredD20ThreeOrientation.ts's own header) --
    // this small camera tilt is a separate, purely cosmetic choice, not
    // baked into the orientation table.
    camera.position.set(0, 0.35, 3.4)
    camera.lookAt(0, 0, 0)

    renderer = new three.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(SCENE_PX, SCENE_PX)
    container.appendChild(renderer.domElement)

    const ambient = new three.AmbientLight(0xfff2d9, 0.55)
    const key = new three.DirectionalLight(0xfff2d9, 1.0)
    key.position.set(2, 3, 4)
    const rim = new three.DirectionalLight(0x8fa8ff, 0.35)
    rim.position.set(-3, -1, -2)
    scene.add(ambient, key, rim)

    const geometry = buildGeometry(three)
    const materials = buildMaterials(three)
    dieMesh = new three.Mesh(geometry, materials)
    scene.add(dieMesh)

    // Draw one initial frame at rest so nothing flashes before the first
    // roll's own reset-and-fade-in.
    dieMesh.position.set(0, 0, 0)
    dieMesh.quaternion.identity()
    renderer.render(scene, camera)
  })()

  return readyPromise
}

// Runs `onFrame(t)` on every animation frame for `durationMs`, `t`
// clamped to `[0, 1]` (`t` reaches exactly `1` on the final call before
// resolving), rendering the scene after each call. Pure orchestration --
// all actual motion math lives in authoredD20ThreeChoreography.ts.
function animatePhase(durationMs: number, onFrame: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()
    function step(now: number) {
      const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs)
      onFrame(t)
      renderer!.render(scene!, camera!)
      if (t < 1) {
        requestAnimationFrame(step)
      } else {
        resolve()
      }
    }
    requestAnimationFrame(step)
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

  try {
    await ensureScene()
    const three = ThreeMod
    if (!three || !renderer || !scene || !camera || !dieMesh || !xAxis || !yAxis) {
      error.value = 'WorldAuthoredThreeDiceRenderer failed to initialize'
      return
    }
    // Local `const` captures -- TS narrows `let` variables per-statement,
    // not across the closures passed to `animatePhase` below, since a
    // mutable outer binding could in principle change between the check
    // above and a later callback invocation. These captures make the
    // already-true "these are non-null for the rest of this call" fact
    // visible to the type checker.
    const die = dieMesh
    const spinXAxis = xAxis
    const spinYAxis = yAxis

    const targetQuat = new three.Quaternion(target.x, target.y, target.z, target.w)

    // Reset to the authored throw's own starting pose BEFORE fading in,
    // so a fast-repeating roll never flashes the PREVIOUS roll's landed
    // face during its own entrance -- matches every sibling renderer's
    // identical "reset before fade-in" posture.
    die.position.set(THROW_START_POSITION.x, THROW_START_POSITION.y, THROW_START_POSITION.z)
    die.quaternion.identity()
    die.scale.setScalar(1)
    renderer.render(scene, camera)
    visible.value = true

    // THROW (Enter + Roll, one continuous motion -- see this file's own
    // header and authoredD20ThreeChoreography.ts's own header for why).
    // Position follows the authored Bezier arc; rotation is a fast,
    // multi-axis spin that does NOT target the authoritative face --
    // LAND (next) is what arrives at the exact, already-known target.
    await animatePhase(THROW_MS, (t) => {
      const eased = easeOutCubic(t)
      const pos = bezierPoint(eased, THROW_START_POSITION, THROW_PEAK_POSITION, THROW_LAND_POSITION)
      die.position.set(pos.x, pos.y, pos.z)

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
    // controlled rotational overshoot-and-settle (`easeOutBack`) plus a
    // tiny landing-impact dip. `target` was read directly from
    // authoredD20ThreeOrientation.ts's own explicit table before this
    // beat (or any beat) began.
    await animatePhase(LAND_MS, (t) => {
      const eased = easeOutBack(t)
      die.quaternion.slerpQuaternions(throwEndQuat, targetQuat, eased)
      die.position.set(0, -landBobOffset(t), 0)
    })

    // Exact, guaranteed final pose -- overrides any floating-point drift
    // from 60+ frames of incremental slerping (this file's own header:
    // "THE FINAL ORIENTATION IS GUARANTEED EXACT").
    die.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w)
    die.position.set(0, 0, 0)
    renderer.render(scene, camera)

    // FLOURISH -- deliberately minimal (this phase's own instruction): a
    // small, tier-blind scale pulse, nothing result-quality-aware.
    await animatePhase(FLOURISH_MS, (t) => {
      die.scale.setScalar(flourishScale(t))
    })
    die.scale.setScalar(1)
    renderer.render(scene, camera)

    // EXIT ("Record" in ADR-024 §6) -- the die's own pose is already
    // fully settled; only the outer stage's own fade/scale (template,
    // below) needs to run now.
    visible.value = false
    await new Promise((resolve) => setTimeout(resolve, EXIT_MS))
  } catch (err: any) {
    error.value = err?.message || 'Authored Three.js d20 renderer failed.'
    visible.value = false
  }
}

onBeforeUnmount(() => {
  try {
    renderer?.dispose()
    dieMesh?.geometry?.dispose()
    const materials = dieMesh?.material
    if (Array.isArray(materials)) {
      for (const material of materials as import('three').MeshStandardMaterial[]) {
        material.map?.dispose()
        material.dispose()
      }
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
  <!-- Roll System Phase 4B.1 -- docked at the EXACT same shelf every
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
