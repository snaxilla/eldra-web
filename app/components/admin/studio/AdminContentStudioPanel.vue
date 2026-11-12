<script setup lang="ts">
// Content Studio -- Browse. Content Workspaces & Studio Phase 2 (§12.1/§12.2).
//
// READ-ONLY, and visibly so: there is no Edit or Save control anywhere in
// this panel, because editing does not exist yet and a disabled button
// that never becomes enabled is a worse answer than no button.
//
// NO SECOND DATA PIPELINE. Every row comes from
// GET /api/content/studio/search, which filters the SAME
// getWorldContentCatalogue projection the category pages and the
// Character Sheet read. Filtering, pagination, and facet counting are a
// pure module (studioSearchQuery.ts) tested without a DOM, since this
// repo has no component-rendering harness.
//
// KNOWS NO GAME SYSTEM. Categories, labels, and source packages all
// arrive from the response. There is no `dnd5e` literal here, and
// nothing below names an entity type.
//
// RESPONSIVE BY CSS, NOT BY BREAKPOINT STATE. The filter rail is a
// sibling column from `lg` and an inline collapsible panel below it;
// both are always in the DOM, so there is no viewport measurement and
// no hydration mismatch. Rows are cards at every width -- a table that
// becomes a card list is two layouts to keep correct, and this is one.

import { computed, ref, watch } from 'vue'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import {
  STUDIO_DEFAULT_LIMIT,
  type StudioFacet,
  type StudioImageFilter,
  type StudioResultRow
} from './studioSearchQuery'

const props = defineProps<{ worldId: string | number }>()

type SearchResponse = {
  worldId: string
  rows: StudioResultRow[]
  total: number
  limit: number
  offset: number
  categoryFacets: StudioFacet[]
  packageFacets: StudioFacet[]
  unavailablePacks: { packageId: string; version: string; reason: string }[]
  boundPackCount: number
}

type LoadState = 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable' | 'error'

const worldId = computed(() => String(props.worldId))

const search = ref('')
const activeCategories = ref<string[]>([])
const activePackages = ref<string[]>([])
const imageFilter = ref<StudioImageFilter>('any')
const offset = ref(0)
const limit = ref(STUDIO_DEFAULT_LIMIT)

const state = ref<LoadState>('idle')
const errorMessage = ref('')
const result = ref<SearchResponse | null>(null)
const selected = ref<StudioResultRow | null>(null)
const filtersOpen = ref(false)

const rows = computed(() => result.value?.rows ?? [])
const total = computed(() => result.value?.total ?? 0)
const pageStart = computed(() => (total.value === 0 ? 0 : offset.value + 1))
const pageEnd = computed(() => Math.min(offset.value + limit.value, total.value))
const canPrevious = computed(() => offset.value > 0)
const canNext = computed(() => offset.value + limit.value < total.value)

const activeFilterCount = computed(
  () => activeCategories.value.length + activePackages.value.length + (imageFilter.value === 'any' ? 0 : 1)
)

let requestToken = 0

async function load() {
  const token = ++requestToken
  state.value = 'loading'
  errorMessage.value = ''

  const query = new URLSearchParams({
    worldId: worldId.value,
    limit: String(limit.value),
    offset: String(offset.value)
  })
  if (search.value.trim()) query.set('q', search.value.trim())
  if (activeCategories.value.length) query.set('category', activeCategories.value.join(','))
  if (activePackages.value.length) query.set('packageId', activePackages.value.join(','))
  if (imageFilter.value !== 'any') query.set('image', imageFilter.value)

  try {
    const response = await $fetch<SearchResponse>(`/api/content/studio/search?${query.toString()}`)
    // A slower earlier request must never overwrite a newer result.
    if (token !== requestToken) return
    result.value = response
    state.value = 'ready'
  } catch (error) {
    if (token !== requestToken) return
    // $fetch rejects with a FetchError carrying the status and the
    // handler's own `data` payload; neither is on the Error type.
    const failure = error as { statusCode?: number, statusMessage?: string, response?: { status?: number }, data?: { statusMessage?: string, message?: string } }
    const status = failure.statusCode ?? failure.response?.status
    const detail = failure.data?.statusMessage || failure.data?.message || failure.statusMessage

    if (status === 401 || status === 403) {
      state.value = 'denied'
      errorMessage.value = detail
        || 'You do not have permission to browse this World\'s content. Content Studio needs the platform content-workspace capability and access to this World.'
      return
    }
    if (status === 503) {
      state.value = 'unavailable'
      errorMessage.value = detail || 'Content Studio is not provisioned on this deployment yet.'
      return
    }

    state.value = 'error'
    errorMessage.value = detail || 'Content could not be loaded.'
  }
}

