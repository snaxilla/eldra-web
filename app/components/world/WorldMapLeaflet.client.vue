<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'

type Pin = {
  id: string
  title: string
  x: number
  y: number
  color?: string | null
  pinType?: string | null
  icon?: string | null
}

type SceneLayer = {
  id: string
  type?: string | null
  visible?: boolean
  data?: any
}

type SceneModel = {
  id: string
  title?: string
  layers: SceneLayer[]
}

const props = defineProps<{
  mapImageUrl: string
  tileEnabled?: boolean
  tilePath?: string | null
  tileMinZoom?: number | null
  tileMaxZoom?: number | null
  tileOriginalWidth?: number | null
  tileOriginalHeight?: number | null
  overlayImageUrl?: string | null
  overlayOpacity?: number | null
  scene?: SceneModel | null
  layers?: SceneLayer[] | null
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
let tileLayer: any = null
let markerLayer: any = null
let overlayLayer: any = null
let currentBounds: any = null

const inputLayers = computed(() => {
  if (Array.isArray(props.scene?.layers)) return props.scene?.layers || []
  if (Array.isArray(props.layers)) return props.layers
  return []
})

const resolvedPins = computed<Pin[]>(() => {
  const pinsLayer = inputLayers.value.find((layer) => {
    const id = String(layer?.id || '').trim().toLowerCase()
    const type = String(layer?.type || '').trim().toLowerCase()
    return id === 'pins' || type === 'pins'
  })

  if (!pinsLayer) {
    return props.pins || []
  }

  if (pinsLayer.visible === false) {
    return []
  }

  const candidate = pinsLayer?.data?.pins ?? pinsLayer?.data
  if (!Array.isArray(candidate)) {
    return props.pins || []
  }

  return candidate as Pin[]
})

function getIconSvg(icon?: string | null) {
  switch (icon) {
    case 'city':
      return `
        <rect x="10" y="12" width="4" height="10" rx="1.2" fill="white" />
        <rect x="15" y="9" width="4" height="13" rx="1.2" fill="white" />
        <rect x="20" y="14" width="4" height="8" rx="1.2" fill="white" />
      `
    case 'castle':
      return `
        <path d="M10 22V11h3v2h3v-2h2v2h3v-2h3v11H10Z" fill="white"/>
        <rect x="15.2" y="17" width="3.6" height="5" rx="1" fill="${'__PIN_BG__'}"/>
      `
    case 'tower':
      return `
        <path d="M14 22V12h6v10H14Z" fill="white"/>
        <path d="M13 12l4-3 4 3H13Z" fill="white"/>
        <rect x="16" y="15" width="2" height="7" rx="1" fill="${'__PIN_BG__'}"/>
      `
    case 'dungeon':
      return `
        <path d="M11 12h12v10H11z" fill="white"/>
        <path d="M13 12V9h2v3M17 12V9h2v3M21 12V9h2v3" stroke="white" stroke-width="1.4" fill="none"/>
        <rect x="16" y="16" width="2" height="6" rx="1" fill="${'__PIN_BG__'}"/>
      `
    case 'temple':
      return `
        <path d="M9 13l8-4 8 4H9Z" fill="white"/>
        <rect x="10.5" y="14" width="2.2" height="7" fill="white"/>
        <rect x="15.9" y="14" width="2.2" height="7" fill="white"/>
        <rect x="21.3" y="14" width="2.2" height="7" fill="white"/>
        <rect x="9" y="21" width="16" height="2" fill="white"/>
      `
    case 'camp':
      return `
        <path d="M10 22l7-11 7 11H10Z" fill="white"/>
        <path d="M17 11v11" stroke="${'__PIN_BG__'}" stroke-width="1.8"/>
      `
    case 'harbor':
      return `
        <path d="M17 9v10" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <path d="M17 11c3 0 5 2 5 5" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M17 11c-3 0-5 2-5 5" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M11 21c1.4 1.2 2.8 1.2 4.2 0 1.4-1.2 2.8-1.2 4.2 0 1.4 1.2 2.8 1.2 4.2 0" stroke="white" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      `
    case 'ruins':
      return `
        <path d="M10 22l2-8h3l2 5 2-9h3l2 12H10Z" fill="white"/>
      `
    case 'quest':
      return `
        <path d="M17 9l2.1 4.4 4.9.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.9-.7L17 9Z" fill="white"/>
      `
    case 'skull':
      return `
        <path d="M17 9c-4.2 0-7 2.8-7 6.5 0 2.2 1 3.6 2.4 4.7V22h9.2v-1.8c1.4-1.1 2.4-2.5 2.4-4.7C24 11.8 21.2 9 17 9Z" fill="white"/>
        <circle cx="14.4" cy="15.5" r="1.3" fill="${'__PIN_BG__'}"/>
        <circle cx="19.6" cy="15.5" r="1.3" fill="${'__PIN_BG__'}"/>
        <rect x="15.4" y="18.3" width="3.2" height="2.2" rx="0.5" fill="${'__PIN_BG__'}"/>
      `
    case 'book':
      return `
        <path d="M10 10.5c0-1.1.9-2 2-2h5c1 0 1.9.3 2.8.9.9-.6 1.8-.9 2.8-.9h1.4c1.1 0 2 .9 2 2V22h-3.2c-1.2 0-2.3.3-3.4.9-.8-.6-1.8-.9-2.9-.9H10V10.5Z" fill="white"/>
        <path d="M17 9v12.2" stroke="${'__PIN_BG__'}" stroke-width="1.4"/>
      `
    case 'marker':
    default:
      return `<circle cx="17" cy="17" r="5.5" fill="white" />`
  }
}

function makePinHtml(pin: Pin, selected: boolean) {
  const bg = pin.color || '#3b82f6'
  const stroke = selected ? '#ffffff' : 'rgba(255,255,255,0.55)'
  const inner = getIconSvg(pin.icon).replaceAll('__PIN_BG__', bg)

  return `
    <div style="
      width: 20px;
      height: 28px;
      filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
      transform: ${selected ? 'scale(1.08)' : 'scale(1)'};
      transition: transform 140ms ease;
    ">
      <svg width="20" height="28" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M17 1.5C8.44 1.5 1.5 8.44 1.5 17c0 11.17 12.63 22.62 14.1 23.92a2.1 2.1 0 0 0 2.8 0C19.87 39.62 32.5 28.17 32.5 17 32.5 8.44 25.56 1.5 17 1.5Z"
          fill="${bg}"
          stroke="${stroke}"
          stroke-width="3"
        />
        ${inner}
      </svg>
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

function usingTiles() {
  return Boolean(
    props.tileEnabled &&
    props.tilePath &&
    props.tileOriginalWidth &&
    props.tileOriginalHeight
  )
}

function tileMaxZoomValue() {
  const value = Number(props.tileMaxZoom)
  return Number.isFinite(value) ? value : 7
}

function mapCoordinateScale() {
  return usingTiles() ? Math.pow(2, tileMaxZoomValue()) : 1
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
    const scale = mapCoordinateScale()
    emit('map-click', {
      x: usingTiles() ? lng * scale : lng,
      y: usingTiles() ? -lat * scale : lat
    })
  })

  markerLayer = L.layerGroup().addTo(map)
}

function clearMap() {
  if (markerLayer) markerLayer.clearLayers()

  if (imageOverlay && map) {
    map.removeLayer(imageOverlay)
    imageOverlay = null
  }

  if (overlayLayer && map) {
    map.removeLayer(overlayLayer)
    overlayLayer = null
  }

  if (tileLayer && map) {
    map.removeLayer(tileLayer)
    tileLayer = null
  }
}

function renderPins() {
  if (!L || !map || !markerLayer) return

  markerLayer.clearLayers()

  for (const pin of resolvedPins.value || []) {
    const scale = mapCoordinateScale()
    const lat = usingTiles() ? -(pin.y / scale) : pin.y
    const lng = usingTiles() ? pin.x / scale : pin.x

    const marker = L.marker(L.latLng(lat, lng), {
      icon: L.divIcon({
        className: 'eldra-leaflet-pin',
        html: makePinHtml(pin, pin.id === props.selectedPinId),
        iconSize: [20, 28],
        iconAnchor: [10, 27],
        tooltipAnchor: [0, -24],
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
        offset: [0, -24],
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
  if (!props.mapImageUrl && !usingTiles()) return

  await ensureMap()
  if (!L || !map) return

  clearMap()

  const useTiles = usingTiles()
  const maxZoom = tileMaxZoomValue()
  const scale = mapCoordinateScale()


  const dimensions = useTiles
    ? {
        width: Number(props.tileOriginalWidth),
        height: Number(props.tileOriginalHeight)
      }
    : await loadImageDimensions(props.mapImageUrl)

  const mapWidth = useTiles ? dimensions.width / scale : dimensions.width
  const mapHeight = useTiles ? dimensions.height / scale : dimensions.height

  currentBounds = useTiles
    ? L.latLngBounds([-mapHeight, 0], [0, mapWidth])
    : L.latLngBounds([0, 0], [mapHeight, mapWidth])

  if (useTiles) {
    const minZoom = Number.isFinite(Number(props.tileMinZoom)) ? Number(props.tileMinZoom) : 0

    map.setMinZoom(minZoom)
    map.setMaxZoom(maxZoom)
    map.options.zoomSnap = 0.25

    tileLayer = L.tileLayer(String(props.tilePath), {
      tileSize: 256,
      minZoom,
      maxZoom,
      maxNativeZoom: maxZoom,
      minNativeZoom: minZoom,
      bounds: currentBounds,
      noWrap: true,
      tms: false,
      attribution: ''
    }).addTo(map)
  } else {
    map.setMinZoom(-5)
    map.setMaxZoom(5)
    map.options.zoomSnap = 0.25

    imageOverlay = L.imageOverlay(props.mapImageUrl, currentBounds).addTo(map)
  }

  if (props.overlayImageUrl) {
    overlayLayer = L.imageOverlay(props.overlayImageUrl, currentBounds, {
      opacity: Number.isFinite(Number(props.overlayOpacity)) ? Number(props.overlayOpacity) : 0.65,
      interactive: false
    }).addTo(map)
  }

  const center = currentBounds.getCenter()
  const startZoom = getCoverZoom(currentBounds)

  map.setMaxBounds(currentBounds)
  map.options.maxBoundsViscosity = 1.0
  map.setView(center, startZoom, { animate: false })

  renderPins()

  requestAnimationFrame(() => {
    if (!map) return
    map.invalidateSize()
    map.setMaxBounds(currentBounds)
    map.setView(center, startZoom, { animate: false })
  })
}

watch(
  () => [
    props.mapImageUrl,
    props.tileEnabled,
    props.tilePath,
    props.tileMinZoom,
    props.tileMaxZoom,
    props.tileOriginalWidth,
    props.tileOriginalHeight,
    props.overlayImageUrl,
    props.overlayOpacity
  ],
  async () => {
    await nextTick()
    await renderMap()
  }
)

watch(
  () => resolvedPins.value,
  () => {
    renderPins()
  },
  { deep: true }
)

watch(
  () => inputLayers.value,
  () => {
    // Phase 2 plumbing: accept scene/layers input, but keep legacy pin rendering path.
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

watch(
  () => props.buildMode,
  () => {
    if (!map) return
    map.getContainer().style.cursor = props.buildMode ? 'crosshair' : ''
  }
)



onMounted(async () => {
  await nextTick()
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

:deep(.leaflet-pane),
:deep(.leaflet-top),
:deep(.leaflet-bottom) {
  z-index: 1 !important;
}

:deep(.leaflet-control-container) {
  z-index: 10 !important;
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
