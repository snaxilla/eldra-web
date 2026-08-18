<script setup lang="ts">
// Content Pack Builder Preview -- see this task's own DESIGN GOAL:
// "Import -> Preview -> Curate -> Publish -> Bind. This task ends after
// Preview + Curate." Renders inside AdminContentPacksPanel.vue (the same
// Game Admin "Content Packs" tab the Binding UI already lives in), above
// the existing Published/Bound sections, so the page reads top-to-bottom
// in pipeline order.
//
// BEHAVIOR: calls GET /api/content-packs/preview/srd-5-1 exactly once per
// "Generate Preview" click. Publishes nothing, binds nothing -- there is
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
// one privileged action (GET /api/content-packs/preview/srd-5-1) is gated
// server-side on platform.contentpack.publish, and the parent
// (AdminContentPacksPanel.vue) already knows how to ask
// GET /api/worlds/:id for canBindPacks; that capability governs binding,
// not previewing/publishing (a Platform action, not a World one -- see
// server/api/content-packs/publish/srd-5-1.post.ts's own AUTHORIZATION
// note). A 403 from the preview endpoint surfaces through this
// component's ordinary error state like any other fetch failure.

type ImportSource = 'srd-5.1'

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
  | { available: true; source: ImportSource; categories: PreviewCategory[]; totalEntries: number; warnings: string[] }
  | { available: false; reason: string; message: string }

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

const selectedSource = ref<ImportSource>('srd-5.1')

const previewPending = ref(false)
const previewError = ref('')
const previewResult = ref<PreviewResult | null>(null)

const selection = ref<Record<CategoryKey, Set<string>>>(emptySelection())

async function generatePreview() {
  previewPending.value = true
  previewError.value = ''
  previewResult.value = null
  selection.value = emptySelection()

  try {
    const response = await $fetch<PreviewResult>('/api/content-packs/preview/srd-5-1')
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

    <div class="mt-5 flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Import Source</span>
        <select
          v-model="selectedSource"
          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
        >
          <option value="srd-5.1">
            5etools SRD 5.1
          </option>
        </select>
      </label>

      <button
        type="button"
        class="eldra-button rounded-none px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        :disabled="previewPending"
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

    <div
      v-if="previewPending"
      class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
    >
      Generating preview from the 5etools SRD 5.1 dataset...
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
        No entries were found for this Import Source.
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
    </template>
  </div>
</template>
