<script setup lang="ts">
// Content Pack Builder Preview -- see this task's own DESIGN GOAL:
// "Import -> Preview -> Curate -> Publish -> Bind. This task ends after
// Preview + Curate." Renders inside AdminContentPacksPanel.vue (the same
// Game Admin "Content Packs" tab the Binding UI already lives in), above
// the existing Published/Bound sections, so the page reads top-to-bottom
// in pipeline order.
//
// BEHAVIOR: calls the generic
// GET /api/content-sources/[gameSystemKey]/[collectionKey]/preview
// (derived from the two selected keys as of Step 4 of
// .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence -- see this file's own GAME SYSTEM / SOURCE
// COLLECTION note below) exactly once per "Generate Preview" click.
// Publishes nothing, binds nothing -- there is
// no Publish button here at all (this task's own NON-GOALS: "Do NOT
// implement Publishing"). Checkbox/Select All/Deselect All state lives
// entirely in this component; nothing is ever sent back to the server
// (this task's own CURATION section: "Nothing is saved yet"). Re-running
// "Generate Preview" discards the current selection and starts over --
// there is no draft to resume, matching the same "always a fresh
// server round-trip, never optimistic local state" discipline every other
// admin panel in this codebase already follows, generalized to "no save
// path exists yet to be optimistic about."
//
// DEFAULT SELECTION: every previewed entry starts checked. Curation here
// is an opt-OUT review ("here is everything SRD 5.1 has; uncheck what you
// do not want"), not an opt-in one -- the natural reading of "review
// exactly what will become a Content Pack" for a source that, by
// definition, only contains entries someone already decided belong in it.
//
// AUTHORIZATION: no capability check inside this component itself -- the
// two privileged actions (the generic preview route, the generic publish
// route) are gated server-side on platform.contentpack.publish, and the
// parent (AdminContentPacksPanel.vue) already knows how to ask
// GET /api/worlds/:id for canBindPacks; that capability governs binding,
// not previewing/publishing (a Platform action, not a World one). A 403
// from either endpoint surfaces through this component's ordinary error
// state like any other fetch failure.
//
// PUBLISH: as of Step 5 of
// .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence (§12), calls the generic
// POST /api/content-packs/publish with { gameSystemKey, collectionKey,
// packageId, version, selection } -- the two selected keys plus the
// CURRENT selection (this component's own `selection` state, converted to
// plain arrays) and the Package Name/Version fields below. This is the
// last place this component ever named a concrete publish route: it never
// posts to a source-specific URL, and it never re-fetches a preview first,
// so what gets published is always exactly what the GM is currently
// looking at. Publishing never binds -- there is no bind action here
// (world-content-pack-binding.ts's own separate flow,
// AdminContentPacksPanel.vue's existing Bind table, owns that).
//
// AFTER SUCCESS (this task's own AFTER SUCCESS section): the Preview,
// the selection, and the Package Name/Version fields are ALL cleared
// immediately -- the Builder returns to its pre-Preview state, ready to
// author another pack, rather than leaving a stale (now-published)
// selection on screen. The one thing that survives that reset is the
// success confirmation itself (`publishResult`, rendered near the top of
// the template independently of `previewResult` for exactly this reason)
// so the GM still sees what was published. This emits `published` so the
// parent panel can refresh its
// Published Content Packs list (the same "always re-fetch, never
// optimistic" convention every admin panel in this codebase already
// follows) -- that refresh is what makes the new pack "immediately appear
// below," not any local list-splicing here. A FAILED publish (including a
// duplicate-version 409) deliberately does NOT clear anything -- the GM's
// curated selection and identity fields stay exactly as they were so a
// rejected attempt (e.g. wrong Version) can simply be corrected and
// resubmitted without re-curating from scratch.
//
// GAME SYSTEM / SOURCE COLLECTION: both selectors are driven by
// app/lib/content-sources/registry.ts for identity/labels/ordering --
// this component names no game system and no book of its own, it iterates
// whatever the registry contains. Availability is fetched once from
// GET /api/content-sources (server-derived: a provider must be
// registered AND report its dataset reachable), never hand-set in the
// registry (Step 3). "Generate Preview" (Step 4) and "Publish" (Step 5)
// no longer name any concrete route either: `previewEndpointFor` below
// derives GET /api/content-sources/[gameSystemKey]/[collectionKey]/preview
// purely from the two selected keys, and `publish()` posts the same two
// keys as plain body fields to POST /api/content-packs/publish. This
// component never names SRD, 5etools, a provider, or a dataset path
// anywhere -- see those routes' own headers for how each resolves
// (gameSystemKey, collectionKey) into a provider server-side. Sources
// without a working preview render disabled with a "Coming Soon" badge,
// never omitted -- a GM should see the full shape of what Eldra will
// eventually support, not just what works today.

