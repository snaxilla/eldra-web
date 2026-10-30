<script setup lang="ts">
// Eldra Roll System Phase 3A -- WorldDiceOverlay is mounted exactly once
// here (see that component's own header for why the World layout, not any
// individual page, is its home).
import WorldDiceOverlay from '~/components/world/WorldDiceOverlay.vue'
import { resolveWorldWorkspacePageKey } from '~/lib/eldra/world-workspace-page-key'

const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const showPinsCookie = useCookie<string>('eldra-show-pins', {
  default: () => 'true'
})
const showPins = useState<boolean>('world-map-show-pins', () => showPinsCookie.value != 'false')

watch(showPins, (value) => {
  showPinsCookie.value = value ? 'true' : 'false'
})

// Character sheet routes, and (Character Creator V3 scroll/navigation
// repair) the cinematic Character Creator, default the workspace navigation
// to its compact icon rail (still expandable) so the content gets the
// width. Covers the legacy sheet (`entities/:id/sheet`), the V2 sheet
// (including the canonical `characters/:id/sheet` resolver route, Phase
// 4B-0), and `characters/create-v2` -- the same reasoning as the sheet:
// both are full-bleed, content-dense surfaces where the expanded 280px rail
// is the first thing pushing their own content below the fold at short
// viewport heights.
function shouldCollapseWorkspaceSidebar(path: any) {
  const value = String(path || '')
  return /^\/worlds\/[^/]+\/entities\/[^/]+\/sheet(?:\/|$)/.test(value)
    || /^\/worlds\/[^/]+\/characters\/[^/]+\/sheet(?:-v2)?(?:\/|$)/.test(value)
    || /^\/worlds\/[^/]+\/characters\/create-v2(?:\/|$)/.test(value)
}

const leftCollapsed = useState<boolean>('world-workspace-left-collapsed', () => shouldCollapseWorkspaceSidebar(route.path))

// The rail state the user had before this auto-collapsed it, restored on
// leaving so other pages keep their own default. Cleared if the user
// toggles the rail while on one of these routes (their latest choice wins).
// `null` = nothing to restore. Named for the sheet (its original caller);
// the Creator reuses the identical mechanism rather than a second state key.
const preSheetCollapsed = useState<boolean | null>('world-workspace-pre-sheet-collapsed', () => null)

watch(
  () => route.path,
  (path, previousPath) => {
    const onCollapsingRoute = shouldCollapseWorkspaceSidebar(path)
    const wasOnCollapsingRoute = previousPath !== undefined && shouldCollapseWorkspaceSidebar(previousPath)

    if (onCollapsingRoute && !wasOnCollapsingRoute) {
      // A direct load has no prior page: restore to expanded.
      preSheetCollapsed.value = previousPath === undefined ? false : leftCollapsed.value
      leftCollapsed.value = true
    } else if (!onCollapsingRoute && wasOnCollapsingRoute && preSheetCollapsed.value !== null) {
      leftCollapsed.value = preSheetCollapsed.value
      preSheetCollapsed.value = null
    }
  },
  { immediate: true }
)

function toggleWorkspaceSidebar() {
  leftCollapsed.value = !leftCollapsed.value
  preSheetCollapsed.value = null
}

// Phase 0 (Beautification Pass): below `md`, WorldWorkspaceSidebar leaves
// grid flow and becomes an off-canvas overlay drawer. This state is
// intentionally a plain `ref`, not `useState` -- unlike `leftCollapsed`
// (a desktop layout preference worth remembering across navigation), the
// mobile drawer's open/closed state is a transient per-page interaction:
// every route change closes it below, matching how off-canvas nav in any
// mobile app behaves. `leftCollapsed` itself is untouched and still governs
// desktop's collapsed-vs-expanded width exactly as before.
const mobileDrawerOpen = ref(false)
const hamburgerButtonRef = ref<HTMLButtonElement | null>(null)
const mobileDrawerRef = ref<HTMLElement | null>(null)

