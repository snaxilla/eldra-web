<script setup lang="ts">
const props = defineProps<{
  world: any
  collapsed: boolean
  mode: 'play' | 'build'
  // Beta Zero audit, Issue 2: whether the current Principal holds the
  // capability that gates Build mode for this World (computed server-side
  // in server/api/worlds/[id]/index.get.ts via the real can(), passed down
  // from world-workspace.vue -- this component makes no permission decision
  // of its own, it only renders what it is told).
  canBuild: boolean
  // Map-Only Navigation Controls fix: whether the CURRENT route is the
  // actual interactive World Map (app/pages/worlds/[id]/index.vue) -- the
  // one surface that both places/edits pins (`mode === 'build'`) and
  // renders them (`showPins`). Passed down from world-workspace.vue's own
  // `isFullBleedMap` (`pageKey.value === 'world-map'`), the SAME route-type
  // abstraction the layout already uses for its full-bleed map styling --
  // not re-derived here from the raw pathname, which previously also
  // matched `/worlds/:id/maps` (the map GALLERY/upload page: no pins, and
  // its own `mode` state is read nowhere, confirmed by tracing
  // maps.vue), wrongly showing Play/Build and Hide/Show Pins there too.
  // Every OTHER world page (Classes, Spells, Enemies, ...) is `false` here;
  // Play/Build itself still works exactly as before once the player
  // reaches the World Map -- this only hides the REDUNDANT toggle
  // elsewhere, it never changes what `mode`/`canBuild` mean or do.
  isMapPage: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-collapse'): void
  (e: 'set-mode', mode: 'play' | 'build'): void
}>()

const showPins = useState<boolean>('world-map-show-pins', () => true)

const worldId = computed(() => String(props.world?.id || ''))

const navItems = computed(() => [
  { label: 'World Map', icon: 'i-lucide-map', to: `/worlds/${worldId.value}` },
  { label: 'Overview', icon: 'i-lucide-file-text', to: `/worlds/${worldId.value}/overview` },
  { label: 'Game Admin', icon: 'i-lucide-crown', to: `/worlds/${worldId.value}/admin` },
  { label: 'Characters', icon: 'i-lucide-users', to: `/worlds/${worldId.value}/characters` },
  { label: 'Locations', icon: 'i-lucide-map-pin', to: `/worlds/${worldId.value}/locations` },
  { label: 'Spells', icon: 'i-lucide-sparkles', to: `/worlds/${worldId.value}/spells` },
  { label: 'Species', icon: 'i-lucide-dna', to: `/worlds/${worldId.value}/species` },
  { label: 'Items', icon: 'i-lucide-package', to: `/worlds/${worldId.value}/items` },
  { label: 'Enemies', icon: 'i-lucide-skull', to: `/worlds/${worldId.value}/enemies` },
  { label: 'Classes', icon: 'i-lucide-shield', to: `/worlds/${worldId.value}/classes` },
    { label: 'Feats', icon: 'i-lucide-badge-plus', to: `/worlds/${worldId.value}/feats` },
  { label: 'Maps', icon: 'i-lucide-map', to: `/worlds/${worldId.value}/maps` },
  { label: 'Timelines', icon: 'i-lucide-git-commit-horizontal', to: `/worlds/${worldId.value}/timelines` },
  { label: 'Media Gallery', icon: 'i-lucide-images', to: `/worlds/${worldId.value}/media` },
  { label: 'Other', icon: 'i-lucide-folder', to: `/worlds/${worldId.value}/other` },
  { label: 'Importer', icon: 'i-lucide-download', to: `/worlds/${worldId.value}/importer` },
])
</script>

