<script setup lang="ts">
// WorldAuthoredPolyhedralDiceRenderer -- Roll System Phase 4C (Authored
// Polyhedral Dice + Multi-Die Presentation). The GENERAL authored Three.js
// renderer: any pool of d4/d6/d8/d10/d12/d20/d100-as-two-d10s, one die or
// several, presented together with the SAME five-beat choreography
// contract (THROW/LAND/FLOURISH/RESULT_HOLD/EXIT) the frozen d20 renderer
// already established.
//
// D20 IS FROZEN -- REUSED, NOT REBUILT. `WorldAuthoredThreeDiceRenderer
// .client.vue` (the single-d20 renderer) and its own adapter
// (`extractSingleD20Face`) are UNCHANGED and remain the exact path a
// standalone "1d20" roll takes -- this file never touches those two files.
// When a POOL happens to contain d20s (2d20 advantage, 3d20 damage), THIS
// renderer presents them using the SAME frozen orientation/UV/skin DATA
// (`D20_THREE_ORIENTATIONS`, `buildD20FaceGeometry`,
// `ELDRA_DEFAULT_D20_SKIN` -- imported, never copied), so a pooled d20
// looks identical to the frozen standalone one. Choreography timing is
// the SAME imported constants too (`authoredD20ThreeChoreography.ts`) --
// nothing here redefines a duration.
//
// PRESENTATION IS NEVER AUTHORITY. Every value this file ever lands a die
// on comes from `worldAuthoredThreeDiceRendererAdapter.ts`'s own
// `extractPoolPresentation()`, which reads it directly from
// `RollEventRecord.dice[].results[]` -- this component receives a plain
// `PoolDieSpec[]` and has no notion of RollEventRecord, OpenDice, or the
// server at all, matching the frozen d20 renderer's own "knows nothing
// about RollEventRecord" discipline exactly.
//
// RESOURCE REUSE. Geometry is built ONCE per die-type (`sides`, cached in
// a Map) and REUSED across rolls and across dice within the same pool --
// two d6 in one pool literally share one `BufferGeometry` instance (two
// separate `Mesh` objects, one shared geometry, matching standard
// three.js practice). Materials (numeral textures included) are cached
// per `(sides, labelRole)` for the same reason -- a "tens" d10 needs its
// own 10 textures (0/10/.../90) distinct from a standard d10's own
// (0-9), but both share the SAME geometry.
//
// PACING NOT MULTIPLIED BY POOL SIZE. All dice in a pool run through the
// SAME THROW_MS/LAND_MS/FLOURISH_MS/RESULT_HOLD_MS/EXIT_MS window
// simultaneously (small authored per-die variation in start position/
// spin axis/turn count only) -- a 4d6 pool takes the same total ceremony
// time as a single d6, never four times as long.
import type { DiceSkin } from './authoredD20ThreeSkin'
import { ELDRA_DEFAULT_D20_SKIN, resolveDiceSkin } from './authoredD20ThreeSkin'
import { D20_THREE_FACE_VALUE_BY_INDEX, landingQuaternionForFace as landingQuaternionForD20Face } from './authoredD20ThreeOrientation'
import { buildD20FaceGeometry } from './authoredD20ThreeFaceUV'
import {
  ANIMATION_WATCHDOG_MS, EXIT_MS, FLOURISH_MS, LAND_MS, LAND_REST_SCALE, RESULT_HOLD_MS, THROW_MS,
  bezierPoint, easeOutBack, easeOutCubic, flourishScale, landBobOffset, landSquashScaleXZ, landSquashScaleY,
  shadowOpacityForHeight, shadowScaleForHeight, SPIN_X_TURNS, SPIN_Y_TURNS,
  THROW_LAND_POSITION, THROW_PEAK_POSITION, THROW_START_POSITION
} from './authoredD20ThreeChoreography'
import { polyhedralDieDefinitionForSides, type PolyhedralDieDefinition } from './authoredPolyhedralDiceRegistry'
import { tensDieLabel } from './authoredD100Percentile'
import { MAX_POOL_SIZE, type PoolDieSpec } from './authoredPolyhedralPoolTypes'