function openMobileDrawer() {
  mobileDrawerOpen.value = true
}

function closeMobileDrawer() {
  if (!mobileDrawerOpen.value) return
  mobileDrawerOpen.value = false
  hamburgerButtonRef.value?.focus()
}

watch(() => route.path, () => {
  mobileDrawerOpen.value = false
})

function onMobileDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMobileDrawer()
  }
}

let breakpointQuery: MediaQueryList | null = null
// `md`+ (matches the media query below). Client-only; false during SSR,
// which is fine -- it only feeds the map viewport inset.
const isDesktop = ref(false)

function onBreakpointChange(query: MediaQueryList | MediaQueryListEvent) {
  isDesktop.value = query.matches
  // A drawer left open through a resize/rotation past `md` would otherwise
  // strand the scroll lock below with no visible way to dismiss it, since
  // the hamburger/backdrop are both `md:hidden`.
  if (query.matches) mobileDrawerOpen.value = false
}

watch(mobileDrawerOpen, (open) => {
  if (!import.meta.client) return
  document.documentElement.classList.toggle('overflow-hidden', open)
  if (open) {
    window.addEventListener('keydown', onMobileDrawerKeydown)
    nextTick(() => {
      mobileDrawerRef.value?.querySelector<HTMLElement>('[data-drawer-close]')?.focus()
    })
  } else {
    window.removeEventListener('keydown', onMobileDrawerKeydown)
  }
})

onMounted(() => {
  if (!import.meta.client) return
  breakpointQuery = window.matchMedia('(min-width: 768px)')
  onBreakpointChange(breakpointQuery)
  breakpointQuery.addEventListener('change', onBreakpointChange)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  breakpointQuery?.removeEventListener('change', onBreakpointChange)
  window.removeEventListener('keydown', onMobileDrawerKeydown)
  document.documentElement.classList.remove('overflow-hidden')
})

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

// Beta Zero audit, Issue 2: `mode` is a single global useState key shared
// across every World the app renders in this client session, not scoped to
// the current worldId. Without this guard, a GM/Worldbuilder who leaves
// Build mode on and then navigates into a World where they are only a
// Player would carry 'build' over, and every `mode === 'build'` panel
// throughout the workspace would render for them despite the toggle itself
// being hidden below. `world.capabilities` (server/api/worlds/[id]/index.get.ts)
// is the real, server-computed capability set for this Principal in THIS
// world -- the same can() every enforcement route already asks, not a
// client-side re-derivation of role/membership logic. `world.entity.edit`
// is the existing capability every worldbuilding role (owner/gm/worldbuilder)
// holds and no Player/Observer holds, per WORLD_ROLE_CAPABILITIES -- there is
// no dedicated "may enter Build mode" capability in the vocabulary, and the
// task's own IMPORTANT section forbids inventing one.
// Theming Architecture, Phase 2: the GM-selected World theme, inherited by
// everyone in this World (see .github/docs/architecture/theming.md). A
// failed fetch (e.g. collection not yet provisioned) leaves `selection`
// null, which resolves to the platform default -- never a broken shell.
const { data: worldPresentationSettings } = await useFetch(() => `/api/worlds/${worldId.value}/presentation-settings`, {
  default: () => null
})

watch(
  [worldId, worldPresentationSettings],
  ([id, settings]) => {
    // Ignore a response still belonging to the previous World mid-switch.
    if (!id || (settings && String(settings.worldId) !== id)) return
    setWorldTheme(id, settings)
  },
  { immediate: true }
)

const canBuild = computed(() => Array.isArray(world.value?.capabilities) && world.value.capabilities.includes('world.entity.edit'))

watch(canBuild, (allowed) => {
  if (!allowed && mode.value === 'build') {
    mode.value = 'play'
  }
}, { immediate: true })

