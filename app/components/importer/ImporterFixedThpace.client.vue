<script setup lang="ts">
import { ThpaceGL } from 'thpace'

const hostRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let thpaceInstance: any = null
let resizeFrame = 0
let resizeObserver: ResizeObserver | null = null

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

const hostStyle = reactive<Record<string, string>>({
  position: 'fixed',
  left: '0px',
  top: '0px',
  width: '0px',
  height: '0px',
  zIndex: '0',
  pointerEvents: 'none',
  overflow: 'hidden'
})

const canvasStyle = reactive<Record<string, string>>({
  display: 'block',
  position: 'absolute',
  inset: '0',
  width: '100%',
  height: '100%'
})

function importerPaneElement() {
  if (typeof document === 'undefined') return null

  return document.querySelector('[data-world-importer-page]') as HTMLElement | null
}

function paneBounds() {
  if (typeof window === 'undefined') {
    return {
      left: 0,
      top: 0,
      width: 1,
      height: 1
    }
  }

  const pane = importerPaneElement()
  const rect = pane?.getBoundingClientRect()

  const left = Math.max(0, Math.floor(rect?.left ?? 0))
  const top = Math.max(0, Math.floor(rect?.top ?? 0))
  const width = Math.max(1, Math.ceil(window.innerWidth - left))
  const height = Math.max(1, Math.ceil(window.innerHeight - top))

  return {
    left,
    top,
    width,
    height
  }
}

function applyBounds() {
  const canvas = canvasRef.value
  if (!canvas || typeof window === 'undefined') return

  const bounds = paneBounds()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  hostStyle.left = `${bounds.left}px`
  hostStyle.top = `${bounds.top}px`
  hostStyle.width = `${bounds.width}px`
  hostStyle.height = `${bounds.height}px`

  const nextWidth = Math.max(1, Math.floor(bounds.width * dpr))
  const nextHeight = Math.max(1, Math.floor(bounds.height * dpr))

  if (canvas.width !== nextWidth) canvas.width = nextWidth
  if (canvas.height !== nextHeight) canvas.height = nextHeight
}

function destroyThpace() {
  try {
    thpaceInstance?.remove?.()
    thpaceInstance?.destroy?.()
  } catch {}

  thpaceInstance = null
}

function buildThpace() {
  const canvas = canvasRef.value
  if (!canvas || typeof window === 'undefined') return

  applyBounds()
  destroyThpace()

  thpaceInstance = ThpaceGL.create(canvas, settings)
}

function scheduleBuild() {
  if (typeof window === 'undefined') return

  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame)
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0
    buildThpace()
  })
}

function syncPositionOnly() {
  applyBounds()
}

onMounted(async () => {
  await nextTick()

  buildThpace()

  window.addEventListener('resize', scheduleBuild)
  window.addEventListener('orientationchange', scheduleBuild)
  window.addEventListener('scroll', syncPositionOnly, true)

  const pane = importerPaneElement()
  if (pane && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleBuild)
    resizeObserver.observe(pane)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleBuild)
    window.removeEventListener('orientationchange', scheduleBuild)
    window.removeEventListener('scroll', syncPositionOnly, true)

    if (resizeFrame) {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = 0
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
    :style="hostStyle"
    aria-hidden="true"
  >
    <canvas
      ref="canvasRef"
      :style="canvasStyle"
    />
  </div>
</template>
