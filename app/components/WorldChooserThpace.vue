<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { ThpaceGL } from 'thpace'

const thpaceBackdropProps = withDefaults(defineProps<{
  fixed?: boolean
}>(), {
  fixed: true
})


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
  <div :class="['pointer-events-none z-0 overflow-hidden', thpaceBackdropProps.fixed ? 'fixed inset-0' : 'absolute inset-0']">
    <canvas ref="canvasRef" class="absolute inset-0 h-full w-full" />
    <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,17,0.18)_0%,rgba(2,6,17,0.10)_42%,rgba(2,6,17,0.34)_100%)]" />
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_35%)]" />
  </div>
</template>
