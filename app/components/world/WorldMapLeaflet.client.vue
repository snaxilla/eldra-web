<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import type { LayerObject, SceneLayer, SceneModel } from '~/lib/eldra/scene'

type Pin = {
  id: string
  title: string
  x: number
  y: number
  color?: string | null
  pinType?: string | null
  icon?: string | null
}

// Canonical renderer-wide zoom scaling. A renderer concern only -- never
// touches persisted/authoring size, never touches the Scene Graph. Given
// an authoring-time size (marker scale, ...) and the current Leaflet
// zoom, returns the on-screen size to actually draw at, so a point
// object scales smoothly instead of staying a fixed pixel size
// regardless of zoom. Used by Pins (PIN_ZOOM_TUNING below). Roads use a
// different, dedicated policy (see roadVisualProminence further down) --
// scaledSize()'s floor-based model preserves a minimum of visual
// presence at every zoom level by design, which is correct for a
// point/navigation object but wrong for a supporting-information line
// object that should be allowed to fade almost away. A future line-based
// object type should evaluate which of the two policies actually
// matches its intent rather than assuming scaledSize() is always right.
const ZOOM_SCALE_REFERENCE = 0

function zoomScaleFactor(zoom: number, damping: number) {
  return Math.pow(2, (zoom - ZOOM_SCALE_REFERENCE) * damping)
}

function scaledSize(authoringSize: number, zoom: number, damping: number, min: number, max: number) {
  const scaled = authoringSize * zoomScaleFactor(zoom, damping)
  return Math.max(min, Math.min(max, scaled))
}

// Matches the hardcoded road appearance that existed before per-road
// styling -- a Road with no (or partial) style values must render
// identically to before, with no migration required.
const ROAD_STYLE_DEFAULTS = {
  color: '#d4b072',
  width: 4,
  opacity: 0.9,
  dashPattern: 'solid' as 'solid' | 'dashed' | 'dotted',
}

// Road visual-prominence policy. This intentionally does NOT use
// scaledSize()/zoomScaleFactor() -- those preserve a floor of visual
// presence at every zoom level by design, which is exactly the wrong
// optimization for a supporting-information object type. Roads are not
// "a thing that must stay visible"; they're "a thing that must not
// compete with terrain, coastlines, and Pins" once the view is wide
// enough to be about the world rather than a specific place.
//
// Policy, expressed directly in the three tiers the design calls for:
//   - Editing scale  (zoom fraction >= EDITING_FRACTION): authored
//     fidelity, no attenuation at all.
//   - Regional scale (between REGIONAL_FRACTION and EDITING_FRACTION):
//     eased down to a "supporting context" level.
//   - Continent scale (zoom fraction -> 0): eased further down to
//     near-invisible. Not literally zero -- a Road is still technically
//     present -- but visually subordinate to everything else on the map.
//
// Zoom fraction is computed against the CURRENT map's actual min/max
// zoom (not a fixed absolute zoom number), so this behaves consistently
// whether the underlying map is a small raster image or a large tiled
// one with a completely different zoom range.
const ROAD_EDITING_FRACTION = 0.6
const ROAD_REGIONAL_FRACTION = 0.28
const ROAD_REGIONAL_VISUAL_LEVEL = 0.4
const ROAD_CONTINENT_VISUAL_LEVEL = 0.04

function roadZoomFraction(zoom: number) {
  if (!map) return 1

  const minZoom = map.getMinZoom()
  const maxZoom = map.getMaxZoom()

  if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom) || maxZoom <= minZoom) return 1

  return Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)))
}

