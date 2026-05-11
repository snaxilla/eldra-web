<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type MapPin = {
  id: string
  title: string
  x: number
  y: number
  color?: string
  icon?: string
}

const props = defineProps<{
  mapImageUrl: string
  pins: MapPin[]
  selectedPinId?: string | null
}>()

const emit = defineEmits<{
  (e: 'select-pin', pinId: string): void
}>()

const containerRef = ref<HTMLElement | null>(null)

const MAP_WIDTH = 1800
const MAP_HEIGHT = 1200

const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const baseScale = ref(1)

const containerWidth = ref(0)
const containerHeight = ref(0)

const dragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragOriginX = 0
let dragOriginY = 0

let resizeObserver: ResizeObserver | null = null

const totalScale = computed(() => baseScale.value * zoom.value)

const mapStyle = computed(() => ({
  width: `${MAP_WIDTH}px`,
  height: `${MAP_HEIGHT}px`,
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${totalScale.value})`,
  transformOrigin: 'center center'
}))

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function updateBaseScale() {
  if (!containerRef.value) return

  containerWidth.value = containerRef.value.clientWidth
  containerHeight.value = containerRef.value.clientHeight

  baseScale.value = Math.max(
    containerWidth.value / MAP_WIDTH,
    containerHeight.value / MAP_HEIGHT
  )

  clampOffsets()
}

function clampOffsets() {
  const scaledWidth = MAP_WIDTH * totalScale.value
  const scaledHeight = MAP_HEIGHT * totalScale.value

  const maxX = Math.max(0, (scaledWidth - containerWidth.value) / 2)
  const maxY = Math.max(0, (scaledHeight - containerHeight.value) / 2)

  offsetX.value = clamp(offsetX.value, -maxX, maxX)
  offsetY.value = clamp(offsetY.value, -maxY, maxY)
}

function setZoom(nextZoom: number) {
  zoom.value = clamp(nextZoom, 1, 3)
  clampOffsets()
}

function zoomIn() {
  setZoom(zoom.value + 0.1)
}

function zoomOut() {
  setZoom(zoom.value - 0.1)
}

function resetView() {
  zoom.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  if (event.deltaY > 0) zoomOut()
  else zoomIn()
}

function onPointerDown(event: PointerEvent) {
  dragging.value = true
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragOriginX = offsetX.value
  dragOriginY = offsetY.value
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return

  offsetX.value = dragOriginX + (event.clientX - dragStartX)
  offsetY.value = dragOriginY + (event.clientY - dragStartY)
  clampOffsets()
}

function onPointerUp() {
  dragging.value = false
}

onMounted(() => {
  updateBaseScale()

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => updateBaseScale())
    resizeObserver.observe(containerRef.value)
  }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-[#09111a]">
    <div
      ref="containerRef"
      class="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
    >
      <div class="absolute left-1/2 top-1/2 transition-transform duration-75" :style="mapStyle">
        <img
          :src="mapImageUrl"
          alt="World map"
          class="h-full w-full select-none object-cover"
          draggable="false"
        >

        <button
          v-for="pin in pins"
          :key="pin.id"
          type="button"
          class="absolute z-10 -translate-x-1/2 -translate-y-1/2 transition duration-150 hover:scale-110"
          :style="{ left: `${pin.x}%`, top: `${pin.y}%` }"
          @click.stop="emit('select-pin', pin.id)"
        >
          <div
            class="relative flex h-8 w-8 items-center justify-center rotate-45 rounded-[8px] border-2 shadow-[0_0_0_4px_rgba(0,0,0,0.25)]"
            :class="pin.id === selectedPinId ? 'scale-110 border-white' : 'border-white/70'"
            :style="{ backgroundColor: pin.color || '#ef4444' }"
          >
            <UIcon
              :name="pin.icon || 'i-lucide-map-pin'"
              class="h-4 w-4 -rotate-45 text-white"
            />
          </div>
        </button>
      </div>
    </div>

    <div class="absolute bottom-4 left-4 z-20 flex items-center gap-3">
      <button
        type="button"
        class="eldra-button rounded-none px-4 py-2 text-sm font-medium backdrop-blur"
        @click="resetView"
      >
        Reset View
      </button>

      <div class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(20,17,12,0.82)] px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-[#d8ceb8] backdrop-blur">
        Zoom {{ zoomLabel }}
      </div>

      <div class="flex overflow-hidden rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(20,17,12,0.82)] backdrop-blur">
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold text-[#fff7df] transition hover:bg-[rgba(201,164,90,0.12)]"
          @click="zoomIn"
        >
          +
        </button>
        <button
          type="button"
          class="border-l border-[rgba(201,164,90,0.24)] px-4 py-2 text-sm font-semibold text-[#fff7df] transition hover:bg-[rgba(201,164,90,0.12)]"
          @click="zoomOut"
        >
          −
        </button>
      </div>
    </div>
  </div>
</template>
