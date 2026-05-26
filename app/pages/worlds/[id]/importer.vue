<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

type ImportType = 'monsters' | 'items' | 'spells' | 'species' | 'classes' | 'backgrounds' | 'feats'

const importType = ref<ImportType>('monsters')
const mode = ref<'create' | 'update' | 'upsert'>('upsert')

const payloadText = ref('')
const fluffMarkdownText = ref('')
const previewBusy = ref(false)
const saveBusy = ref(false)
const resultMessage = ref('')
const previewResult = ref<any>(null)
const saveResult = ref<any>(null)
const previewTab = ref<'preview' | 'raw'>('preview')

const sourceSelection = ref('all')
const sourceSearch = ref('')
const sourceSourcesBusy = ref(false)
const sourceResultsBusy = ref(false)
const sourceOptions = ref<Array<{ source: string }>>([])
const sourceResults = ref<any[]>([])
const sourceTotalCount = ref(0)
const selectedSourceKey = ref<string>('')

const endpointMap: Record<string, { preview: string; save: string }> = {
  monsters: {
    preview: '/api/import/preview/5etools/monsters',
    save: '/api/import/save/5etools/monsters'
  },
  items: {
    preview: '/api/import/preview/5etools/items',
    save: '/api/import/save/5etools/items'
  },
  spells: {
    preview: '/api/import/preview/5etools/spells',
    save: '/api/import/save/5etools/spells'
  },
  species: {
    preview: '/api/import/preview/5etools/species',
    save: '/api/import/save/5etools/species'
  },
  classes: {
    preview: '/api/import/preview/5etools/classes',
    save: '/api/import/save/5etools/classes'
  },
  backgrounds: {
    preview: '/api/import/preview/5etools/backgrounds',
    save: '/api/import/save/5etools/backgrounds'
  },
    feats: {
      preview: '/api/import/preview/5etools/feats',
      save: '/api/import/save/5etools/feats'
    }
}

const sourceRouteMap: Record<ImportType, { sources: string; search: string }> = {
  monsters: {
    sources: '/api/import/source/monster-sources',
    search: '/api/import/source/monsters'
  },
  spells: {
    sources: '/api/import/source/spell-sources',
    search: '/api/import/source/spells'
  },
  items: {
    sources: '/api/import/source/item-sources',
    search: '/api/import/source/items'
  },
  species: {
    sources: '/api/import/source/species-sources',
    search: '/api/import/source/species'
  },
  classes: {
    sources: '/api/import/source/class-sources',
    search: '/api/import/source/classes'
  },
  backgrounds: {
    sources: '/api/import/source/background-sources',
    search: '/api/import/source/backgrounds'
  },
    feats: {
      sources: '/api/import/source/feat-sources',
      search: '/api/import/source/feats'
    }
}

const previewMonsterItem = computed(() => {
  if (!previewResult.value?.items?.length) return null
  return previewResult.value.items[0]
})

function buildManualPayload() {
  const payload = JSON.parse(payloadText.value)

  if (importType.value === 'monsters' && fluffMarkdownText.value.trim()) {
    if (Array.isArray(payload?.monster)) {
      payload.monster = payload.monster.map((monster: any) => ({
        ...monster,
        fluffMarkdown: fluffMarkdownText.value
      }))
    } else if (payload && typeof payload === 'object') {
      payload.fluffMarkdown = fluffMarkdownText.value
    }
  }

  return payload
}

function sourceItemKey(item: any) {
  return `${String(item?.name || '').toLowerCase()}::${String(item?.source || '').toLowerCase()}`
}

function selectedSourceItem() {
  return sourceResults.value.find((item: any) => sourceItemKey(item) === selectedSourceKey.value) || null
}

const selectedSourceLabel = computed(() => {
  const item = selectedSourceItem()
  if (!item) return ''
  return `${String(item?.name || '')}${item?.source ? ` (${String(item.source).toUpperCase()})` : ''}`
})