// Returns a 0..1 multiplier applied to BOTH authored width and authored
// opacity together -- one prominence value, not two independently-tuned
// channels, so a Road fades and thins as a single coordinated effect.
function roadVisualProminence(zoom: number) {
  const fraction = roadZoomFraction(zoom)

  if (fraction >= ROAD_EDITING_FRACTION) return 1

  if (fraction >= ROAD_REGIONAL_FRACTION) {
    const t = (fraction - ROAD_REGIONAL_FRACTION) / (ROAD_EDITING_FRACTION - ROAD_REGIONAL_FRACTION)
    return ROAD_REGIONAL_VISUAL_LEVEL + (1 - ROAD_REGIONAL_VISUAL_LEVEL) * Math.pow(t, 1.5)
  }

  const t = fraction / ROAD_REGIONAL_FRACTION
  return ROAD_CONTINENT_VISUAL_LEVEL + (ROAD_REGIONAL_VISUAL_LEVEL - ROAD_CONTINENT_VISUAL_LEVEL) * Math.pow(t, 2)
}

// Absolute rendering floors -- not a "stay visible" policy, just what
// keeps a browser from rasterizing a degenerate/glitchy line. Reached
// only once roadVisualProminence has already pushed the Road to near
// nothing at true continent scale.
const ROAD_DISPLAY_WEIGHT_FLOOR = 0.4
const ROAD_DISPLAY_OPACITY_FLOOR = 0.02

// Pins scale conservatively -- a tighter zoomed-in ceiling than Roads so
// they stay stable navigation markers rather than growing into visual
// billboards, but still need enough damping to actually shrink away from
// their base size at continent scale rather than dominating the map; the
// floor stays large enough to remain a comfortable click target.
const PIN_ZOOM_TUNING = {
  damping: 0.5,
  min: 0.35,
  max: 1.15,
}

function roadDashArray(pattern: unknown): string | undefined {
  if (pattern === 'dashed') return '8 6'
  if (pattern === 'dotted') return '2 6'
  return undefined
}

function resolveRoadStyle(style: any) {
  style = style || {}

  const color = typeof style.color === 'string' && style.color ? style.color : ROAD_STYLE_DEFAULTS.color
  const width = Number.isFinite(Number(style.width)) && Number(style.width) > 0 ? Number(style.width) : ROAD_STYLE_DEFAULTS.width
  const opacity = Number.isFinite(Number(style.opacity)) ? Math.max(0, Math.min(1, Number(style.opacity))) : ROAD_STYLE_DEFAULTS.opacity
  const dashArray = roadDashArray(style.dashPattern ?? ROAD_STYLE_DEFAULTS.dashPattern)

  return { color, width, opacity, dashArray }
}

function roadStyleFor(roadObject: LayerObject) {
  return resolveRoadStyle(roadObject?.style)
}

const props = defineProps<{
  mapImageUrl: string
  tileEnabled?: boolean
  tilePath?: string | null
  tileMinZoom?: number | null
  tileMaxZoom?: number | null
  tileOriginalWidth?: number | null
  tileOriginalHeight?: number | null
  scene?: SceneModel | null
  layers?: SceneLayer[] | null
  pins: Pin[]
  selectedPinId?: string | null
  selectedRoadId?: string | null
  // Live-preview override for the Road currently open in the editor.
  // Read-only from this component's perspective -- never written back,
  // never persisted from here. Only applies to the Road matching
  // selectedRoadId; every other Road always renders its own persisted
  // style, unaffected.
  editingRoadStyle?: { color?: string; width?: number; opacity?: number; dashPattern?: string } | null
  buildMode?: boolean
  roadMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-pin', id: string): void
  (e: 'select-road', id: string): void
  (e: 'map-click', coords: { x: number; y: number }): void
  (e: 'map-double-click', coords: { x: number; y: number }): void
}>()

const rootEl = ref<HTMLDivElement | null>(null)