// Typing re-queries after a pause rather than on every keystroke.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    offset.value = 0
    load()
  }, 250)
})

watch([activeCategories, activePackages, imageFilter], () => {
  offset.value = 0
  load()
}, { deep: true })

watch([worldId, offset], load, { immediate: true })

function toggleIn(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key]
}

function toggleCategory(key: string) {
  activeCategories.value = toggleIn(activeCategories.value, key)
}

function togglePackage(key: string) {
  activePackages.value = toggleIn(activePackages.value, key)
}

function clearFilters() {
  activeCategories.value = []
  activePackages.value = []
  imageFilter.value = 'any'
  search.value = ''
}

function previousPage() {
  if (canPrevious.value) offset.value = Math.max(0, offset.value - limit.value)
}

function nextPage() {
  if (canNext.value) offset.value = offset.value + limit.value
}

function select(row: StudioResultRow) {
  selected.value = selected.value?.address === row.address ? null : row
}

function provenanceOf(row: StudioResultRow): string {
  return [row.sourceBook, row.sourcePage ? `p. ${row.sourcePage}` : null, row.packageId, row.packageVersion]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <section class="mt-6 grid gap-5">
    <header class="eldra-ornate-panel eldra-frame-corners rounded-none border border-eldra-accent/24 bg-eldra-panel p-5 backdrop-blur">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-[0.3em] text-eldra-text-faint">
            Content Studio
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-eldra-text-strong">
            Browse
          </h2>
          <p class="mt-2 max-w-2xl text-sm text-eldra-text-soft">
            Everything this World resolves from its bound Content Packs, in one searchable list.
            Read-only for now — editing arrives with the Studio editor.
          </p>
        </div>

        <label class="flex min-w-0 flex-col gap-1 xl:w-80">
          <span class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Search</span>
          <input
            v-model="search"
            type="search"
            placeholder="Title, slug, or source book"
            class="min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong placeholder:text-eldra-text-ghost focus:border-eldra-accent focus:outline-none focus:ring-1 focus:ring-eldra-accent"
          >
        </label>
      </div>

      <p
        v-if="result && result.unavailablePacks.length"
        class="mt-4 rounded-none border border-amber-300/25 bg-amber-400/10 p-3 text-sm text-amber-100"
      >
        {{ result.unavailablePacks.length }} bound Content Pack(s) could not be loaded and are missing from these
        results:
        <span class="font-mono text-xs">
          {{ result.unavailablePacks.map((pack) => `${pack.packageId}@${pack.version} (${pack.reason})`).join(', ') }}
        </span>
      </p>
    </header>

    <div class="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <!-- Filter rail: a column from lg, a collapsible panel below it. -->
      <div class="min-w-0">
        <button
          type="button"
          class="flex min-h-11 w-full items-center justify-between gap-2 rounded-none border border-eldra-accent/24 bg-eldra-panel px-3 text-sm text-eldra-text-strong lg:hidden"
          :aria-expanded="filtersOpen"
          aria-controls="studio-filters"
          @click="filtersOpen = !filtersOpen"
        >
          <span>Filters<span v-if="activeFilterCount"> ({{ activeFilterCount }})</span></span>
          <span aria-hidden="true">{{ filtersOpen ? '−' : '+' }}</span>
        </button>

        <div
          id="studio-filters"
          class="mt-2 lg:mt-0 lg:block"
          :class="filtersOpen ? 'block' : 'hidden'"
        >
          <div class="eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel p-4">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">
                Category
              </h3>
              <button
                v-if="activeFilterCount"
                type="button"
                class="min-h-8 rounded-none px-2 text-xs text-eldra-accent-text underline underline-offset-4 hover:text-eldra-text-strong"
                @click="clearFilters"
              >
                Clear
              </button>
            </div>

            <ul class="mt-3 grid gap-1">
              <li
                v-for="facet in result?.categoryFacets ?? []"
                :key="facet.key"
              >
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center justify-between gap-2 rounded-none border px-3 text-left text-sm transition"
                  :class="activeCategories.includes(facet.key)
                    ? 'border-eldra-accent bg-eldra-accent/15 text-eldra-text-strong'
                    : 'border-transparent text-eldra-text-soft hover:border-eldra-accent/24'"
                  :aria-pressed="activeCategories.includes(facet.key)"
                  @click="toggleCategory(facet.key)"
                >
                  <span class="min-w-0 truncate">{{ facet.label }}</span>
                  <span class="shrink-0 text-xs text-eldra-text-faint">{{ facet.count }}</span>
                </button>
              </li>
            </ul>

            <h3 class="mt-5 text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">
              Source package
            </h3>
            <ul class="mt-3 grid gap-1">
              <li
                v-for="facet in result?.packageFacets ?? []"
                :key="facet.key"
              >
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center justify-between gap-2 rounded-none border px-3 text-left text-sm transition"
                  :class="activePackages.includes(facet.key)
                    ? 'border-eldra-accent bg-eldra-accent/15 text-eldra-text-strong'
                    : 'border-transparent text-eldra-text-soft hover:border-eldra-accent/24'"
                  :aria-pressed="activePackages.includes(facet.key)"
                  @click="togglePackage(facet.key)"
                >
                  <span class="min-w-0 truncate font-mono text-xs">{{ facet.label }}</span>
                  <span class="shrink-0 text-xs text-eldra-text-faint">{{ facet.count }}</span>
                </button>
              </li>
            </ul>

            <h3 class="mt-5 text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">
              Artwork
            </h3>
            <label class="mt-2 flex min-h-11 items-center gap-2 text-sm text-eldra-text-soft">
              <span class="sr-only">Filter by artwork</span>
              <select
                v-model="imageFilter"
                class="min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-2 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
              >
                <option value="any">Any</option>
                <option value="with-image">Has artwork</option>
                <option value="without-image">Missing artwork</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <!-- Results -->
      <div class="min-w-0">
        <div
          v-if="state === 'loading'"
          class="eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel p-5 text-sm text-eldra-text-soft"
          role="status"
          aria-live="polite"
        >
          Loading content…
        </div>

        <div
          v-else-if="state === 'denied'"
          class="rounded-none border border-amber-300/25 bg-amber-400/10 p-5 text-sm text-amber-100"
          role="status"
        >
          {{ errorMessage }}
        </div>

        <div
          v-else-if="state === 'unavailable'"
          class="rounded-none border border-sky-300/25 bg-sky-400/10 p-5 text-sm text-sky-100"
          role="status"
        >
          <p class="font-semibold">Content Studio is not provisioned yet.</p>
          <p class="mt-2">{{ errorMessage }}</p>
        </div>

        <div
          v-else-if="state === 'error'"
          class="rounded-none border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200"
          role="alert"
        >
          <p>{{ errorMessage }}</p>
          <button
            type="button"
            class="mt-3 min-h-11 rounded-none border border-red-400/40 px-3 text-sm hover:bg-red-500/10"
            @click="load"
          >
            Try again
          </button>
        </div>

        <div
          v-else-if="!rows.length"
          class="eldra-ornate-panel rounded-none border border-dashed border-eldra-accent/24 bg-eldra-panel p-6 text-sm text-eldra-text-soft"
        >
          <p v-if="result && result.boundPackCount === 0">
            This World has no Content Packs bound yet, so there is nothing to browse. Bind one from the Content Packs
            section.
          </p>
          <p v-else-if="activeFilterCount || search">
            Nothing matches these filters.
            <button
              type="button"
              class="ml-1 underline underline-offset-4 hover:text-eldra-text-strong"
              @click="clearFilters"
            >
              Clear them
            </button>
          </p>
          <p v-else>
            This World's bound Content Packs publish no entries.
          </p>
        </div>

        <template v-else>
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-eldra-text-faint">
            <span aria-live="polite">Showing {{ pageStart }}–{{ pageEnd }} of {{ total }}</span>
            <span>{{ result?.boundPackCount ?? 0 }} bound pack(s)</span>
          </div>

          <ul class="mt-3 grid gap-2">
            <li
              v-for="row in rows"
              :key="row.address"
            >
              <article class="eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel transition hover:border-eldra-accent/60">
                <button
                  type="button"
                  class="flex w-full items-start gap-3 p-3 text-left"
                  :aria-expanded="selected?.address === row.address"
                  @click="select(row)"
                >
                  <img
                    v-if="row.imageUrl"
                    :src="row.imageUrl"
                    :alt="''"
                    loading="lazy"
                    class="h-14 w-14 shrink-0 rounded-none border border-eldra-accent/24 object-cover"
                  >
                  <span
                    v-else
                    aria-hidden="true"
                    class="flex h-14 w-14 shrink-0 items-center justify-center rounded-none border border-dashed border-eldra-accent/24 text-[10px] uppercase tracking-[0.14em] text-eldra-text-ghost"
                  >
                    No art
                  </span>

                  <span class="min-w-0 flex-1">
                    <span class="flex flex-wrap items-center gap-2">
                      <span class="min-w-0 break-words text-sm font-semibold text-eldra-text-strong">{{ row.title }}</span>
                      <span class="shrink-0 rounded-none border border-eldra-accent/24 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-eldra-text-faint">
                        {{ row.category }}
                      </span>
                      <span
                        v-if="row.contentEntityId"
                        class="shrink-0 rounded-none border border-emerald-400/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-200"
                        title="Carries a canonical content entity id"
                      >
                        Identified
                      </span>
                    </span>

                    <span class="mt-1 block break-words text-xs text-eldra-text-faint">{{ provenanceOf(row) }}</span>

                    <span
                      v-if="row.description"
                      class="mt-1 line-clamp-2 block break-words text-xs text-eldra-text-soft"
                    >{{ row.description }}</span>
                  </span>
                </button>

                <div
                  v-if="selected?.address === row.address"
                  class="border-t border-eldra-accent/24 p-3"
                >
                  <dl class="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                    <div class="min-w-0">
                      <dt class="inline text-eldra-text-faint">Address: </dt>
                      <dd class="inline break-all font-mono text-eldra-text-soft">{{ row.address }}</dd>
                    </div>
                    <div class="min-w-0">
                      <dt class="inline text-eldra-text-faint">Identity: </dt>
                      <dd class="inline break-all font-mono text-eldra-text-soft">
                        {{ row.contentEntityId ?? 'legacy entry — addressed by package and slug' }}
                      </dd>
                    </div>
                    <div class="min-w-0">
                      <dt class="inline text-eldra-text-faint">Provider: </dt>
                      <dd class="inline break-words text-eldra-text-soft">{{ row.provider || '—' }}</dd>
                    </div>
                    <div class="min-w-0">
                      <dt class="inline text-eldra-text-faint">Slug: </dt>
                      <dd class="inline break-all font-mono text-eldra-text-soft">{{ row.slug }}</dd>
                    </div>
                  </dl>

                  <div class="mt-3">
                    <ContentPresentationPanel
                      :entry="row.presentation"
                      context="detail"
                      empty-message="This Content Pack publishes no further details for this entry."
                    />
                  </div>
                </div>
              </article>
            </li>
          </ul>

          <nav
            class="mt-4 flex items-center justify-between gap-2"
            aria-label="Result pages"
          >
            <button
              type="button"
              class="min-h-11 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-soft disabled:opacity-40 enabled:hover:border-eldra-accent"
              :disabled="!canPrevious"
              @click="previousPage"
            >
              Previous
            </button>
            <button
              type="button"
              class="min-h-11 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-soft disabled:opacity-40 enabled:hover:border-eldra-accent"
              :disabled="!canNext"
              @click="nextPage"
            >
              Next
            </button>
          </nav>
        </template>
      </div>
    </div>
  </section>
</template>
