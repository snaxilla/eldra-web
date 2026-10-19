<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { ThpaceGL } from 'thpace'

const thpaceBackdropProps = withDefaults(defineProps<{
  fixed?: boolean
  mode?: 'fixed' | 'absolute' | 'sticky'
  // Phase 3C: a page that shows the universe only until the GM gives it a
  // page background (Page Setup) passes this; the universe then hides and
  // stops rendering while that background is active.
  yieldToPageBackdrop?: boolean
}>(), {
  fixed: true,
  mode: undefined,
  yieldToPageBackdrop: false
})

const thpaceBackdropMode = computed(() =>
  thpaceBackdropProps.mode || (thpaceBackdropProps.fixed ? 'fixed' : 'absolute')
)

// Set by the world-workspace layout while a GM page background is drawn.
const pageBackdropActive = useState<boolean>('world-page-backdrop-active', () => false)
const hidden = computed(() => thpaceBackdropProps.yieldToPageBackdrop && pageBackdropActive.value)

const thpaceBackdropClass = computed(() => [
  'pointer-events-none z-0 overflow-hidden',
  thpaceBackdropMode.value === 'fixed'
    ? 'fixed inset-0'
    : thpaceBackdropMode.value === 'sticky'
      ? 'sticky top-0 h-[100dvh] min-h-[100dvh]'
      : 'absolute inset-0',
  // Hidden keeps its box: sticky pages offset their content against it.
  hidden.value ? 'invisible' : ''
])


const canvasRef = ref<HTMLCanvasElement | null>(null)

let thpaceInstance: any = null

function mountThpace() {
  const canvas = canvasRef.value
  if (!canvas) return

  const settings = {
    colors: [
      '#4366a7',
      '#3e2966',
      '#0c0b0c'
    ],
    triangleSize: 10,
    bleed: 81,
    noise: -18,
    pointVariationX: 50,
    pointVariationY: 50,
    pointAnimationSpeed: 8327,
    animationOffset: 171,
    maxFps: 144,
    automaticResize: true,
    particleSettings: {
      count: [2, 4],
      interval: [5000, 9000],
      radius: [1.6, 2.9],
      opacity: [0.24, 0.58],
      variationX: [2.4, 17],
      variationY: [2, 6],
      color: '#7387d4'
    }
  }

  thpaceInstance = ThpaceGL.create(canvas, settings)
}

// --- Animation lifecycle (Phase 3C) ------------------------------------------
// thpace draws on every animation frame while `animating` is true, whether
// or not the canvas is visible, and re-arms requestAnimationFrame forever;
// its own resize handler restarts the animation. So the universe animates
// only while it is shown and the viewer has not asked for reduced motion
// (Eldra's preference or the OS setting, as on the World Map). Reduced
// motion keeps the artwork: one frame is drawn, then the animation stops
// and the canvas keeps showing that frame.
const accessibility = useAccessibilityPreferences()
const osReducedMotion = ref(false)
const reducedMotion = computed(() => accessibility.value.reducedMotion || osReducedMotion.value)

let motionQuery: MediaQueryList | null = null
let freezeFrame = 0

function onMotionQueryChange(event: MediaQueryListEvent) {
  osReducedMotion.value = event.matches
}

function syncAnimation() {
  const instance = thpaceInstance
  if (!instance) return
  cancelAnimationFrame(freezeFrame)
  if (hidden.value) {
    instance.stop()
    return
  }
  instance.resume()
  if (!reducedMotion.value) return
  // Two frames: thpace draws on the first, the browser presents it.
  freezeFrame = requestAnimationFrame(() => {
    freezeFrame = requestAnimationFrame(() => {
      if (reducedMotion.value || hidden.value) instance.stop()
    })
  })
}

watch([hidden, reducedMotion], syncAnimation)

onMounted(() => {
  motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  osReducedMotion.value = motionQuery?.matches === true
  motionQuery?.addEventListener?.('change', onMotionQueryChange)
  mountThpace()
  // Registered after thpace's own resize listener, so it runs after the
  // re-initialisation that restarts the animation.
  window.addEventListener('resize', syncAnimation)
  syncAnimation()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(freezeFrame)
  motionQuery?.removeEventListener?.('change', onMotionQueryChange)
  window.removeEventListener('resize', syncAnimation)
  const instance = thpaceInstance
  thpaceInstance = null
  if (!instance) return
  // thpace has no teardown (`remove()` does not exist), so without this the
  // render loop, its resize listener and the WebGL context outlive the page.
  instance.stop()
  window.removeEventListener('resize', instance.resize)
  // The loop re-arms itself through `this.animate`; replacing it ends the
  // loop on the next frame.
  instance.animate = () => {}
  instance.gl?.getExtension?.('WEBGL_lose_context')?.loseContext()
})
</script>

<template>
  <div
    :class="thpaceBackdropClass"
    :aria-hidden="true"
    data-eldra-universe
  >
    <canvas ref="canvasRef" class="absolute inset-0 h-full w-full" />
    <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,17,0.18)_0%,rgba(2,6,17,0.10)_42%,rgba(2,6,17,0.34)_100%)]" />
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_35%)]" />
  </div>
</template>