import {
  GAME_SYSTEM_REGISTRY,
  firstAvailableCollection,
  getGameSystem,
  type SourceCollectionDefinition
} from '~/lib/content-sources/registry'

// Purely derived from the two selected keys -- no source, provider, or
// dataset name is ever named here. See this file's header GAME SYSTEM /
// SOURCE COLLECTION note.
function previewEndpointFor(gameSystemKey: string, collectionKey: string): string {
  return `/api/content-sources/${encodeURIComponent(gameSystemKey)}/${encodeURIComponent(collectionKey)}/preview`
}

type ContentSourceAvailability =
  | { available: true }
  | { available: false; reason: string; message: string }

type ContentSourcesResponse = {
  systems: {
    key: string
    label: string
    collections: { key: string; label: string; availability: ContentSourceAvailability }[]
  }[]
}

type PreviewEntry = {
  externalId: string
  title: string
  sourceBook?: string
}

type CategoryKey = 'species' | 'classes' | 'backgrounds' | 'feats' | 'items' | 'spells'

type PreviewCategory = {
  key: CategoryKey
  label: string
  entries: PreviewEntry[]
}

type PreviewResult =
  | { available: true; source: string; categories: PreviewCategory[]; totalEntries: number; warnings: string[] }
  | { available: false; reason: string; message: string }

type PublishSuccess = {
  packageId: string
  version: string
  integrityHash: string
  counts: Record<CategoryKey, number>
}

const emit = defineEmits<{ published: [] }>()

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  species: 'Species',
  classes: 'Classes',
  backgrounds: 'Backgrounds',
  feats: 'Feats',
  items: 'Items',
  spells: 'Spells'
}

const CATEGORY_KEYS: CategoryKey[] = ['species', 'classes', 'backgrounds', 'feats', 'items', 'spells']

function emptySelection(): Record<CategoryKey, Set<string>> {
  return {
    species: new Set(),
    classes: new Set(),
    backgrounds: new Set(),
    feats: new Set(),
    items: new Set(),
    spells: new Set()
  }
}

const gameSystems = GAME_SYSTEM_REGISTRY

// ---------------------------------------------------------------------------
// Availability -- fetched once from GET /api/content-sources (Step 3),
// never read off the registry. See this file's header GAME SYSTEM /
// SOURCE COLLECTION note.
// ---------------------------------------------------------------------------

const availabilityBySystem = ref<Record<string, Record<string, boolean>>>({})
const availabilityLoaded = ref(false)
const availabilityError = ref('')

function isCollectionAvailable(gameSystemKey: string, collectionKey: string): boolean {
  return Boolean(availabilityBySystem.value[gameSystemKey]?.[collectionKey])
}

async function loadAvailability() {
  try {
    const response = await $fetch<ContentSourcesResponse>('/api/content-sources')
    const next: Record<string, Record<string, boolean>> = {}
    for (const system of response.systems) {
      const collectionAvailability: Record<string, boolean> = {}
      for (const collection of system.collections) {
        collectionAvailability[collection.key] = collection.availability.available
      }
      next[system.key] = collectionAvailability
    }
    availabilityBySystem.value = next
  } catch (error: any) {
    availabilityError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to load Content Source availability.'
  } finally {
    availabilityLoaded.value = true
  }
}

onMounted(loadAvailability)

const selectedGameSystemKey = ref<string>(gameSystems[0]?.key ?? '')
const selectedContentSourceKey = ref<string>(
  firstAvailableCollection(selectedGameSystemKey.value, (key) => isCollectionAvailable(selectedGameSystemKey.value, key))?.key ?? ''
)

const selectedGameSystem = computed(() => getGameSystem(selectedGameSystemKey.value))
const contentSourcesForSystem = computed(() => selectedGameSystem.value?.collections ?? [])
const selectedContentSource = computed<SourceCollectionDefinition | null>(
  () => contentSourcesForSystem.value.find((source) => source.key === selectedContentSourceKey.value) ?? null
)

// Switching Game System (or the initial mount) always lands on that
// system's first available Source Collection -- a disabled/"Coming Soon"
// source can never end up silently selected. Re-runs once availability
// finishes loading too (`availabilityLoaded`), since the initial pick
// above happens before the fetch resolves and everything reads as
// unavailable until then -- see the fallback-to-first-entry behavior
// `firstAvailableCollection` itself documents.
watch(
  selectedGameSystemKey,
  (key) => {
    selectedContentSourceKey.value = firstAvailableCollection(key, (collectionKey) => isCollectionAvailable(key, collectionKey))?.key ?? ''
  },
  { immediate: true }
)

