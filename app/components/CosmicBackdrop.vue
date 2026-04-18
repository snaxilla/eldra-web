<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let stars: any[] = []
let animationFrame: number

function init(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'

  ctx = canvas.getContext('2d')
  ctx?.scale(dpr, dpr)

  stars = Array.from({ length: 120 }).map(() => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    size: Math.random() * 1.8 + 0.3,
    speed: Math.random() * 0.15 + 0.02,
    alpha: Math.random() * 0.6 + 0.2
  }))
}

function draw() {
  if (!ctx) return

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

  for (const star of stars) {
    star.y -= star.speed
    if (star.y < 0) star.y = window.innerHeight

    ctx.beginPath()
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${star.alpha})`
    ctx.fill()
  }

  animationFrame = requestAnimationFrame(draw)
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return

  init(canvas)
  draw()

  window.addEventListener('resize', () => init(canvas))
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-0">
    <canvas ref="canvasRef" class="absolute inset-0" />
  </div>
</template>
