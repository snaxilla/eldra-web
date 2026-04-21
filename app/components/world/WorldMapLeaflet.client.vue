<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'

type Pin = {
  id: string
  title: string
  x: number
  y: number
  color?: string | null
  pinType?: string | null
}

const props = defineProps<{
  mapImageUrl: string
  pins: Pin[]
  selectedPinId?: string | null
  buildMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-pin', id: string): void
  (e: 'map-click', coords: { x: number; y: number }): void
}>()

const rootEl = ref<HTMLDivElement | null>(null)

let L: any = null
let map: any = null
let imageOverlay: any = null
let markerLayer: any = null

function makePinHtml(pin: Pin, selected: boolean) {
  const bg = pin.color || '#3b82f6'
  const ring = selected ? '#ffffff' : 'rgba(255,255,255,0.45)'
  const scale = selected ? 'scale(1.2)' : 'scale(1)'

  return `
    <div style="
      width: 28px;
      height: 28px;
      border-radius: 9999px 9999px 9999px 4px;
      transform: rotate(45deg) ${scale};
      background: ${bg};
      border: 3px solid ${ring};
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 24px rgba(0,0,0,0.35);
      transition: transform 0.15s ease;
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
  if (!rootEl.value || map) return

  L = await import('leaflet')

  map = L.map(rootEl.value, {
    crs: L.CRS.Simple,
    zoomControl: true,
    attributionControl: false,
    minZoom: -5,
    maxZoom: 5,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 120,
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
  })

  map.on('click', (e: any) => {
    if (!props.buildMode) return
    const { lat, lng } = e.latlng
    emit('map-click', { x: lng, y: lat })
  })

  markerLayer = L.layerGroup().addTo(map)
}

function clearMap() {
  if (markerLayer) markerLayer.clearLayers()
  if (imageOverlay && map) {
    map.removeLayer(imageOverlay)
    imageOverlay = null
  }
}

function renderPins() {
  if (!L || !map || !markerLayer) return
  markerLayer.clearLayers()

  for (const pin of props.pins || []) {
    const marker = L.marker(L.latLng(pin.y, pin.x), {
      icon: L.divIcon({
        className: 'eldra-leaflet-pin',
        html: makePinHtml(pin, pin.id === props.selectedPinId),
        iconSize: [28, 28],
        iconAnchor: [14, 24],
      }),
    })

    marker.on('click', (e: any) => {
      e.originalEvent?.stopPropagation()
      emit('select-pin', pin.id)
    })

    if (pin.title) {
      marker.bindTooltip(pin.title, {
        permanent: false,
        direction: 'top',
        offset: [0, -28],
        className: 'eldra-pin-tooltip',
      })
    }

    marker.addTo(markerLayer)
  }
}

function getCoverZoom(bounds: any) {
  if (!map) return 0
  const size = map.getSize()
  const nw = map.project(bounds.getNorthWest(), 0)
  const se = map.project(bounds.getSouthEast(), 0)
  const imageWidth = Math.abs(se.x - nw.x)
  const imageHeight = Math.abs(se.y - nw.y)
  if (!imageWidth || !imageHeight || !size.x || !size.y) return 0
  const coverScale = Math.max(size.x / imageWidth, size.y / imageHeight)
  const zoom = Math.log2(coverScale)
  return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom))
}

async function renderMap() {
  if (!props.mapImageUrl) return
  await ensureMap()
  if (!L || !map) return

  clearMap()

  const { width, height } = await loadImageDimensions(props.mapImageUrl)
  const bounds = L.latLngBounds([0, 0], [height, width])
  imageOverlay = L.imageOverlay(props.mapImageUrl, bounds).addTo(map)

  const center = bounds.getCenter()
  const coverZoom = getCoverZoom(bounds)
  map.setView(center, coverZoom, { animate: false })
  map.setMaxBounds(bounds)
  map.options.maxBoundsViscosity = 1.0

  renderPins()

  requestAnimationFrame(() => {
    if (!map) return
    map.invalidateSize()
    map.setView(center, coverZoom, { animate: false })
  })
}

watch(() => props.mapImageUrl, async () => {
  await nextTick()
  await renderMap()
}, { immediate: true })

watch(() => props.pins, () => renderPins(), { deep: true })
watch(() => props.selectedPinId, () => renderPins())
watch(() => props.buildMode, () => {
  if (!map) return
  map.getContainer().style.cursor = props.buildMode ? 'crosshair' : ''
})

onMounted(async () => { await renderMap() })

onBeforeUnmount(() => {
  if (map) { map.remove(); map = null }
})
</script>

<template>
  <div class="absolute inset-0 overflow-hidden bg-[#09111a]">
    <div ref="rootEl" class="h-full w-full" />
  </div>
</template>

<style scoped>
:deep(.leaflet-container) {
  width: 100%;
  height: 100%;
  background: #09111a;
  font-family: inherit;
}

:deep(.leaflet-control-zoom) {
  margin-top: 72px !important;
  margin-left: 16px !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 18px !important;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

:deep(.leaflet-control-zoom a) {
  background: rgba(8, 16, 27, 0.9) !important;
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

:deep(.eldra-pin-tooltip) {
  background: rgba(8, 16, 27, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #e2e8f0;
  font-size: 12px;
  padding: 4px 10px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

:deep(.eldra-pin-tooltip::before) {
  border-top-color: rgba(255, 255, 255, 0.12) !important;
}
</style>