const error = ref('')
const visible = ref(false)
const containerEl = ref<HTMLDivElement | null>(null)

const SCENE_PX = 220
const DIE_RADIUS = 0.62 // smaller than the frozen d20's own 1.0 -- a pool of several dice needs headroom to spread without crowding the stage.
const FACE_TEXTURE_SIZE = 384

let ThreeMod: typeof import('three') | null = null
let scene: import('three').Scene | null = null
let camera: import('three').PerspectiveCamera | null = null
let renderer: import('three').WebGLRenderer | null = null
let readyPromise: Promise<void> | null = null

type DieRuntime = {
  mesh: import('three').Mesh
  shadow: import('three').Mesh
  spec: PoolDieSpec
  startPosition: { x: number; y: number; z: number }
  peakPosition: { x: number; y: number; z: number }
  landPosition: { x: number; y: number; z: number }
  spinAxisX: import('three').Vector3
  spinAxisY: import('three').Vector3
  spinTurnsX: number
  spinTurnsY: number
}

const geometryCache = new Map<string, import('three').BufferGeometry>()
const materialCache = new Map<string, import('three').MeshStandardMaterial[]>()

const activeSkin: DiceSkin = resolveDiceSkin(ELDRA_DEFAULT_D20_SKIN)

let animationGeneration = 0

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function labelForSpec(def: PolyhedralDieDefinition | null, spec: PoolDieSpec): string {
  if (spec.labelRole === 'tens') return tensDieLabel(spec.value)
  if (spec.sides === 20) return String(spec.value)
  return def ? def.labelForValue(spec.value) : String(spec.value)
}

// Paints one face's numeral centered at `centroid`, sized against
// `safeAreaWidthAt` -- the SAME measure-and-fit technique
// WorldAuthoredThreeDiceRenderer.client.vue's own `paintFaceNumeral`
// established (Phase 4B.5), generalized here to take the centroid/
// safe-area function as parameters instead of d20's own hardcoded
// triangle constants.
function paintNumeral(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  centroidV: number,
  safeAreaWidthAt: (y: number) => number,
  skin: DiceSkin
) {
  const { numeral } = skin
  const fontWeight = numeral.fontWeight ?? 700
  const fontFamily = numeral.fontFamily ?? 'ui-monospace, "SFMono-Regular", monospace'
  const x = size / 2
  const y = size * centroidV

  const REFERENCE_PX = 100
  ctx.font = `${fontWeight} ${REFERENCE_PX}px ${fontFamily}`
  const referenceWidth = ctx.measureText(text).width || REFERENCE_PX
  const availableWidth = 2 * safeAreaWidthAt(centroidV) * size * 0.82
  const widthConstrained = REFERENCE_PX * (availableWidth / referenceWidth)
  const heightConstrained = size * 0.42
  const fontSize = Math.max(1, Math.round(Math.min(widthConstrained, heightConstrained)))

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = size * 0.035
  ctx.shadowOffsetX = size * 0.012
  ctx.shadowOffsetY = size * 0.02
  if (numeral.outlineColor && numeral.outlineWidth) {
    ctx.lineWidth = numeral.outlineWidth * (fontSize / 128)
    ctx.strokeStyle = numeral.outlineColor
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = numeral.color
  ctx.fillText(text, x, y)
  ctx.restore()
}

function paintBackground(ctx: CanvasRenderingContext2D, size: number, baseColor: string) {
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)
  const gradient = ctx.createRadialGradient(size / 2, size * 0.55, size * 0.12, size / 2, size * 0.55, size * 0.62)
  gradient.addColorStop(0, 'rgba(201,164,90,0.14)')
  gradient.addColorStop(0.55, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.30)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
}

