<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'

type Pin = {
  id: string
  title: string
  x: number
  y: number
  color?: string
}

const props = defineProps<{
  mapImageUrl: string
  pins: Pin[]
  selectedPinId?: string | null
}>()

const emit = defineEmits<{
  (e: 'select-pin', id: string): void
}>()

const rootEl = ref<HTMLDivElement | null>(null)

let L: any = null
let map: any = null
let imageOverlay: any = null
let markerLayer: any = null
let currentBounds: any = null

function makePinHtml(pin: Pin, selected: boolean) {
  const bg = pin.color || '#0f172a'
  const ring = selected ? '#ffffff' : 'rgba(255,255,255,0.55)'
  const shadow = selected
    ? '0 0 0 10px rgba(239,68,68,0.18)'
    : '0 10px 24px rgba(0,0,0,0.28)'

  return `
    <div style="
      width: 28px;
      height: 28px;
      border-radius: 9999px 9999px 9999px 4px;
      transform: rotate(45deg);
      background: ${bg};
      border: 3px solid ${ring};
      box-shadow: ${shadow};
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: white;
        transform: rotate(-45deg);
      "></div>
    </div>
  `
}

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = src
  })
}

async function ensureMap() {
  if (!rootEl.value) return
  if (map) return

  L = await import('leaflet')

  map = L.map(rootEl.value, {
    crs: L.CRS.Simple,
    zoomControl: true,
    attributionControl: false,
    minZoom: -3,
    maxZoom: 3,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 120,
    doubleClickZoom: true
  })

  markerLayer = L.layerGroup().addTo(map)
}

function clearMap() {
  if (markerLayer) {
    markerLayer.clearLayers()
  }
  if (imageOverlay && map) {
    map.removeLayer(imageOverlay)
    imageOverlay = null
  }
}

function renderPins() {
  if (!L || !map || !markerLayer || !currentBounds) return

  markerLayer.clearLayers()

  for (const pin of props.pins || []) {
    const latLng = L.latLng(pin.y, pin.x)

    const marker = L.marker(latLng, {
      icon: L.divIcon({
        className: 'eldra-leaflet-pin',
        html: makePinHtml(pin, pin.id === props.selectedPinId),
        iconSize: [28, 28],
        iconAnchor: [14, 24]
      })
    })

    marker.on('click', () => emit('select-pin', pin.id))
    marker.addTo(markerLayer)
  }
}

async function renderMap() {
  if (!props.mapImageUrl) return
  await ensureMap()
  if (!L || !map) return

  clearMap()

  const { width, height } = await loadImageDimensions(props.mapImageUrl)
  currentBounds = L.latLngBounds([0, 0], [height, width])

  imageOverlay = L.imageOverlay(props.mapImageUrl, currentBounds).addTo(map)

  map.fitBounds(currentBounds, {
    padding: [24, 24],
    animate: false
  })

  map.setMaxBounds(currentBounds.pad(0.02))

  renderPins()
}

watch(
  () => props.mapImageUrl,
  async () => {
    await nextTick()
    await renderMap()
  },
  { immediate: true }
)

watch(
  () => props.pins,
  () => {
    renderPins()
  },
  { deep: true }
)

watch(
  () => props.selectedPinId,
  () => {
    renderPins()
  }
)

onMounted(async () => {
  await renderMap()
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div ref="rootEl" class="h-full w-full bg-[#09111a]" />
</template>

<style scoped>
:deep(.leaflet-container) {
  width: 100%;
  height: 100%;
  background: #09111a;
  font-family: inherit;
}

:deep(.leaflet-control-zoom) {
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 18px !important;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

:deep(.leaflet-control-zoom a) {
  background: rgba(10, 18, 32, 0.88) !important;
  color: #e2e8f0 !important;
  border: 0 !important;
}

:deep(.leaflet-control-zoom a:hover) {
  background: rgba(20, 30, 48, 0.98) !important;
}

:deep(.eldra-leaflet-pin) {
  background: transparent !important;
  border: 0 !important;
}
</style>
