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
      '#0b1020',
      '#172554',
      '#4f46e5',
      '#06b6d4',
      '#7c3aed'
    ],
    triangleSize: 140,
    bleed: 100,
    noise: 60,
    pointVariationX: 18,
    pointVariationY: 28,
    pointAnimationSpeed: 9000,
    animationOffset: 240,
    maxFps: 60,
    automaticResize: true,
    particleSettings: {
      count: [2, 4],
      interval: [5000, 9000],
      radius: [1, 2],
      opacity: [0.08, 0.30],
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
  <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[40px]">
    <canvas ref="canvasRef" class="absolute inset-0 h-full w-full" />
    <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,17,0.28)_0%,rgba(2,6,17,0.18)_40%,rgba(2,6,17,0.42)_100%)]" />
  </div>
</template>
