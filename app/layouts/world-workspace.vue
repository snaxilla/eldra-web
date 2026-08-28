<script setup lang="ts">
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

function shouldCollapseWorkspaceSidebar(path: any) {
  return /^\/worlds\/[^/]+\/entities\/[^/]+\/sheet(?:\/|$)/.test(String(path || ''))
}

const leftCollapsed = useState<boolean>('world-workspace-left-collapsed', () => shouldCollapseWorkspaceSidebar(route.path))


watch(
  () => route.path,
  (path) => {
    if (shouldCollapseWorkspaceSidebar(path)) {
      leftCollapsed.value = true
    }
  },
  { immediate: true }
)

function toggleWorkspaceSidebar() {
  leftCollapsed.value = !leftCollapsed.value
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
function onBreakpointChange(query: MediaQueryList | MediaQueryListEvent) {
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
const canBuild = computed(() => Array.isArray(world.value?.capabilities) && world.value.capabilities.includes('world.entity.edit'))

watch(canBuild, (allowed) => {
  if (!allowed && mode.value === 'build') {
    mode.value = 'play'
  }
}, { immediate: true })

const pageKey = computed(() => {
  const parts = String(route.path || '').split('/').filter(Boolean)
  const worldIndex = parts.findIndex(p => p === 'worlds')

  if (worldIndex === -1) return 'global'

  const maybePage = parts[worldIndex + 2]
  const maybeChild = parts[worldIndex + 3]

  if (maybePage === 'entities' && maybeChild) {
    return 'entity-article'
  }

  return maybePage || 'world-map'
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
</script>

<template>
  <div class="h-screen w-screen overflow-hidden text-slate-100 bg-[#0a0d12]">
    <div
      class="grid h-full grid-cols-1 md:[grid-template-columns:var(--wksp-cols)]"
      :style="{ '--wksp-cols': leftCollapsed ? '68px minmax(0,1fr)' : '280px minmax(0,1fr)' }"
    >
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
        class="fixed inset-y-0 left-0 z-[100] w-[280px] max-w-[85vw] -translate-x-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out md:static md:z-auto md:w-auto md:max-w-none md:translate-x-0 md:pt-0 md:pb-0 md:transition-none"
        :class="mobileDrawerOpen ? 'translate-x-0' : ''"
        role="dialog"
        aria-modal="true"
        aria-label="World navigation"
      >
        <WorldWorkspaceSidebar
          :world="world"
          :collapsed="leftCollapsed"
          :mode="mode"
          :can-build="canBuild"
          @toggle-collapse="toggleWorkspaceSidebar"
          @set-mode="mode = $event"
        />

        <!-- Mobile-only close affordance -- desktop already has the
             collapse toggle built into WorldWorkspaceSidebar itself. -->
        <button
          v-if="mobileDrawerOpen"
          type="button"
          data-drawer-close
          class="absolute right-3 z-[101] inline-flex h-11 w-11 items-center justify-center rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(20,17,12,0.86)] text-[#efe2bd] md:hidden"
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
        class="fixed left-3 z-[90] inline-flex h-11 w-11 items-center justify-center rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(20,17,12,0.86)] text-[#efe2bd] shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur transition hover:border-[rgba(201,164,90,0.55)] md:hidden"
        style="top: calc(0.75rem + env(safe-area-inset-top));"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        :aria-expanded="mobileDrawerOpen"
        @click="openMobileDrawer"
      >
        <UIcon name="i-lucide-menu" class="h-5 w-5" />
      </button>

      <div class="min-w-0 overflow-hidden relative">
        <div class="absolute inset-0 bg-[linear-gradient(to_bottom,#0b0d12,#0d1117_40%,#10141b)]"></div>

        <div
          v-if="backgroundImageUrl && presentationMode !== 'neutral'"
          class="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
          :style="{
            backgroundImage: `url('${backgroundImageUrl}')`,
            opacity: presentationMode === 'immersive' ? '0.42' : '0.18',
            filter: presentationMode === 'immersive'
              ? 'saturate(1.02) contrast(1.01) brightness(0.98)'
              : 'grayscale(0.08) saturate(0.78) brightness(0.92)'
          }"
        />

        <div
          v-if="presentationMode !== 'neutral'"
          class="absolute inset-0"
          :style="{
            background: presentationMode === 'immersive'
              ? 'linear-gradient(to bottom, rgba(9,11,15,0.20), rgba(12,15,20,0.34) 32%, rgba(14,18,24,0.48) 72%, rgba(16,20,26,0.60))'
              : 'linear-gradient(to bottom, rgba(10,12,16,0.36), rgba(13,16,21,0.50) 38%, rgba(16,20,26,0.64))'
          }"
        />

        <div class="relative h-full w-full overflow-hidden">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
