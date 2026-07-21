<script setup lang="ts">
import { ThpaceGL } from 'thpace'

const hostRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let thpaceInstance: any = null
let resizeObserver: ResizeObserver | null = null
let rebuildFrame = 0

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

function importerPaneElement() {
  const host = hostRef.value
  if (!host) return null

  return host.closest('[data-world-importer-page]') as HTMLElement | null
}

function paneBounds() {
  const pane = importerPaneElement()
  const rect = pane?.getBoundingClientRect()

  const left = Math.max(0, rect?.left ?? 0)
  const top = Math.max(0, rect?.top ?? 0)
  const right = Math.min(window.innerWidth, rect?.right ?? window.innerWidth)
  const width = Math.max(1, right - left)
  const height = Math.max(1, window.innerHeight - top)

  return {
    left,
    top,
    width,
    height
  }
}

function applyBounds() {
  const host = hostRef.value
  const canvas = canvasRef.value
  if (!host || !canvas || typeof window === 'undefined') return

  const bounds = paneBounds()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  host.style.left = `${bounds.left}px`
  host.style.top = `${bounds.top}px`
  host.style.width = `${bounds.width}px`
  host.style.height = `${bounds.height}px`

  canvas.style.width = `${bounds.width}px`
  canvas.style.height = `${bounds.height}px`

  const nextWidth = Math.floor(bounds.width * dpr)
  const nextHeight = Math.floor(bounds.height * dpr)

  if (canvas.width !== nextWidth) canvas.width = nextWidth
  if (canvas.height !== nextHeight) canvas.height = nextHeight
}

function destroyThpace() {
  if (thpaceInstance?.remove) {
    thpaceInstance.remove()
  }

  thpaceInstance = null
}

function buildThpace() {
  const canvas = canvasRef.value
  if (!canvas || typeof window === 'undefined') return

  destroyThpace()
  applyBounds()

  thpaceInstance = ThpaceGL.create(canvas, settings)
}

function scheduleRebuild() {
  if (typeof window === 'undefined') return

  if (rebuildFrame) {
    window.cancelAnimationFrame(rebuildFrame)
  }

  rebuildFrame = window.requestAnimationFrame(() => {
    rebuildFrame = 0
    buildThpace()
  })
}

function syncBoundsOnly() {
  applyBounds()
}

onMounted(async () => {
  await nextTick()
  buildThpace()

  window.addEventListener('resize', scheduleRebuild)
  window.addEventListener('orientationchange', scheduleRebuild)
  window.addEventListener('scroll', syncBoundsOnly, true)

  const pane = importerPaneElement()
  if (pane && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleRebuild)
    resizeObserver.observe(pane)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleRebuild)
    window.removeEventListener('orientationchange', scheduleRebuild)
    window.removeEventListener('scroll', syncBoundsOnly, true)

    if (rebuildFrame) {
      window.cancelAnimationFrame(rebuildFrame)
      rebuildFrame = 0
    }
  }

  resizeObserver?.disconnect()
  resizeObserver = null
  destroyThpace()
})
</script>

<template>
  <div
    ref="hostRef"
    data-importer-fixed-thpace
    aria-hidden="true"
  >
    <canvas ref="canvasRef" />
  </div>
</template>

<style scoped>
[data-importer-fixed-thpace] {
  position: fixed;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(circle at 22% 16%, rgba(56, 189, 248, 0.10), transparent 34%),
    radial-gradient(circle at 78% 24%, rgba(91, 33, 182, 0.16), transparent 36%),
    #05080d;
}

[data-importer-fixed-thpace] canvas {
  display: block;
  position: absolute;
  inset: 0;
}
</style>