function buildPayloadForType(type: ImportType, itemOrItems: any | any[]) {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems]

  if (type === 'monsters') {
    const monster = items.map((item: any) => item?.monster).filter(Boolean)
    const monsterFluff = items.map((item: any) => item?.fluff).filter(Boolean)
    return { monster, monsterFluff }
  }

  const payload: Record<string, any[]> = {}

  for (const item of items) {
    const kind = String(item?.kind || '').trim()
    const raw = item?.raw
    if (!kind || !raw) continue
    if (!payload[kind]) payload[kind] = []
    payload[kind].push(raw)
  }

  return payload
}

async function loadSources() {
  sourceSourcesBusy.value = true

  try {
    const routes = sourceRouteMap[importType.value]
    const res = await $fetch<{ ok: boolean; sources: any[] }>(routes.sources)
    sourceOptions.value = Array.isArray(res?.sources) ? res.sources : []

    if (!sourceSelection.value) {
      sourceSelection.value = 'all'
    }
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load sources.'
  } finally {
    sourceSourcesBusy.value = false
  }
}

async function searchSource() {
  if (!sourceSelection.value) {
    sourceResults.value = []
    sourceTotalCount.value = 0
    selectedSourceKey.value = ''
    return
  }

  sourceResultsBusy.value = true

  try {
    const routes = sourceRouteMap[importType.value]
    const params = new URLSearchParams()
    params.set('source', sourceSelection.value)
    if (sourceSearch.value.trim()) params.set('q', sourceSearch.value.trim())
    params.set('limit', '50')

    const res = await $fetch<any>(`${routes.search}?${params.toString()}`)
    sourceResults.value = Array.isArray(res?.items) ? res.items : []

    if (sourceResults.value.length) {
      const existing = sourceResults.value.some((item: any) => sourceItemKey(item) === selectedSourceKey.value)
      if (!existing) {
        selectedSourceKey.value = sourceItemKey(sourceResults.value[0])
      }
    } else {
      selectedSourceKey.value = ''
    }
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to search source.'
  } finally {
    sourceResultsBusy.value = false
  }
}

async function previewSelectedSourceItem() {
  resultMessage.value = ''
  previewResult.value = null

  const item = selectedSourceItem()
  if (!item) {
    resultMessage.value = 'Select an entry first.'
    return
  }

  previewBusy.value = true

  try {
    const payload = buildPayloadForType(importType.value, item)
    const endpoint = endpointMap[importType.value].preview

    previewResult.value = await $fetch(endpoint, {
      method: 'POST',
      body: { payload }
    })

    previewTab.value = 'preview'
    resultMessage.value = 'Preview loaded.'
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Preview failed.'
  } finally {
    previewBusy.value = false
  }
}

async function importSelectedSourceItem() {
  resultMessage.value = ''
  saveResult.value = null

  const item = selectedSourceItem()
  if (!item) {
    resultMessage.value = 'Select an entry first.'
    return
  }

  saveBusy.value = true

  try {
    const payload = buildPayloadForType(importType.value, item)
    const endpoint = endpointMap[importType.value].save

    saveResult.value = await $fetch(endpoint, {
      method: 'POST',
      body: {
        worldId: Number(worldId.value),
        mode: mode.value,
        payload
      }
    })

    resultMessage.value = 'Import completed.'
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Import failed.'
  } finally {
    saveBusy.value = false
  }
}

