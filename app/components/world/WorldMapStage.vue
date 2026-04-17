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

const stageRef = ref<HTMLElement | null>(null)

const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

const dragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragOriginX = 0
let dragOriginY = 0

const transformStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
  transformOrigin: 'center center'
}))

function clampScale(next: number) {
  return Math.min(2.5, Math.max(0.75, next))
}

function zoomAt(delta: number) {
  scale.value = clampScale(scale.value + delta)
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  zoomAt(event.deltaY > 0 ? -0.1 : 0.1)
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
}

function onPointerUp() {
  dragging.value = false
}

function resetView() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-[#09111a]">
    <div class="absolute left-4 top-4 z-20 flex items-center gap-3">
      <button
        type="button"
        class="rounded-full border border-white/12 bg-[rgba(8,16,27,0.86)] px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-[rgba(8,16,27,0.95)]"
        @click="resetView"
      >
        Reset View
      </button>

      <div class="rounded-full border border-white/12 bg-[rgba(8,16,27,0.86)] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-300 backdrop-blur">
        Zoom {{ Math.round(scale * 100) }}%
      </div>
    </div>

    <div class="absolute bottom-4 left-4 z-20 flex overflow-hidden rounded-2xl border border-white/12 bg-[rgba(8,16,27,0.86)] backdrop-blur">
      <button
        type="button"
        class="px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
        @click="zoomAt(0.1)"
      >
        +
      </button>
      <button
        type="button"
        class="border-l border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
        @click="zoomAt(-0.1)"
      >
        −
      </button>
    </div>

    <div
      ref="stageRef"
      class="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
    >
      <div
        class="absolute inset-0 transition-transform duration-75"
        :style="transformStyle"
      >
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
  </div>
</template>