// Resolution logic itself now lives in resolveWorldWorkspacePageKey
// (app/lib/eldra/world-workspace-page-key.ts) -- extracted, not rewritten,
// so the Map-Only Navigation Controls fix can unit-test it directly and so
// WorldWorkspaceSidebar.vue can check the SAME route-identity rule this
// computed already used for full-bleed map styling, rather than a second,
// independently-derived pathname check.
const pageKey = computed(() => resolveWorldWorkspacePageKey(route.path))

// Theming Phase 3A: the World Map (and only the World Map) is full-bleed --
// at `md`+ the map extends behind the workspace sidebar, which floats over
// it as darkglass instead of taking its own grid column. Every other page
// keeps the existing two-column grid untouched. Below `md` nothing changes:
// the sidebar is the same off-canvas drawer on every page.
const isFullBleedMap = computed(() => pageKey.value === 'world-map')

const sidebarWidth = computed(() => (leftCollapsed.value ? '68px' : '280px'))

const gridStyle = computed(() => ({
  '--wksp-cols': isFullBleedMap.value ? 'minmax(0,1fr)' : `${sidebarWidth.value} minmax(0,1fr)`
}))

// Map overlays anchored to the left edge (breadcrumbs, tool bar, layer
// panel, Leaflet zoom) offset themselves by this so the floating sidebar
// never covers them. 0 below `md` and on every non-map page.
const mapInsetClass = computed(() => {
  if (!isFullBleedMap.value) return ''
  return leftCollapsed.value ? 'md:[--eldra-map-inset-left:80px]' : 'md:[--eldra-map-inset-left:292px]'
})

// Screen pixels the floating sidebar covers on the full-bleed map, for the
// map page to pass to the renderer as `viewportInsets.left` (Phase 3B-1).
// Mirrors mapInsetClass; 0 on mobile and every non-map page.
const worldMapInsetLeft = useState<number>('world-map-viewport-inset-left', () => 0)
watchEffect(() => {
  worldMapInsetLeft.value = isFullBleedMap.value && isDesktop.value
    ? (leftCollapsed.value ? 80 : 292)
    : 0
})

// Phase 3C: on ordinary pages the sidebar keeps its own grid column but is
// lifted (relative + z-10) above the page backdrop, which now spans the
// whole workspace beneath both columns.
const sidebarWrapperDesktopClass = computed(() => {
  if (!isFullBleedMap.value) return 'md:relative md:z-10 md:w-auto'
  return [
    'md:absolute md:inset-y-0 md:left-0 md:z-40',
    leftCollapsed.value ? 'md:w-[68px]' : 'md:w-[280px]'
  ]
})

const presentationState = useState<{
  worldKey: string
  pageKey: string
  presentationMode: string
  backgroundFileId: string | null
  backgroundImageUrl: string | null
}>('world-page-presentation', () => ({
  worldKey: '',
  pageKey: '',
  presentationMode: 'neutral',
  backgroundFileId: null,
  backgroundImageUrl: null
}))

const presentationRefreshNonce = useState<number>('world-page-presentation-refresh-nonce', () => 0)

const {
  data: fetchedPresentation,
  refresh: refreshPresentation
} = await useFetch(() => `/api/worlds/${worldId.value}/presentation/${pageKey.value}`, {
  default: () => ({
    worldKey: String(worldId.value || ''),
    pageKey: String(pageKey.value || 'world-map'),
    presentationMode: 'neutral',
    backgroundFileId: null,
    backgroundImageUrl: null
  }),
  watch: [worldId, pageKey, presentationRefreshNonce]
})

watch(
  fetchedPresentation,
  (value) => {
    if (!value) return
    presentationState.value = {
      worldKey: String(value.worldKey || worldId.value || ''),
      pageKey: String(value.pageKey || pageKey.value || ''),
      presentationMode: String(value.presentationMode || 'neutral'),
      backgroundFileId: value.backgroundFileId ? String(value.backgroundFileId) : null,
      backgroundImageUrl: value.backgroundImageUrl ? String(value.backgroundImageUrl) : null
    }
  },
  { immediate: true, deep: true }
)