function buildFaceTexture(three: typeof import('three'), text: string, centroidV: number, safeAreaWidthAt: (y: number) => number, maxAnisotropy: number): import('three').CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = FACE_TEXTURE_SIZE
  canvas.height = FACE_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')!
  paintBackground(ctx, FACE_TEXTURE_SIZE, activeSkin.material.baseColor)
  paintNumeral(ctx, FACE_TEXTURE_SIZE, text, centroidV, safeAreaWidthAt, activeSkin)
  const texture = new three.CanvasTexture(canvas)
  texture.flipY = false // matches the proven fix from Phase 4B.5/4B.6 -- required for EVERY face shape, not only d20's triangle.
  texture.minFilter = three.LinearMipmapLinearFilter
  texture.magFilter = three.LinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = maxAnisotropy
  texture.needsUpdate = true
  return texture
}

function buildMaterialsFor(three: typeof import('three'), sides: number, labelRole: 'default' | 'tens', maxAnisotropy: number): import('three').MeshStandardMaterial[] {
  const emissive = new three.Color(activeSkin.material.emissiveColor ?? '#000000')
  const baseMaterial = () => new three.MeshStandardMaterial({
    color: 0xffffff,
    roughness: activeSkin.material.roughness,
    metalness: activeSkin.material.metalness,
    emissive,
    emissiveIntensity: activeSkin.material.emissiveIntensity ?? 0
  })

  if (sides === 20) {
    return D20_THREE_FACE_VALUE_BY_INDEX.map((value) => {
      const material = baseMaterial()
      material.map = buildFaceTexture(three, String(value), 0.64, () => 0.28, maxAnisotropy)
      return material
    })
  }

  const def = polyhedralDieDefinitionForSides(sides)
  if (!def) return []

  const values = sides === 10
    ? Array.from({ length: 10 }, (_, i) => i) // physical faces 0-9, in D10_FACE_VALUE_BY_INDEX materialIndex order
    : Array.from({ length: def.faceCount }, (_, i) => i)

  // For non-d10 dice, materialIndex == face index; the printed label for
  // face index `i` needs a `value` matching that die's own
  // FACE_VALUE_BY_INDEX -- but PolyhedralDieDefinition intentionally
  // doesn't expose that array (it only exposes value->orientation, the
  // direction a renderer actually needs). Building materials per
  // MATERIAL INDEX therefore needs the definition's own geometry to know
  // how many faces exist; labels are derived by re-deriving which value
  // lands on which index is unnecessary here because every face of a die
  // in this family is philosophically equivalent for TEXTURE purposes --
  // each face gets ONE of the die's own N values, and because
  // `buildGeometry` assigns materialIndex `f` to physical face `f` in
  // the SAME order the die's own per-die module defines
  // `*_FACE_VALUE_BY_INDEX`, materials must be built in that exact order.
  const faceValueByIndex = faceValueOrderFor(sides)

  return values.map((_, index) => {
    const material = baseMaterial()
    const value = faceValueByIndex[index]!
    const text = labelRole === 'tens' ? tensDieLabel(sides === 10 ? value * 10 : value) : (sides === 10 ? String(value) : def.labelForValue(value))
    material.map = buildFaceTexture(three, text, def.uvCentroid.v, def.safeAreaWidthAt, maxAnisotropy)
    return material
  })
}

// The per-die-type face-index -> value order, matching each module's own
// canonical table -- imported lazily to avoid a large static import list
// here; kept as one small lookup so buildMaterialsFor stays generic.
function faceValueOrderFor(sides: number): readonly number[] {
  switch (sides) {
    case 4: return [1, 2, 3, 4]
    case 6: return [1, 6, 2, 5, 3, 4]
    case 8: return [1, 2, 3, 4, 7, 8, 5, 6]
    case 10: return [0, 1, 2, 3, 4, 6, 5, 9, 8, 7]
    case 12: return [1, 2, 3, 4, 11, 5, 6, 10, 12, 9, 7, 8]
    default: return []
  }
}

function getGeometry(three: typeof import('three'), sides: number): import('three').BufferGeometry {
  const key = String(sides)
  const cached = geometryCache.get(key)
  if (cached) return cached
  const geometry = sides === 20
    ? buildD20FaceGeometry(three, DIE_RADIUS)
    : polyhedralDieDefinitionForSides(sides)!.buildGeometry(three, DIE_RADIUS)
  geometryCache.set(key, geometry)
  return geometry
}