watch(availabilityLoaded, (loaded) => {
  if (!loaded) return
  const key = selectedGameSystemKey.value
  selectedContentSourceKey.value = firstAvailableCollection(key, (collectionKey) => isCollectionAvailable(key, collectionKey))?.key ?? ''
})

function selectContentSource(source: SourceCollectionDefinition) {
  if (!isCollectionAvailable(selectedGameSystemKey.value, source.key)) return
  selectedContentSourceKey.value = source.key
}

const previewPending = ref(false)
const previewError = ref('')
const previewResult = ref<PreviewResult | null>(null)

const selection = ref<Record<CategoryKey, Set<string>>>(emptySelection())

async function generatePreview() {
  if (!selectedContentSource.value || !isCollectionAvailable(selectedGameSystemKey.value, selectedContentSource.value.key)) {
    return
  }

  const previewEndpoint = previewEndpointFor(selectedGameSystemKey.value, selectedContentSource.value.key)

  previewPending.value = true
  previewError.value = ''
  previewResult.value = null
  selection.value = emptySelection()
  // A fresh preview starts a fresh authoring cycle -- any confirmation or
  // error left over from a previous publish attempt no longer applies to
  // what's about to be shown.
  publishResult.value = null
  publishError.value = ''

  try {
    const response = await $fetch<PreviewResult>(previewEndpoint)
    previewResult.value = response

    if (response.available) {
      const next = emptySelection()
      for (const category of response.categories) {
        next[category.key] = new Set(category.entries.map((entry) => entry.externalId))
      }
      selection.value = next
    }
  } catch (error: any) {
    previewError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to generate a preview.'
  } finally {
    previewPending.value = false
  }
}

const canGeneratePreview = computed(
  () =>
    !previewPending.value &&
    !!selectedContentSource.value &&
    isCollectionAvailable(selectedGameSystemKey.value, selectedContentSource.value.key)
)

function categoryEntries(key: CategoryKey): PreviewEntry[] {
  if (!previewResult.value?.available) return []
  return previewResult.value.categories.find((category) => category.key === key)?.entries ?? []
}

function isSelected(key: CategoryKey, externalId: string) {
  return selection.value[key].has(externalId)
}

function toggleEntry(key: CategoryKey, externalId: string) {
  const next = new Set(selection.value[key])
  if (next.has(externalId)) {
    next.delete(externalId)
  } else {
    next.add(externalId)
  }
  selection.value = { ...selection.value, [key]: next }
}

function selectAll(key: CategoryKey) {
  selection.value = { ...selection.value, [key]: new Set(categoryEntries(key).map((entry) => entry.externalId)) }
}

function deselectAll(key: CategoryKey) {
  selection.value = { ...selection.value, [key]: new Set() }
}

function selectedCount(key: CategoryKey) {
  return selection.value[key].size
}

const totalSelected = computed(() => CATEGORY_KEYS.reduce((sum, key) => sum + selectedCount(key), 0))
const totalAvailable = computed(() => (previewResult.value?.available ? previewResult.value.totalEntries : 0))

// ---------------------------------------------------------------------------
// Publish -- the curated selection above becomes exactly what is published.
// ---------------------------------------------------------------------------

const packageName = ref('')
const packageVersion = ref('')

const publishPending = ref(false)
const publishError = ref('')
const publishResult = ref<PublishSuccess | null>(null)

// Mirrors (never replaces) the server's own validateContentPackForPublication
// checks -- purely so the button can't be clicked in a state guaranteed to
// fail; the server remains the sole source of truth for whether a publish
// is actually valid (this task's own instruction: "Do NOT invent a second
// validator").
const canPublish = computed(() =>
  !publishPending.value &&
  totalSelected.value > 0 &&
  packageName.value.trim() !== '' &&
  packageVersion.value.trim() !== ''
)

// Surfaced next to the Publish button so a disabled button always explains
// itself (this task's own VALIDATION section: "Display clear validation
// messages") -- purely descriptive of the same three conditions
// `canPublish` already checks, never a second source of truth for whether
// publishing is actually allowed.
const validationMessages = computed(() => {
  const messages: string[] = []
  if (totalSelected.value === 0) messages.push('Select at least one entry to publish.')
  if (!packageName.value.trim()) messages.push('Enter a Package Name.')
  if (!packageVersion.value.trim()) messages.push('Enter a Version.')
  return messages
})