watch([worldId, pageKey], async () => {
  await refreshPresentation()
})

const presentationMode = computed(() => String(presentationState.value.presentationMode || 'neutral'))
const backgroundImageUrl = computed(() => {
  if (presentationState.value.backgroundImageUrl) {
    return String(presentationState.value.backgroundImageUrl)
  }
  if (presentationState.value.backgroundFileId) {
    return `/api/assets/${presentationState.value.backgroundFileId}`
  }
  return ''
})

// Phase 3C: a GM page background (Page Setup) is drawn once, behind the
// whole workspace -- navigation included -- rather than inside the content
// column, so every surface above it is glass over the same artwork. Neutral
// shows no artwork. The full-bleed World Map draws its own scene instead.
//
// A page can instead declare Eldra's animated universe as its backdrop
// (`definePageMeta({ eldraBackdrop: 'universe' })` -- Game Admin): the same
// WorldChooserThpace the World Selection screen shows, drawn here behind the
// whole workspace, and never replaced by a World's page background.
const usesUniverseBackdrop = computed(() => !isFullBleedMap.value && route.meta.eldraBackdrop === 'universe')

const hasPageBackdrop = computed(() =>
  !isFullBleedMap.value &&
  !usesUniverseBackdrop.value &&
  Boolean(backgroundImageUrl.value) &&
  presentationMode.value !== 'neutral'
)
const backdropTone = computed(() => (presentationMode.value === 'immersive' ? 'immersive' : 'muted'))

// Read by WorldChooserThpace on pages that yield to a GM page background.
const pageBackdropActive = useState<boolean>('world-page-backdrop-active', () => false)
watchEffect(() => {
  pageBackdropActive.value = hasPageBackdrop.value
})

// The sidebar is glass wherever it sits over artwork: the map, a page
// backdrop or the universe. Over the plain ground it keeps its solid binding.
const sidebarGlass = computed(() => isFullBleedMap.value || hasPageBackdrop.value || usesUniverseBackdrop.value)
</script>

