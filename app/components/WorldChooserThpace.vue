<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { ThpaceGL } from 'thpace'

const canvasRef = ref<HTMLCanvasElement | null>(null)

let thpaceInstance: any = null

function mountThpace() {
  const canvas = canvasRef.value
  if (!canvas) return

  const settings = {
    colors: [
      '#08101f',
      '#172554',
      '#4338ca',
      '#0891b2',
      '#6d28d9'
    ],
    triangleSize: 160,
    bleed: 120,
    noise: 58,
    pointVariationX: 18,
    pointVariationY: 26,
    pointAnimationSpeed: 9000,
    animationOffset: 240,
    maxFps: 60,
    automaticResize: true,
    particleSettings: {
      count: [2, 4],
      interval: [5000, 9000],
      radius: [1, 2],
      opacity: [0.08, 0.24],
      variationX: [4, 12],
      variationY: [2, 6],
      color: '#dbeafe'
    }
  }

  thpaceInstance = ThpaceGL.create(canvas, settings)
}

onMounted(() => {
  mountThpace()
})

onBeforeUnmount(() => {
  if (thpaceInstance?.remove) {
    thpaceInstance.remove()
  }
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
    <canvas ref="canvasRef" class="absolute inset-0 h-full w-full" />
    <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,17,0.18)_0%,rgba(2,6,17,0.10)_42%,rgba(2,6,17,0.34)_100%)]" />
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_35%)]" />
  </div>
</template>