async function importSelectedSourceBulk() {
  resultMessage.value = ''
  saveResult.value = null

  if (!sourceSelection.value || sourceSelection.value === 'all') {
    resultMessage.value = 'Choose a specific source first.'
    return
  }

  saveBusy.value = true

  try {
    const routes = sourceRouteMap[importType.value]
    const params = new URLSearchParams()
    params.set('source', sourceSelection.value)

    const res = await $fetch<any>(`${routes.search}?${params.toString()}`)
    const items = Array.isArray(res?.items) ? res.items : []

    if (!items.length) {
      resultMessage.value = 'No entries found in that source.'
      return
    }

    const payload = buildPayloadForType(importType.value, items)
    const endpoint = endpointMap[importType.value].save

    saveResult.value = await $fetch(endpoint, {
      method: 'POST',
      body: {
        worldId: Number(worldId.value),
        mode: mode.value,
        payload
      }
    })

    resultMessage.value = `Imported source ${sourceSelection.value} (${items.length} entries).`
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Bulk import failed.'
  } finally {
    saveBusy.value = false
  }
}

async function runPreview() {
  resultMessage.value = ''
  previewResult.value = null

  if (!payloadText.value.trim()) {
    resultMessage.value = 'Paste some 5etools JSON first.'
    return
  }

  previewBusy.value = true

  try {
    const payload = buildManualPayload()
    const endpoint = endpointMap[importType.value].preview

    previewResult.value = await $fetch(endpoint, {
      method: 'POST',
      body: { payload }
    })

    previewTab.value = 'preview'
    resultMessage.value = 'Preview loaded.'
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Preview failed.'
  } finally {
    previewBusy.value = false
  }
}

async function runSave() {
  resultMessage.value = ''
  saveResult.value = null

  if (!payloadText.value.trim()) {
    resultMessage.value = 'Paste some 5etools JSON first.'
    return
  }

  saveBusy.value = true

  try {
    const payload = buildManualPayload()
    const endpoint = endpointMap[importType.value].save

    saveResult.value = await $fetch(endpoint, {
      method: 'POST',
      body: {
        worldId: Number(worldId.value),
        mode: mode.value,
        payload
      }
    })

    resultMessage.value = 'Import completed.'
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Import failed.'
  } finally {
    saveBusy.value = false
  }
}

watch(importType, async () => {
  sourceSelection.value = 'all'
  sourceSearch.value = ''
  sourceOptions.value = []
  sourceResults.value = []
  selectedSourceKey.value = ''
  previewResult.value = null
  saveResult.value = null
  previewTab.value = 'preview'

  await loadSources()
  await searchSource()
})

watch(sourceSelection, async () => {
  await searchSource()
})

watch(sourceSearch, async () => {
  await searchSource()
})