let L: any = null
let map: any = null
let imageOverlay: any = null
let tileLayer: any = null
let markerLayer: any = null
let overlayLayer: any = null
let roadLayer: any = null
let roadRubberBandLine: any = null
let roadDraftLastVertex: any = null
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

  if (Array.isArray(pinsLayer.objects)) {
    return pinsLayer.objects
      .filter((object) => object?.visible !== false && String(object?.objectType || '').trim().toLowerCase() === 'pin')
      .map((object) => {
        const coordinates = object.geometry?.coordinates
        const x = typeof coordinates?.x === 'number' ? coordinates.x : Number(coordinates?.[0] ?? 0)
        const y = typeof coordinates?.y === 'number' ? coordinates.y : Number(coordinates?.[1] ?? 0)

        return {
          id: String(object.objectId),
          title: String(object.properties?.title || object.name || ''),
          x,
          y,
          color: object.style?.color ?? null,
          pinType: object.properties?.pinType ?? null,
          icon: object.style?.icon ?? null,
        }
      })
  }

  const candidate = pinsLayer?.data?.pins ?? pinsLayer?.data
  if (!Array.isArray(candidate)) {
    return props.pins || []
  }

  return candidate as Pin[]
})

const resolvedImageOverlays = computed(() => {
  const overlayLayer = inputLayers.value.find((layer) => {
    const id = String(layer?.id || '').trim().toLowerCase()
    const type = String(layer?.type || '').trim().toLowerCase()
    return id === 'image-overlays' || type === 'image-overlays'
  })

  if (!overlayLayer || overlayLayer.visible === false) return []

  if (Array.isArray(overlayLayer.objects)) {
    const objects = overlayLayer.objects.filter((object) => {
      return object?.visible !== false && String(object?.objectType || '').trim().toLowerCase() === 'image-overlay'
    })

    if (objects.length) return objects
  }

  return []
})