async function publish() {
  if (!previewResult.value?.available || !selectedContentSource.value) return

  publishPending.value = true
  publishError.value = ''
  publishResult.value = null

  const selectionPayload: Record<CategoryKey, string[]> = {
    species: [],
    classes: [],
    backgrounds: [],
    feats: [],
    items: [],
    spells: []
  }
  for (const key of CATEGORY_KEYS) {
    selectionPayload[key] = Array.from(selection.value[key])
  }

  try {
    const response = await $fetch<PublishSuccess>('/api/content-packs/publish', {
      method: 'POST',
      body: {
        gameSystemKey: selectedGameSystemKey.value,
        collectionKey: selectedContentSource.value.key,
        packageId: packageName.value.trim(),
        version: packageVersion.value.trim(),
        selection: selectionPayload
      }
    })
    publishResult.value = response

    // AFTER SUCCESS: return the Builder to its pre-Preview state -- see
    // this file's header PUBLISH note. `publishResult` itself is the one
    // exception, rendered independently of `previewResult` so the
    // confirmation survives this reset.
    previewResult.value = null
    selection.value = emptySelection()
    packageName.value = ''
    packageVersion.value = ''

    emit('published')
  } catch (error: any) {
    publishError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to publish the Content Pack.'
  } finally {
    publishPending.value = false
  }
}
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Import Content Pack
        </div>
        <h2 class="mt-2 text-2xl font-semibold text-white">
          Preview &amp; Curate
        </h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
          Generate a preview of what a Content Pack would contain, then choose exactly which entries to keep. Nothing is saved or published from this screen.
        </p>
      </div>
    </div>

    <div
      v-if="publishResult"
      class="mt-5 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100"
    >
      Published <strong>{{ publishResult.packageId }}@{{ publishResult.version }}</strong> with {{ Object.values(publishResult.counts).reduce((a, b) => a + b, 0) }} entries. Integrity: {{ publishResult.integrityHash }}. It now appears in the Published Content Packs list below -- bind it to a World from there when you're ready.
    </div>

    <div
      v-if="availabilityError"
      class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
    >
      {{ availabilityError }} Content Source availability could not be checked -- all sources show as unavailable until this succeeds.
    </div>

    <div class="mt-5 flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Game System</span>
        <select
          v-model="selectedGameSystemKey"
          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
        >
          <option
            v-for="system in gameSystems"
            :key="system.key"
            :value="system.key"
          >
            {{ system.label }}
          </option>
        </select>
      </label>

      <button
        type="button"
        class="eldra-button rounded-none px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        :disabled="!canGeneratePreview"
        @click="generatePreview"
      >
        {{ previewPending ? 'Generating…' : 'Generate Preview' }}
      </button>

      <span
        v-if="previewResult?.available"
        class="text-xs uppercase tracking-[0.2em] text-[#9f9278]"
      >
        {{ totalSelected }} of {{ totalAvailable }} selected
      </span>
    </div>

    <div class="mt-3 flex flex-col gap-1">
      <span class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Content Source</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="source in contentSourcesForSystem"
          :key="source.key"
          type="button"
          class="flex items-center gap-2 rounded-none border px-3 py-2 text-sm transition"
          :class="source.key === selectedContentSourceKey
            ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
            : isCollectionAvailable(selectedGameSystemKey, source.key)
              ? 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'
              : 'cursor-not-allowed border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.4)] text-[#6b6250] opacity-60'"
          :disabled="!isCollectionAvailable(selectedGameSystemKey, source.key)"
          :aria-pressed="source.key === selectedContentSourceKey"
          @click="selectContentSource(source)"
        >
          {{ source.label }}
          <span
            v-if="!isCollectionAvailable(selectedGameSystemKey, source.key)"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.08)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9f9278]"
          >
            Coming Soon
          </span>
        </button>
      </div>
    </div>

    <div
      v-if="previewPending"
      class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
    >
      Generating preview from {{ selectedContentSource?.label || 'the selected Content Source' }}...
    </div>

    <div
      v-else-if="previewError"
      class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
    >
      {{ previewError }}
    </div>

    <div
      v-else-if="previewResult && !previewResult.available"
      class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
    >
      {{ previewResult.message }}
    </div>

    <template v-else-if="previewResult?.available">
      <div
        v-if="previewResult.warnings.length"
        class="mt-5 rounded-none border border-amber-500/20 bg-amber-500/10 p-4 text-xs leading-5 text-amber-200"
      >
        <div class="font-semibold uppercase tracking-[0.15em]">
          Warnings
        </div>
        <ul class="mt-1 list-disc pl-4">
          <li
            v-for="warning in previewResult.warnings"
            :key="warning"
          >
            {{ warning }}
          </li>
        </ul>
      </div>

      <div
        v-if="!previewResult.totalEntries"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
      >
        No entries were found for this Content Source.
      </div>

      <div
        v-else
        class="mt-5 grid gap-4 lg:grid-cols-2"
      >
        <section
          v-for="key in CATEGORY_KEYS"
          :key="key"
          class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-[#f5e7bd]">
              {{ previewResult.categories.find((c) => c.key === key)?.label }}
              <span class="ml-1 text-[#9f9278]">({{ selectedCount(key) }}/{{ categoryEntries(key).length }})</span>
            </h3>

            <div
              v-if="categoryEntries(key).length"
              class="flex gap-2 text-[10px] uppercase tracking-[0.15em]"
            >
              <button
                type="button"
                class="border border-[rgba(201,164,90,0.24)] px-2 py-1 text-[#d8ceb8] hover:text-[#fff7df]"
                @click="selectAll(key)"
              >
                Select All
              </button>
              <button
                type="button"
                class="border border-[rgba(201,164,90,0.24)] px-2 py-1 text-[#d8ceb8] hover:text-[#fff7df]"
                @click="deselectAll(key)"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div
            v-if="!categoryEntries(key).length"
            class="mt-3 text-xs text-[#9f9278]"
          >
            No entries in this category.
          </div>

          <ul
            v-else
            class="mt-3 max-h-72 overflow-y-auto pr-1"
          >
            <li
              v-for="entry in categoryEntries(key)"
              :key="entry.externalId"
              class="flex items-center gap-2 border-b border-[rgba(201,164,90,0.10)] py-1.5 last:border-b-0"
            >
              <input
                :id="`entry-${key}-${entry.externalId}`"
                type="checkbox"
                :checked="isSelected(key, entry.externalId)"
                class="h-4 w-4 shrink-0"
                @change="toggleEntry(key, entry.externalId)"
              >
              <label
                :for="`entry-${key}-${entry.externalId}`"
                class="min-w-0 flex-1 cursor-pointer text-sm text-[#fff7df]"
              >
                {{ entry.title }}
              </label>
              <span class="shrink-0 text-[10px] uppercase tracking-[0.1em] text-[#9f9278]">
                {{ entry.sourceBook || '—' }}
              </span>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-6 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(8,17,27,0.42)] p-4">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Publish
        </div>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
          Publishing creates a new Content Pack containing exactly the entries currently checked above. Unchecked entries are never included. Publishing does not bind this pack to any World.
        </p>

        <div class="mt-4 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Package Name</span>
            <input
              v-model="packageName"
              type="text"
              placeholder="e.g. eldra.content.srd-5.1-curated"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
            >
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Version</span>
            <input
              v-model="packageVersion"
              type="text"
              placeholder="e.g. 1.0.0"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
            >
          </label>
        </div>

        <div class="mt-4 max-w-xs text-sm">
          <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">
            Selected
          </div>
          <dl class="mt-2 space-y-1">
            <div
              v-for="key in CATEGORY_KEYS"
              :key="key"
              class="flex items-center justify-between gap-3"
            >
              <dt class="text-[#d8ceb8]">
                {{ CATEGORY_LABELS[key] }}
              </dt>
              <dd class="text-[#fff7df]">
                {{ selectedCount(key) }}
              </dd>
            </div>
          </dl>
          <div class="mt-2 flex items-center justify-between gap-3 border-t border-[rgba(201,164,90,0.24)] pt-2 font-semibold">
            <span class="text-[#9f9278]">Total Entries</span>
            <span class="text-[#fff7df]">{{ totalSelected }}</span>
          </div>
        </div>

        <button
          type="button"
          class="eldra-button mt-4 rounded-none px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          :disabled="!canPublish"
          @click="publish"
        >
          {{ publishPending ? 'Publishing…' : `Publish ${totalSelected} ${totalSelected === 1 ? 'Entry' : 'Entries'}` }}
        </button>

        <ul
          v-if="validationMessages.length"
          class="mt-2 list-disc pl-4 text-xs text-[#9f9278]"
        >
          <li
            v-for="message in validationMessages"
            :key="message"
          >
            {{ message }}
          </li>
        </ul>

        <div
          v-if="publishError"
          class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
        >
          {{ publishError }}
        </div>
      </div>
    </template>
  </div>
</template>