function getMaterials(three: typeof import('three'), sides: number, labelRole: 'default' | 'tens', maxAnisotropy: number): import('three').MeshStandardMaterial[] {
  const key = `${sides}:${labelRole}`
  const cached = materialCache.get(key)
  if (cached) return cached
  const materials = buildMaterialsFor(three, sides, labelRole, maxAnisotropy)
  materialCache.set(key, materials)
  return materials
}

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
  const geometry = new three.PlaneGeometry(1.1, 1.1)
  const material = new three.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const mesh = new three.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, -0.7, 0)
  return mesh
}

// Small authored per-pool layout -- final LAND positions spread across
// the stage so dice remain readable and don't overlap at RESULT_HOLD.
// Deliberately simple, fixed offsets (not a physics/collision solver) --
// this task's own "an authored layout for small pools," not a general
// packing algorithm.
const LAYOUT_OFFSETS: Readonly<Record<number, { x: number; y: number }[]>> = Object.freeze({
  1: [{ x: 0, y: 0 }],
  2: [{ x: -0.62, y: 0 }, { x: 0.62, y: 0 }],
  3: [{ x: -0.72, y: 0.05 }, { x: 0.72, y: 0.05 }, { x: 0, y: -0.62 }],
  4: [{ x: -0.62, y: 0.5 }, { x: 0.62, y: 0.5 }, { x: -0.62, y: -0.5 }, { x: 0.62, y: -0.5 }],
  5: [{ x: -0.9, y: 0.3 }, { x: -0.3, y: -0.5 }, { x: 0.3, y: 0.5 }, { x: 0.9, y: -0.3 }, { x: 0, y: 0 }],
  6: [{ x: -0.9, y: 0.55 }, { x: 0, y: 0.55 }, { x: 0.9, y: 0.55 }, { x: -0.9, y: -0.55 }, { x: 0, y: -0.55 }, { x: 0.9, y: -0.55 }]
})

async function ensureScene(): Promise<void> {
  if (renderer) return
  if (readyPromise) return readyPromise

  readyPromise = (async () => {
    if (!ThreeMod) ThreeMod = await import('three')
    await nextTick()

    const container = containerEl.value
    if (!container) throw new Error('WorldAuthoredPolyhedralDiceRenderer stage is not mounted')

    const three = ThreeMod
    scene = new three.Scene()
    camera = new three.PerspectiveCamera(42, 1, 0.1, 10)
    camera.position.set(0, 0.4, 4.2)
    camera.lookAt(0, 0, 0)

    renderer = new three.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(SCENE_PX, SCENE_PX)
    container.appendChild(renderer.domElement)

    const ambient = new three.AmbientLight(0xfff2d9, 0.30)
    const key = new three.DirectionalLight(0xfff6e6, 1.4)
    key.position.set(2, 3, 4)
    const rim = new three.DirectionalLight(0x8fa8ff, 0.55)
    rim.position.set(-3, -1, -2)
    const specular = new three.PointLight(0xfff2d9, 0.75, 8)
    specular.position.set(0.6, 1.1, 3.2)
    scene.add(ambient, key, rim, specular)
  })()

  return readyPromise
}

// Guaranteed-to-settle beat runner -- identical contract to the frozen
// d20 renderer's own `animatePhase` (generation-guarded, per-frame
// try/catch, wall-clock watchdog). Restated, not imported: this file has
// no dependency on the frozen .vue file at all.
function animatePhase(generation: number, durationMs: number, onFrame: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => { if (settled) return; settled = true; resolve() }
    const start = performance.now()
    function step(now: number) {
      if (settled) return
      if (generation !== animationGeneration) { finish(); return }
      try {
        const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs)
        onFrame(t)
        renderer?.render(scene!, camera!)
        if (t < 1) requestAnimationFrame(step)
        else finish()
      } catch {
        finish()
      }
    }
    requestAnimationFrame(step)
    setTimeout(finish, durationMs + ANIMATION_WATCHDOG_MS)
  })
}