const resolvedRoads = computed(() => {
  const roadsLayer = inputLayers.value.find((layer) => {
    const id = String(layer?.id || '').trim().toLowerCase()
    const type = String(layer?.type || '').trim().toLowerCase()
    return id === 'roads' || type === 'roads'
  })

  if (!roadsLayer || roadsLayer.visible === false || !Array.isArray(roadsLayer.objects)) {
    return []
  }

  return roadsLayer.objects.filter((object) => {
    return object?.visible !== false && String(object?.objectType || '').trim().toLowerCase() === 'road'
  })
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

function makePinHtml(pin: Pin, selected: boolean, width: number, height: number) {
  const bg = pin.color || '#3b82f6'
  const stroke = selected ? '#ffffff' : 'rgba(255,255,255,0.55)'
  const inner = getIconSvg(pin.icon).replaceAll('__PIN_BG__', bg)

  return `
    <div style="
      width: ${width}px;
      height: ${height}px;
      filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
      transform: ${selected ? 'scale(1.08)' : 'scale(1)'};
      transition: transform 140ms ease;
    ">
      <svg width="${width}" height="${height}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
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
    // The World Editor's own Build Tool controls occupy the map's
    // top-left corner (see index.vue's build tool palette). Leaflet's
    // default zoom control position is also top-left, which overlapped
    // it -- move the zoom control to a corner the World Editor UI doesn't
    // use instead of fighting Leaflet's default.
    zoomControl: false,
    attributionControl: false,
    minZoom: -5,
    maxZoom: 5,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 120,
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
  })

  L.control.zoom({ position: 'bottomleft' }).addTo(map)

  map.on('click', (e: any) => {
    if (!props.buildMode) return
    const { lat, lng } = e.latlng
    const scale = mapCoordinateScale()
    emit('map-click', {
      x: usingTiles() ? lng * scale : lng,
      y: usingTiles() ? -lat * scale : lat
    })
  })

  map.on('dblclick', (e: any) => {
    if (!props.roadMode) return

    e.originalEvent?.preventDefault?.()
    const { lat, lng } = e.latlng
    const scale = mapCoordinateScale()

    emit('map-double-click', {
      x: usingTiles() ? lng * scale : lng,
      y: usingTiles() ? -lat * scale : lat
    })
  })

  map.on('mousemove', (e: any) => {
    updateRoadRubberBand(e.latlng)
  })

  // Re-derive on-screen size for zoom-scaled objects (roads, pins) when
  // zoom settles -- authoring size never changes, only display size.
  map.on('zoomend', () => {
    renderRoads()
    renderPins()
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

  if (roadLayer && map) {
    map.removeLayer(roadLayer)
    roadLayer = null
    roadRubberBandLine = null
    roadDraftLastVertex = null
  }

  if (tileLayer && map) {
    map.removeLayer(tileLayer)
    tileLayer = null
  }
}

function renderRoads() {
  if (!L || !map || !currentBounds) return

  if (!roadLayer) {
    roadLayer = L.layerGroup().addTo(map)
  } else {
    roadLayer.clearLayers()
  }

  // clearLayers() above already removed the rubber-band line from the map;
  // drop the stale reference so updateRoadRubberBand() recreates it.
  roadRubberBandLine = null
  roadDraftLastVertex = null

  const currentZoom = map.getZoom()

  for (const roadObject of resolvedRoads.value || []) {
    const coordinates = Array.isArray(roadObject?.geometry?.coordinates)
      ? roadObject.geometry.coordinates
      : []

    const latLngs = coordinates
      .map((coordinate: any) => {
        const x = Number(coordinate?.x)
        const y = Number(coordinate?.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null

        const scale = mapCoordinateScale()
        const lat = usingTiles() ? -(y / scale) : y
        const lng = usingTiles() ? x / scale : x
        return L.latLng(lat, lng)
      })
      .filter(Boolean)

    if (!latLngs.length) continue

    const isDraft = roadObject?.properties?.isDraft === true

    if (isDraft) {
      // Vertex markers for every placed point, including the first --
      // a user should never wonder whether a click was registered.
      for (const point of latLngs) {
        L.circleMarker(point, {
          radius: 4,
          color: '#f5e7bd',
          weight: 2,
          fillColor: '#1a1610',
          fillOpacity: 1,
          interactive: false,
        }).addTo(roadLayer)
      }

      roadDraftLastVertex = latLngs[latLngs.length - 1]
    }

    if (latLngs.length < 2) continue

    const isSelected = String(roadObject?.objectId || '') === String(props.selectedRoadId || '')

    // While this Road is open in the editor, render from the in-progress
    // draft style instead of the persisted one -- live preview. Nothing is
    // written back to roadObject/persistence here; this only changes what
    // gets drawn. Every other Road (isSelected false) is unaffected and
    // always renders its own persisted style.
    const roadStyle = isSelected && props.editingRoadStyle
      ? resolveRoadStyle(props.editingRoadStyle)
      : roadStyleFor(roadObject)

    // Authoring width/opacity are unchanged (still whatever's
    // persisted/being edited). Display values apply a single prominence
    // multiplier to both together -- at editing scale it's 1 (exactly
    // authored); it only ever reduces from there as the view widens.
    const prominence = roadVisualProminence(currentZoom)
    const displayWeight = Math.max(ROAD_DISPLAY_WEIGHT_FLOOR, roadStyle.width * prominence)
    const displayOpacity = Math.max(ROAD_DISPLAY_OPACITY_FLOOR, roadStyle.opacity * prominence)

    // Selection is indicated with a translucent halo drawn underneath the
    // real line, rather than by overriding color/weight/opacity/dashArray
    // on the line itself -- a selected road (which is every road while its
    // editor is open) must always render its own style, or style changes
    // are invisible until deselected.
    if (isSelected && !isDraft) {
      L.polyline(latLngs, {
        color: '#f5e7bd',
        weight: displayWeight + 4,
        opacity: 0.35,
        interactive: false,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(roadLayer)
    }

    const polyline = L.polyline(latLngs, {
      color: roadStyle.color,
      weight: isDraft ? 3 : displayWeight,
      opacity: isDraft ? 0.8 : displayOpacity,
      interactive: !isDraft,
      dashArray: isDraft ? '8 6' : roadStyle.dashArray,
      lineCap: 'round',
      lineJoin: 'round',
    })

    if (!isDraft) {
      polyline.on('click', (e: any) => {
        e.originalEvent?.stopPropagation?.()
        emit('select-road', String(roadObject?.objectId || ''))
      })
    }

    polyline.addTo(roadLayer)
  }
}

function updateRoadRubberBand(latlng: any) {
  if (!L || !map || !roadLayer) return

  if (!props.roadMode || !roadDraftLastVertex) {
    if (roadRubberBandLine) {
      roadLayer.removeLayer(roadRubberBandLine)
      roadRubberBandLine = null
    }
    return
  }

  if (roadRubberBandLine) {
    roadRubberBandLine.setLatLngs([roadDraftLastVertex, latlng])
  } else {
    roadRubberBandLine = L.polyline([roadDraftLastVertex, latlng], {
      color: '#d4b072',
      weight: 2,
      opacity: 0.6,
      dashArray: '4 6',
      interactive: false,
    }).addTo(roadLayer)
  }
}

function renderImageOverlays() {
  if (!L || !map || !currentBounds) return

  if (!overlayLayer) {
    overlayLayer = L.layerGroup().addTo(map)
  } else {
    overlayLayer.clearLayers()
  }

  for (const overlayObject of resolvedImageOverlays.value || []) {
    const imageUrl = String(overlayObject?.properties?.imageUrl || '').trim()
    if (!imageUrl) continue

    const opacityCandidate = overlayObject?.style?.opacity ?? overlayObject?.properties?.opacity
    const opacity = Number.isFinite(Number(opacityCandidate))
      ? Number(opacityCandidate)
      : 0.65

    L.imageOverlay(imageUrl, currentBounds, {
      opacity,
      interactive: false,
    }).addTo(overlayLayer)
  }
}

function renderPins() {
  if (!L || !map || !markerLayer) return

  markerLayer.clearLayers()

  // Authoring size stays the base 20x28 icon -- only the on-screen scale
  // multiplier is zoom-driven, same scaledSize() helper roads use.
  const pinScale = scaledSize(1, map.getZoom(), PIN_ZOOM_TUNING.damping, PIN_ZOOM_TUNING.min, PIN_ZOOM_TUNING.max)
  const width = 20 * pinScale
  const height = 28 * pinScale

  for (const pin of resolvedPins.value || []) {
    const scale = mapCoordinateScale()
    const lat = usingTiles() ? -(pin.y / scale) : pin.y
    const lng = usingTiles() ? pin.x / scale : pin.x

    const marker = L.marker(L.latLng(lat, lng), {
      icon: L.divIcon({
        className: 'eldra-leaflet-pin',
        html: makePinHtml(pin, pin.id === props.selectedPinId, width, height),
        iconSize: [width, height],
        iconAnchor: [width / 2, height - 1],
        tooltipAnchor: [0, -(height - 4)],
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
        offset: [0, -(height - 4)],
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

  renderImageOverlays()
  renderRoads()

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
    props.tileOriginalHeight
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
  () => resolvedImageOverlays.value,
  () => {
    renderImageOverlays()
  },
  { deep: true }
)

watch(
  () => resolvedRoads.value,
  () => {
    renderRoads()
  },
  { deep: true }
)

watch(
  () => inputLayers.value,
  () => {
    // Scene graph plumbing: accept scene/layers input for pins, image overlays, and roads.
    renderImageOverlays()
    renderRoads()
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
  () => props.selectedRoadId,
  () => {
    renderRoads()
  }
)

watch(
  () => props.editingRoadStyle,
  () => {
    renderRoads()
  },
  { deep: true }
)

watch(
  () => props.buildMode,
  () => {
    if (!map) return
    map.getContainer().style.cursor = props.buildMode ? 'crosshair' : ''
  }
)

watch(
  () => props.roadMode,
  () => {
    if (!map) return
    if (props.roadMode) {
      map.doubleClickZoom.disable()
      return
    }
    map.doubleClickZoom.enable()

    if (roadRubberBandLine && roadLayer) {
      roadLayer.removeLayer(roadRubberBandLine)
      roadRubberBandLine = null
    }
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