onMounted(async () => {
  await loadSources()
  await searchSource()
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1800px] p-6">
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div class="space-y-6">
          <section class="rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(26,30,38,0.40),rgba(12,16,22,0.28))] p-6 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
            <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Importer</div>
                <h1 class="mt-2 text-3xl font-semibold text-white">World Importer</h1>
                <p class="mt-2 max-w-3xl text-sm text-slate-300">
                  Import structured 5etools content directly into this world.
                </p>
              </div>

              <div class="text-sm text-slate-400">
                World ID: <span class="font-medium text-slate-200">{{ worldId }}</span>
              </div>
            </div>

            <div class="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <div>
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Import Type</label>
                <select
                  v-model="importType"
                  class="w-full rounded-xl border border-white/10 bg-[#11161d] px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="monsters">Monsters / Enemies</option>
                  <option value="items">Items</option>
                  <option value="spells">Spells</option>
                  <option value="species">Species</option>
                  <option value="classes">Classes</option>
                  <option value="backgrounds">Backgrounds</option>
                    <option value="feats">Feats</option>
                </select>
              </div>

              <div>
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Save Mode</label>
                <select
                  v-model="mode"
                  class="w-full rounded-xl border border-white/10 bg-[#11161d] px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="create">Create Only</option>
                  <option value="update">Update Only</option>
                  <option value="upsert">Upsert</option>
                </select>
              </div>

              <div>
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Source</label>
                <select
                  v-model="sourceSelection"
                  class="w-full rounded-xl border border-white/10 bg-[#11161d] px-4 py-3 text-sm text-white outline-none"
                  :disabled="sourceSourcesBusy"
                >
                  <option value="all">ALL SOURCES</option>
                  <option v-for="src in sourceOptions" :key="src.source" :value="src.source">
                    {{ src.source.toUpperCase() }}
                  </option>
                </select>
              </div>
            </div>

            <div class="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Search Source</label>
                <input
                  v-model="sourceSearch"
                  type="text"
                  placeholder="Search entries..."
                  class="w-full rounded-xl border border-white/10 bg-[#07101a]/90 px-4 py-3 text-sm text-white outline-none"
                >

                <div class="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Results <span class="text-slate-400">({{ sourceResults.length }}<span v-if="sourceTotalCount > sourceResults.length"> / {{ sourceTotalCount }}</span>)</span>
                </div>

                <div class="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
                  <button
                    v-for="item in sourceResults"
                    :key="sourceItemKey(item)"
                    type="button"
                    class="w-full rounded-xl border px-4 py-3 text-left transition"
                    :class="selectedSourceKey === sourceItemKey(item)
                      ? 'border-sky-400/30 bg-sky-400/12 text-sky-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]'"
                    @click="selectedSourceKey = sourceItemKey(item)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="truncate font-medium">{{ item.name }}</div>
                        <div class="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {{ item.source }}
                          <span v-if="item.level !== undefined && item.level !== null"> • Lvl {{ item.level }}</span>
                          <span v-else-if="item.rarity"> • {{ item.rarity }}</span>
                          <span v-else-if="item.hitDie"> • d{{ item.hitDie }}</span>
                          <span v-else-if="item.school"> • {{ item.school }}</span>
                          <span v-else-if="item.itemType"> • {{ item.itemType }}</span>
                        </div>
                      </div>
                      <div
                        class="shrink-0 rounded-full border px-2 py-1 text-[10px] border-white/10 bg-white/[0.04] text-slate-400"
                      >
                        {{ item.kind }}
                      </div>
                    </div>
                  </button>

                  <div
                    v-if="sourceResultsBusy"
                    class="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300"
                  >
                    Loading source results...
                  </div>

                  <div
                    v-else-if="!sourceResults.length"
                    class="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300"
                  >
                    No entries found.
                  </div>
                </div>
              </div>

              <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div class="text-xs uppercase tracking-[0.25em] text-slate-500">Selected Entry</div>

                <template v-if="selectedSourceItem()">
                  <div class="mt-3 text-2xl font-semibold text-white">
                    {{ selectedSourceLabel }}
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span>{{ importType }}</span>
                    <span v-if="selectedSourceItem()?.source">• {{ selectedSourceItem()?.source }}</span>
                    <span v-if="selectedSourceItem()?.kind">• {{ selectedSourceItem()?.kind }}</span>
                  </div>

                  <pre class="mt-5 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-[#07101a]/90 p-4 text-xs text-slate-200">{{ JSON.stringify(selectedSourceItem(), null, 2) }}</pre>

                  <div class="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      class="rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:opacity-50"
                      :disabled="previewBusy"
                      @click="previewSelectedSourceItem"
                    >
                      {{ previewBusy ? 'Previewing…' : 'Preview Selected' }}
                    </button>

                    <button
                      type="button"
                      class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-50"
                      :disabled="saveBusy"
                      @click="importSelectedSourceItem"
                    >
                      {{ saveBusy ? 'Importing…' : 'Import Selected' }}
                    </button>

                    <button
                      type="button"
                      class="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-50"
                      :disabled="saveBusy || !sourceSelection || sourceSelection === 'all'"
                      @click="importSelectedSourceBulk"
                    >
                      {{ saveBusy ? 'Importing Source…' : `Import Source (${sourceSelection?.toUpperCase() || '—'})` }}
                    </button>
                  </div>
                </template>

                <div
                  v-else
                  class="mt-4 rounded-xl border border-white/10 bg-[#07101a]/90 p-4 text-sm text-slate-300"
                >
                  Select an entry to preview or import.
                </div>
              </div>
            </div>

            <div class="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div class="text-xs uppercase tracking-[0.25em] text-slate-500">Advanced / Manual Import</div>

              <div class="mt-5 grid gap-6" :class="importType === 'monsters' ? 'xl:grid-cols-2' : 'grid-cols-1'">
                <div>
                  <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">5etools JSON Payload</label>
                  <textarea
                    v-model="payloadText"
                    rows="20"
                    placeholder="Paste raw 5etools JSON here..."
                    class="min-h-[360px] w-full rounded-2xl border border-white/10 bg-[#07101a]/90 px-4 py-4 font-mono text-sm text-slate-100 outline-none transition focus:border-sky-400/30"
                  />
                </div>

                <div v-if="importType === 'monsters'">
                  <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Monster Fluff Markdown (Optional)</label>
                  <textarea
                    v-model="fluffMarkdownText"
                    rows="20"
                    placeholder="Paste monster lore/fluff markdown here..."
                    class="min-h-[360px] w-full rounded-2xl border border-white/10 bg-[#07101a]/90 px-4 py-4 font-mono text-sm text-slate-100 outline-none transition focus:border-sky-400/30"
                  />
                </div>
              </div>

              <div class="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  class="rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:opacity-50"
                  :disabled="previewBusy"
                  @click="runPreview"
                >
                  {{ previewBusy ? 'Previewing…' : 'Preview Manual Import' }}
                </button>

                <button
                  type="button"
                  class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-50"
                  :disabled="saveBusy"
                  @click="runSave"
                >
                  {{ saveBusy ? 'Importing…' : 'Run Manual Import' }}
                </button>
              </div>
            </div>

            <div
              v-if="resultMessage"
              class="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200"
            >
              {{ resultMessage }}
            </div>
          </section>
        </div>

        <aside class="space-y-6">
          <section class="eldra-panel rounded-[24px] p-5 shadow-xl">
            <div class="flex items-center justify-between gap-3">
              <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Preview Result</div>

              <div class="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-medium transition"
                  :class="previewTab === 'preview' ? 'bg-sky-400/20 text-sky-100' : 'text-slate-400 hover:text-slate-200'"
                  @click="previewTab = 'preview'"
                >
                  Preview
                </button>
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-medium transition"
                  :class="previewTab === 'raw' ? 'bg-sky-400/20 text-sky-100' : 'text-slate-400 hover:text-slate-200'"
                  @click="previewTab = 'raw'"
                >
                  Raw JSON
                </button>
              </div>
            </div>

            <div
              v-if="previewResult && previewTab === 'preview'"
              class="mt-4"
            >
              <ImporterMonsterPreviewPanel
                v-if="importType === 'monsters' && previewMonsterItem"
                :item="previewMonsterItem"
              />

              <pre
                v-else
                class="max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-[#07101a]/90 p-4 text-xs text-slate-200"
              >{{ JSON.stringify(previewResult, null, 2) }}</pre>
            </div>

            <pre
              v-else-if="previewResult && previewTab === 'raw'"
              class="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-[#07101a]/90 p-4 text-xs text-slate-200"
            >{{ JSON.stringify(previewResult, null, 2) }}</pre>

            <div
              v-else
              class="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300"
            >
              No preview loaded yet.
            </div>
          </section>

          <section class="rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(26,30,38,0.40),rgba(12,16,22,0.28))] p-5 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
            <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Save Result</div>

            <pre
              v-if="saveResult"
              class="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-[#07101a]/90 p-4 text-xs text-slate-200"
            >{{ JSON.stringify(saveResult, null, 2) }}</pre>

            <div
              v-else
              class="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300"
            >
              No import run yet.
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(select) {
  color-scheme: dark;
}

:deep(select option) {
  background-color: #11161d;
  color: #f1f5f9;
}
</style>