<template>
  <div class="eldra-workspace-ground h-screen w-screen overflow-hidden text-eldra-text">
    <!-- `[grid-template-rows:minmax(0,1fr)]` (Character Creator V3 scroll/navigation repair --
         ACTUAL ROOT CAUSE of "scrolling does not work," confirmed by walking this element's own
         ancestor chain in the running app): this grid declared columns but never rows, so its one
         implicit row used the CSS Grid default -- `auto`, sized to its TALLEST content -- instead
         of being pinned to this element's own `h-full`. A page whose content is taller than the
         viewport (any character with a class selected, not just an empty-state visit) therefore
         stretched this grid's own row past the viewport, and with it every descendant that relied
         on `h-full`/`flex-1` to learn how tall "the available space" actually was -- including
         every page's own `overflow-y-auto` scroll region, whose `clientHeight` and `scrollHeight`
         were BOTH being measured against that inflated, content-driven number, so they were always
         equal and nothing ever registered as scrollable. `minmax(0,1fr)` is the exact pattern
         `--wksp-cols` already uses for this grid's own COLUMN tracks, applied here to its row:
         it fills the container's real height and is NEVER allowed to grow past it, so a page's own
         internal scroll regions finally measure against the true viewport, not their own content. -->
    <div
      class="relative grid h-full grid-cols-1 [grid-template-rows:minmax(0,1fr)] md:[grid-template-columns:var(--wksp-cols)]"
      :class="isFullBleedMap ? 'eldra-map-shell' : ''"
      :style="gridStyle"
      :data-eldra-page-backdrop-active="hasPageBackdrop ? '' : undefined"
    >
      <!-- Page backdrop (Phase 3C): spans both grid columns, beneath the
           sidebar and the content. Strength and scrim are theme tokens
           (--eldra-backdrop-*), not literals. -->
      <template v-if="hasPageBackdrop">
        <div
          class="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
          aria-hidden="true"
          data-eldra-page-backdrop
          :style="{
            backgroundImage: `url('${backgroundImageUrl}')`,
            opacity: `var(--eldra-backdrop-${backdropTone}-opacity)`,
            filter: backdropTone === 'immersive'
              ? 'saturate(1.02) contrast(1.01) brightness(0.98)'
              : 'grayscale(0.08) saturate(0.78) brightness(0.92)'
          }"
        />
        <div
          class="pointer-events-none absolute inset-0"
          aria-hidden="true"
          :style="{ background: `var(--eldra-backdrop-${backdropTone}-scrim)` }"
        />
      </template>
      <WorldChooserThpace
        v-else-if="usesUniverseBackdrop"
        mode="absolute"
      />
      <!-- Mobile drawer backdrop. Dismiss-by-tap; not rendered at all at
           `md`+, matching the fixed-backdrop convention already used by
           SheetItemDetailDrawer.vue / SheetSpellDetailDrawer.vue. -->
      <div
        v-if="mobileDrawerOpen"
        class="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm md:hidden"
        aria-hidden="true"
        @click="closeMobileDrawer"
      />

      <!-- Sidebar: an off-canvas drawer below `md`, an ordinary first grid
           column at `md`+. WorldWorkspaceSidebar itself is unmodified --
           only this wrapper's positioning differs by breakpoint, so desktop
           markup/behavior is byte-for-byte what it was before Phase 0. -->
      <div
        ref="mobileDrawerRef"
        class="fixed inset-y-0 left-0 z-[100] w-[280px] max-w-[85vw] -translate-x-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out md:max-w-none md:translate-x-0 md:pt-0 md:pb-0 md:transition-none"
        :class="[mobileDrawerOpen ? 'translate-x-0' : '', sidebarWrapperDesktopClass]"
        role="dialog"
        aria-modal="true"
        aria-label="World navigation"
      >
        <WorldWorkspaceSidebar
          :class="sidebarGlass ? 'eldra-glass-surface' : ''"
          :world="world"
          :collapsed="leftCollapsed"
          :mode="mode"
          :can-build="canBuild"
          :is-map-page="isFullBleedMap"
          @toggle-collapse="toggleWorkspaceSidebar"
          @set-mode="mode = $event"
        />

        <!-- Mobile-only close affordance -- desktop already has the
             collapse toggle built into WorldWorkspaceSidebar itself. -->
        <button
          v-if="mobileDrawerOpen"
          type="button"
          data-drawer-close
          class="absolute right-3 z-[101] inline-flex h-11 w-11 items-center justify-center rounded-none border border-eldra-accent/32 bg-eldra-panel/86 text-eldra-text md:hidden"
          style="top: calc(0.75rem + env(safe-area-inset-top));"
          aria-label="Close navigation"
          @click="closeMobileDrawer"
        >
          <UIcon name="i-lucide-x" class="h-5 w-5" />
        </button>
      </div>

      <!-- Hamburger trigger: shell-owned, floats over page content, hidden
           at `md`+. Content pages are untouched, so this is the only new
           control surface Phase 0 introduces into the visible page. -->
      <button
        v-if="!mobileDrawerOpen"
        ref="hamburgerButtonRef"
        type="button"
        class="fixed left-3 z-[90] inline-flex h-11 w-11 items-center justify-center rounded-none border border-eldra-accent/32 bg-eldra-panel/86 text-eldra-text shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur transition hover:border-eldra-accent/55 md:hidden"
        style="top: calc(0.75rem + env(safe-area-inset-top));"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        :aria-expanded="mobileDrawerOpen"
        @click="openMobileDrawer"
      >
        <UIcon name="i-lucide-menu" class="h-5 w-5" />
      </button>

      <div class="min-w-0 overflow-hidden relative" :class="mapInsetClass">
        <div class="relative h-full w-full overflow-hidden">
          <slot />
        </div>
      </div>
    </div>

    <WorldDiceOverlay />
  </div>
</template>