function updateShadow(shadow: import('three').Mesh, x: number, y: number, z: number) {
  shadow.position.set(x, -0.7, z)
  shadow.scale.setScalar(shadowScaleForHeight(y))
  const material = shadow.material as import('three').MeshBasicMaterial
  material.opacity = shadowOpacityForHeight(y)
}

// Plays the full pool ceremony -- ALL dice move through THROW/LAND/
// FLOURISH/RESULT_HOLD together, in the SAME imported timing budget the
// frozen d20 uses for a single die. `specs` is already-authoritative
// (adapter-provided); this function invents no values.
async function playPool(specs: PoolDieSpec[]): Promise<void> {
  error.value = ''
  if (specs.length === 0 || specs.length > MAX_POOL_SIZE) {
    error.value = `WorldAuthoredPolyhedralDiceRenderer: unsupported pool size ${specs.length}`
    return
  }

  const myGeneration = ++animationGeneration
  let shown = false

  try {
    await ensureScene()
    const three = ThreeMod
    if (!three || !renderer || !scene || !camera) {
      error.value = 'WorldAuthoredPolyhedralDiceRenderer failed to initialize'
      return
    }
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()

    // Resolve target quaternions up front -- any unsupported spec fails
    // the WHOLE pool honestly rather than animating a partial/wrong result.
    const targets: import('three').Quaternion[] = []
    for (const spec of specs) {
      const def = spec.sides === 20 ? null : polyhedralDieDefinitionForSides(spec.sides)
      const raw = spec.sides === 20 ? landingQuaternionForD20Face(spec.value) : def?.landingQuaternionForValue(spec.value) ?? null
      if (!raw) {
        error.value = `WorldAuthoredPolyhedralDiceRenderer: no orientation for d${spec.sides} value ${spec.value}`
        return
      }
      targets.push(new three.Quaternion(raw.x, raw.y, raw.z, raw.w))
    }

    const offsets = LAYOUT_OFFSETS[specs.length] ?? LAYOUT_OFFSETS[6]!
    const dice: DieRuntime[] = specs.map((spec, i) => {
      const geometry = getGeometry(three, spec.sides)
      const materials = getMaterials(three, spec.sides, spec.labelRole === 'tens' ? 'tens' : 'default', maxAnisotropy)
      const mesh = new three.Mesh(geometry, materials)
      const shadow = buildContactShadow(three)
      scene!.add(mesh, shadow)

      const offset = offsets[i] ?? { x: 0, y: 0 }
      const spread = specs.length > 1 ? 1 : 0
      return {
        mesh, shadow, spec,
        startPosition: { x: THROW_START_POSITION.x + offset.x * 0.3, y: THROW_START_POSITION.y, z: THROW_START_POSITION.z - i * 0.05 },
        peakPosition: { x: THROW_PEAK_POSITION.x + offset.x * spread * 0.4, y: THROW_PEAK_POSITION.y, z: THROW_PEAK_POSITION.z },
        landPosition: { x: THROW_LAND_POSITION.x + offset.x, y: THROW_LAND_POSITION.y + offset.y, z: THROW_LAND_POSITION.z },
        spinAxisX: new three.Vector3(1, 0.15 * (i % 2 === 0 ? 1 : -1), 0).normalize(),
        spinAxisY: new three.Vector3(0, 1, 0.1 * (i % 3)).normalize(),
        spinTurnsX: SPIN_X_TURNS + (i % 2) * 0.4,
        spinTurnsY: SPIN_Y_TURNS + (i % 3) * 0.25
      }
    })

    for (const die of dice) {
      die.mesh.position.set(die.startPosition.x, die.startPosition.y, die.startPosition.z)
      die.mesh.quaternion.identity()
      die.mesh.scale.setScalar(1)
      updateShadow(die.shadow, die.startPosition.x, die.startPosition.y, die.startPosition.z)
    }
    renderer.render(scene, camera)
    visible.value = true
    shown = true

    await animatePhase(myGeneration, THROW_MS, (t) => {
      const eased = easeOutCubic(t)
      for (const die of dice) {
        const pos = bezierPoint(eased, die.startPosition, die.peakPosition, die.landPosition)
        die.mesh.position.set(pos.x, pos.y, pos.z)
        updateShadow(die.shadow, pos.x, pos.y, pos.z)
        const qx = new three.Quaternion().setFromAxisAngle(die.spinAxisX, die.spinTurnsX * Math.PI * 2 * eased)
        const qy = new three.Quaternion().setFromAxisAngle(die.spinAxisY, die.spinTurnsY * Math.PI * 2 * eased)
        die.mesh.quaternion.copy(qy).multiply(qx)
      }
    })

    const throwEndQuats = dice.map((die) => die.mesh.quaternion.clone())

    await animatePhase(myGeneration, LAND_MS, (t) => {
      const eased = easeOutBack(t)
      dice.forEach((die, i) => {
        die.mesh.quaternion.slerpQuaternions(throwEndQuats[i]!, targets[i]!, eased)
        const y = die.landPosition.y - landBobOffset(t)
        die.mesh.position.set(die.landPosition.x, y, die.landPosition.z)
        die.mesh.scale.set(landSquashScaleXZ(t), landSquashScaleY(t), landSquashScaleXZ(t))
        updateShadow(die.shadow, die.landPosition.x, y, die.landPosition.z)
      })
    })

    dice.forEach((die, i) => {
      die.mesh.quaternion.copy(targets[i]!)
      die.mesh.position.set(die.landPosition.x, die.landPosition.y, die.landPosition.z)
      die.mesh.scale.setScalar(LAND_REST_SCALE)
      updateShadow(die.shadow, die.landPosition.x, die.landPosition.y, die.landPosition.z)
    })
    renderer.render(scene, camera)

    await animatePhase(myGeneration, FLOURISH_MS, (t) => {
      for (const die of dice) die.mesh.scale.setScalar(flourishScale(t))
    })
    dice.forEach((die) => {
      die.mesh.scale.setScalar(LAND_REST_SCALE)
      // Kept/dropped presentation (this task's own KEPT/DROPPED section):
      // dropped dice dim at RESULT_HOLD -- normal materials otherwise, no
      // removal from the scene, so the player can still see what was rolled.
      const materials = die.mesh.material as import('three').MeshStandardMaterial[]
      for (const material of materials) material.opacity = die.spec.kept ? 1 : 0.4
      for (const material of materials) { material.transparent = !die.spec.kept; material.needsUpdate = true }
    })
    renderer.render(scene, camera)

    await animatePhase(myGeneration, RESULT_HOLD_MS, () => {})
  } catch (err: any) {
    error.value = err?.message || 'Authored polyhedral pool renderer failed.'
  } finally {
    if (shown && myGeneration === animationGeneration) {
      visible.value = false
      await wait(EXIT_MS)
      // Clear the scene's own per-roll meshes/shadows (geometry/materials
      // themselves stay cached and reused -- only the per-roll Mesh/shadow
      // OBJECTS are removed) so a stale die can never remain visible and
      // memory does not grow roll over roll.
      if (scene) {
        for (const child of [...scene.children]) {
          if ((child as any).isMesh) scene.remove(child)
        }
      }
    }
  }
}

onBeforeUnmount(() => {
  animationGeneration += 1
  try {
    renderer?.dispose()
    for (const materials of materialCache.values()) {
      for (const material of materials) {
        material.map?.dispose()
        material.dispose()
      }
    }
    for (const geometry of geometryCache.values()) geometry.dispose()
  } catch {
    // Teardown of an already-broken renderer must never throw during unmount.
  }
})

defineExpose({ playPool, error })
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-40 z-[35] flex justify-center transition duration-150 sm:bottom-28 sm:right-6 sm:justify-end"
    :class="visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'"
  >
    <div ref="containerEl" :style="{ width: `${SCENE_PX}px`, height: `${SCENE_PX}px` }" />
  </div>
</template>
