<script setup lang="ts">
const props = defineProps<{
  mapImageUrl: string
  pins: any[]
  selectedPinId: string | null
  buildMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-pin', pinId: string): void
  (e: 'map-click', coords: { x: number; y: number }): void
}>()

const mapEl = ref<HTMLElement | null>(null)

let L: any = null
let leafletMap: any = null
let imageOverlay: any = null
let markersLayer: any = null
let imageBounds: any = null
let imageWidth = 0
let imageHeight = 0

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getMarkerSymbol(icon: string | null | undefined) {
  const value = String(icon || 'marker')

  const symbols: Record<string, string> = {
    marker: '●',
    city: '▦',
    castle: '♜',
    tower: '▮',
    dungeon: '⛓',
    temple: '⛪',
    camp: '△',
    harbor: '⚓',
    ruins: '◫',
    quest: '★',
    skull: '☠',
    book: '☰',
  }

  return symbols[value] || '●'
}

function markerSizeForZoom(selected = false) {
  if (!leafletMap) return selected ? 22 : 18

  const zoom = Number(leafletMap.getZoom?.() ?? 0)

  // Clamped zoom curve:
  // - zoomed out: smaller
  // - medium zoom: readable
  // - zoomed in: slightly bigger, but capped
  const base = clamp(16 + zoom * 1.8, 12, 22)
  return selected ? clamp(base + 4, 16, 26) : base
}

function markerHtml(pin: any, selected = false) {
  const size = markerSizeForZoom(selected)
  const color = String(pin?.color || '#3b82f6')
  const symbol = getMarkerSymbol(pin?.icon)
  const halo = selected ? '0 0 0 3px rgba(255,255,255,0.25)' : '0 0 0 1px rgba(255,255,255,0.08)'
  const fontSize = Math.max(10, Math.round(size * 0.52))

  return `
    <div
      style="
        width:${size}px;
        height:${size}px;
        border-radius:999px;
        background:${color};
        color:white;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:${halo}, 0 6px 16px rgba(0,0,0,0.35);
        border:1px solid rgba(255,255,255,0.35);
        font-size:${fontSize}px;
        font-weight:700;
        line-height:1;
        transform: translateZ(0);
        user-select:none;
      "
      title="${String(pin?.resolvedTitle || pin?.title || 'Pin').replace(/"/g, '&quot;')}"
    >
      <span style="transform: translateY(-0.5px);">${symbol}</span>
    </div>
  `
}

function createMarker(pin: any) {
  if (!L) return null

  const selected = String(pin.id) === String(props.selectedPinId || '')
  const size = markerSizeForZoom(selected)

  const icon = L.divIcon({
    className: 'eldra-map-pin',
    html: markerHtml(pin, selected),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })

  const marker = L.marker([Number(pin.y || 0), Number(pin.x || 0)], {
    icon,
    keyboard: false,
    bubblingMouseEvents: false,
  })

  marker.on('click', () => {
    emit('select-pin', String(pin.id))
  })

  return marker
}

function renderMarkers() {
  if (!L || !leafletMap || !markersLayer) return

  markersLayer.clearLayers()

  for (const pin of props.pins || []) {
    const marker = createMarker(pin)
    if (marker) markersLayer.addLayer(marker)
  }
}

function emitMapClick(event: any) {
  if (!props.buildMode) return

  const latlng = event?.latlng
  if (!latlng) return

  emit('map-click', {
    x: Number(latlng.lng),
    y: Number(latlng.lat),
  })
}

async function loadImageSize(src: string) {
  return await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
    })
    img.onerror = reject
    img.src = src
  })
}

async function initMap() {
  if (!process.client || !mapEl.value || !props.mapImageUrl) return

  if (!L) {
    L = await import('leaflet')
  }

  const size = await loadImageSize(props.mapImageUrl)
  imageWidth = size.width
  imageHeight = size.height

  imageBounds = [
    [0, 0],
    [imageHeight, imageWidth],
  ]

  leafletMap = L.map(mapEl.value, {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 4,
    zoomSnap: 0.25,
    attributionControl: false,
    zoomControl: true,
    doubleClickZoom: true,
    boxZoom: false,
    preferCanvas: true,
  })

  imageOverlay = L.imageOverlay(props.mapImageUrl, imageBounds).addTo(leafletMap)
  markersLayer = L.layerGroup().addTo(leafletMap)

  leafletMap.fitBounds(imageBounds, {
    animate: false,
    padding: [24, 24],
  })

  leafletMap.on('click', emitMapClick)
  leafletMap.on('zoomend', renderMarkers)

  renderMarkers()

  nextTick(() => {
    leafletMap?.invalidateSize?.()
  })
}

function destroyMap() {
  if (leafletMap) {
    leafletMap.off('click', emitMapClick)
    leafletMap.off('zoomend', renderMarkers)
    leafletMap.remove()
  }

  leafletMap = null
  imageOverlay = null
  markersLayer = null
  imageBounds = null
  imageWidth = 0
  imageHeight = 0
}

watch(
  () => props.pins,
  () => {
    renderMarkers()
  },
  { deep: true }
)

watch(
  () => props.selectedPinId,
  () => {
    renderMarkers()
  }
)

onMounted(async () => {
  await initMap()
})

onBeforeUnmount(() => {
  destroyMap()
})
</script>

<template>
  <div ref="mapEl" class="h-full w-full" />
</template>

<style scoped>
:deep(.leaflet-container) {
  background: #06101b;
  font-family: inherit;
}

:deep(.leaflet-control-zoom a) {
  background: rgba(8, 16, 27, 0.92);
  color: white;
  border-color: rgba(255, 255, 255, 0.08);
}

:deep(.leaflet-control-zoom a:hover) {
  background: rgba(15, 23, 42, 0.98);
}
</style>