<template>
  <!-- Background/border/text come from .eldra-sidebar-ornate (theme
       tokens, themes/surfaces.css); the full-bleed World Map adds
       .eldra-glass-surface from the layout. -->
  <aside class="eldra-sidebar-ornate relative isolate flex h-full min-h-0 flex-col border-r">
    <span
      class="eldra-ornament-frame"
      :class="collapsed ? 'eldra-ornament-frame--compact' : ''"
      aria-hidden="true"
    />

    <!-- COLLAPSED -->
    <template v-if="collapsed">
      <div class="flex items-center justify-center p-3">
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-none border border-eldra-accent/24 text-eldra-text-dim transition hover:border-eldra-accent/48 hover:bg-eldra-accent/10 hover:text-eldra-text-strong"
          aria-label="Expand navigation"
          @click="emit('toggle-collapse')"
        >
          <UIcon name="i-lucide-panel-left-open" class="h-5 w-5" />
        </button>
      </div>

      <div class="flex items-center justify-center px-2 pb-3">
        <div class="text-center">
          <div class="eldra-display text-sm text-eldra-text-strong">Eldra</div>
        </div>
      </div>

      <div v-if="isMapPage" class="flex flex-col items-center gap-2 px-2 pb-4">
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-none border text-sm transition"
          :class="mode === 'play'
            ? 'border-eldra-accent/58 bg-eldra-accent/16 text-eldra-accent-text'
            : 'border-eldra-accent/22 text-eldra-text-dim hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
          @click="emit('set-mode', 'play')"
          title="Play"
          aria-label="Play mode"
          :aria-pressed="mode === 'play'"
        >
          <UIcon name="i-lucide-play" class="h-4 w-4" />
        </button>

        <button
          v-if="canBuild"
          class="inline-flex h-10 w-10 items-center justify-center rounded-none border text-sm transition"
          :class="mode === 'build'
            ? 'border-eldra-accent/58 bg-eldra-accent/16 text-eldra-accent-text'
            : 'border-eldra-accent/22 text-eldra-text-dim hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
          @click="emit('set-mode', 'build')"
          title="Build"
          aria-label="Build mode"
          :aria-pressed="mode === 'build'"
        >
          <UIcon name="i-lucide-hammer" class="h-4 w-4" />
        </button>
      </div>

      <!-- Icon rail: scrolls on short viewports; labels are exposed as
           tooltips (hover + keyboard focus) and accessible names. -->
      <nav aria-label="World navigation" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1">
        <div class="space-y-2">
          <UTooltip
            v-for="item in navItems"
            :key="item.label"
            :text="item.label"
            :content="{ side: 'right' }"
          >
            <NuxtLink
              :to="item.to"
              class="eldra-sidebar-nav-item flex h-10 items-center justify-center rounded-none border border-transparent text-eldra-text-dim transition hover:border-eldra-accent/24 hover:bg-eldra-accent/8 hover:text-eldra-text-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-eldra-accent-bright"
              active-class="border-eldra-accent/42 bg-eldra-accent/14 text-eldra-text-strong"
              :aria-label="item.label"
            >
              <UIcon :name="item.icon" class="h-5 w-5" />
            </NuxtLink>
          </UTooltip>
        </div>
      </nav>

      <div class="border-t border-eldra-accent/22 p-2">
        <button
          v-if="isMapPage"
          type="button"
          class="mb-2 flex h-10 w-full items-center justify-center rounded-none border text-sm transition"
          :class="showPins
            ? 'border-eldra-accent/42 bg-eldra-accent/14 text-eldra-accent-text'
            : 'border-eldra-accent/22 text-eldra-text-dim hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
          @click="showPins = !showPins"
          :title="showPins ? 'Pins Visible' : 'Pins Hidden'"
          :aria-label="showPins ? 'Hide map pins' : 'Show map pins'"
          :aria-pressed="showPins"
        >
          <UIcon :name="showPins ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="h-4 w-4" />
        </button>

        <div class="mb-2">
          <EldraAccessibilityMenu compact fill />
        </div>

        <!-- Exactly one Switch World action, now wrapped the same way every
             nav item above it is (`<UTooltip>`, not a native `title`) --
             the one real inconsistency found while tracing a reported
             "shown twice" (no second rendered control exists anywhere in
             this file, the layout, or git history; see this task's own
             final report for the investigation). -->
        <UTooltip text="Switch World" :content="{ side: 'right' }">
          <NuxtLink
            to="/"
            class="eldra-sidebar-switch flex h-10 items-center justify-center rounded-none border border-eldra-accent/24 bg-eldra-panel/72 text-eldra-text-soft transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong"
            aria-label="Switch World"
          >
            <UIcon name="i-lucide-arrow-left-right" class="h-4 w-4" />
          </NuxtLink>
        </UTooltip>
      </div>
    </template>

    <!-- EXPANDED -->
    <template v-else>
      <div class="eldra-sidebar-brand p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="eldra-ornament-emblem" aria-hidden="true" />
            <div>
              <div class="eldra-sidebar-brandmark eldra-display text-2xl text-eldra-text-strong">Eldra</div>
              <div class="text-xs uppercase tracking-[0.28em] text-eldra-text-faint">World Platform</div>
            </div>
          </div>

          <button
            class="rounded-none border border-eldra-accent/24 p-2 text-eldra-text-dim transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong"
            aria-label="Collapse navigation"
            @click="emit('toggle-collapse')"
          >
            <UIcon name="i-lucide-panel-left-close" class="h-4 w-4" />
          </button>
        </div>

        <div class="eldra-display mt-4 text-base leading-snug text-eldra-text">
          {{ world?.name }}
        </div>
      </div>

      <div v-if="isMapPage" class="px-4 pb-4">
        <div class="flex gap-2">
          <button
            class="eldra-sidebar-mode flex-1 rounded-none border px-3 py-2 text-sm transition"
            :class="mode === 'play'
              ? 'border-eldra-accent/58 bg-eldra-accent/16 text-eldra-accent-text'
              : 'border-eldra-accent/22 text-eldra-text-dim hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
            @click="emit('set-mode', 'play')"
          >
            Play
          </button>

          <button
            v-if="canBuild"
            class="eldra-sidebar-mode flex-1 rounded-none border px-3 py-2 text-sm transition"
            :class="mode === 'build'
              ? 'border-eldra-accent/58 bg-eldra-accent/16 text-eldra-accent-text'
              : 'border-eldra-accent/22 text-eldra-text-dim hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
            @click="emit('set-mode', 'build')"
          >
            Build
          </button>
        </div>
      </div>

      <nav class="min-h-0 flex-1 overflow-y-auto px-2">
        <div class="space-y-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.label"
            :to="item.to"
            class="eldra-sidebar-nav-item flex items-center gap-3 rounded-none border border-transparent px-3 py-2 pl-6 text-sm text-eldra-text-soft transition hover:border-eldra-accent/24 hover:bg-eldra-accent/10 hover:text-eldra-text-strong"
            active-class="border-eldra-accent/42 bg-eldra-accent/14 text-eldra-text-strong"
          >
            <UIcon :name="item.icon" class="h-4 w-4" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </div>
      </nav>

      <div class="border-t border-eldra-accent/22 p-4 space-y-4">
        <div
            v-if="isMapPage"
            class="rounded-none border border-eldra-accent/22 bg-eldra-panel/72 p-3"
          >
          <div class="mb-2 text-[11px] uppercase tracking-[0.3em] text-eldra-text-faint">
            Map Pins
          </div>

          <button
            type="button"
            class="flex w-full items-center justify-between rounded-none border px-3 py-2 text-sm transition"
            :class="showPins
              ? 'border-eldra-accent/42 bg-eldra-accent/14 text-eldra-accent-text'
              : 'border-eldra-accent/22 text-eldra-text-dim hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
            @click="showPins = !showPins"
          >
            <span>{{ showPins ? 'Pins Visible' : 'Pins Hidden' }}</span>
            <UIcon :name="showPins ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="h-4 w-4" />
          </button>

          <div class="mt-2 text-xs text-eldra-text-faint">
            Hide map markers without deleting them.
          </div>
        </div>

        <EldraAccessibilityMenu />

        <NuxtLink
          to="/"
          class="eldra-sidebar-switch flex items-center justify-center gap-2 rounded-none border border-eldra-accent/24 bg-eldra-panel/72 px-3 py-2 text-sm text-eldra-text-soft transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong"
        >
          <UIcon name="i-lucide-arrow-left-right" class="h-4 w-4" />
          <span>Switch World</span>
        </NuxtLink>
      </div>
    </template>
  </aside>
</template>
