<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

const importType = ref<'monsters' | 'items' | 'spells' | 'species' | 'classes' | 'backgrounds'>('monsters')
const mode = ref<'create' | 'update' | 'upsert'>('upsert')

const payloadText = ref('')
const fluffMarkdownText = ref('')
const previewBusy = ref(false)
const saveBusy = ref(false)
const resultMessage = ref('')
const previewResult = ref<any>(null)
const saveResult = ref<any>(null)

const monsterSource = ref('')
const monsterSearch = ref('')
const monsterSourcesBusy = ref(false)
const monsterResultsBusy = ref(false)
const monsterSources = ref<Array<{ source: string; file: string; fluffFile: string; hasFluff: boolean }>>([])
const monsterResults = ref<any[]>([])
const selectedMonsterKey = ref<string>('')

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
  }
}

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

function selectedMonsterItem() {
  return monsterResults.value.find((item: any) => monsterItemKey(item) === selectedMonsterKey.value) || null
}

function monsterItemKey(item: any) {
  return `${String(item?.name || '').toLowerCase()}::${String(item?.source || '').toLowerCase()}`
}

function buildMonsterPayload(itemOrItems: any | any[]) {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems]

  const monster = items
    .map((item: any) => item?.monster)
    .filter(Boolean)

  const monsterFluff = items
    .map((item: any) => item?.fluff)
    .filter(Boolean)

  return {
    monster,
    monsterFluff
  }
}

async function loadMonsterSources() {
  if (importType.value !== 'monsters') return

  monsterSourcesBusy.value = true

  try {
    const res = await $fetch<{ ok: boolean; sources: any[] }>('/api/import/source/monster-sources')
    monsterSources.value = Array.isArray(res?.sources) ? res.sources : []

    if (!monsterSource.value && monsterSources.value.length) {
      monsterSource.value = monsterSources.value[0].source
    }
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load monster sources.'
  } finally {
    monsterSourcesBusy.value = false
  }
}

async function searchMonsterSource() {
  if (importType.value !== 'monsters' || !monsterSource.value) {
    monsterResults.value = []
    selectedMonsterKey.value = ''
    return
  }

  monsterResultsBusy.value = true

  try {
    const params = new URLSearchParams()
    params.set('source', monsterSource.value)
    if (monsterSearch.value.trim()) params.set('q', monsterSearch.value.trim())
    params.set('limit', '50')

    const res = await $fetch<any>(`/api/import/source/monsters?${params.toString()}`)
    monsterResults.value = Array.isArray(res?.items) ? res.items : []

    if (monsterResults.value.length) {
      const existing = monsterResults.value.some((item: any) => monsterItemKey(item) === selectedMonsterKey.value)
      if (!existing) {
        selectedMonsterKey.value = monsterItemKey(monsterResults.value[0])
      }
    } else {
      selectedMonsterKey.value = ''
    }
  } catch (error: any) {
    resultMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to search monster source.'
  } finally {
    monsterResultsBusy.value = false
  }
}

async function previewSelectedMonster() {
  resultMessage.value = ''
  previewResult.value = null

  const item = selectedMonsterItem()
  if (!item) {
    resultMessage.value = 'Select a monster first.'
    return
  }

  previewBusy.value = true

  try {
    const payload = buildMonsterPayload(item)

    previewResult.value = await $fetch(endpointMap.monsters.preview, {
      method: 'POST',
      body: { payload }
    })

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

async function importSelectedMonster() {
  resultMessage.value = ''
  saveResult.value = null

  const item = selectedMonsterItem()
  if (!item) {
    resultMessage.value = 'Select a monster first.'
    return
  }

  saveBusy.value = true

  try {
    const payload = buildMonsterPayload(item)

    saveResult.value = await $fetch(endpointMap.monsters.save, {
      method: 'POST',
      body: {
        worldId: Number(worldId.value),
        mode: mode.value,
        payload
      }
    })

    resultMessage.value = 'Monster imported.'
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

async function importMonsterSource() {
  resultMessage.value = ''
  saveResult.value = null

  if (!monsterSource.value) {
    resultMessage.value = 'Choose a source first.'
    return
  }

  saveBusy.value = true

  try {
    const params = new URLSearchParams()
    params.set('source', monsterSource.value)

    const res = await $fetch<any>(`/api/import/source/monsters?${params.toString()}`)
    const items = Array.isArray(res?.items) ? res.items : []

    if (!items.length) {
      resultMessage.value = 'No monsters found in that source.'
      return
    }

    const payload = buildMonsterPayload(items)

    saveResult.value = await $fetch(endpointMap.monsters.save, {
      method: 'POST',
      body: {
        worldId: Number(worldId.value),
        mode: mode.value,
        payload
      }
    })

    resultMessage.value = `Imported source ${monsterSource.value}.`
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

watch(importType, async (value) => {
  if (value === 'monsters') {
    await loadMonsterSources()
    await searchMonsterSource()
  }
})

watch(monsterSource, async () => {
  if (importType.value === 'monsters') {
    await searchMonsterSource()
  }
})

watch(monsterSearch, async () => {
  if (importType.value === 'monsters') {
    await searchMonsterSource()
  }
})

onMounted(async () => {
  if (importType.value === 'monsters') {
    await loadMonsterSources()
    await searchMonsterSource()
  }
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

              <div v-if="importType === 'monsters'">
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Source</label>
                <select
                  v-model="monsterSource"
                  class="w-full rounded-xl border border-white/10 bg-[#11161d] px-4 py-3 text-sm text-white outline-none"
                  :disabled="monsterSourcesBusy"
                >
                  <option value="" disabled>Select a source</option>
                  <option v-for="src in monsterSources" :key="src.source" :value="src.source">
                    {{ src.source.toUpperCase() }}{{ src.hasFluff ? ' • fluff' : '' }}
                  </option>
                </select>
              </div>
            </div>

            <div v-if="importType === 'monsters'" class="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Search Source</label>
                <input
                  v-model="monsterSearch"
                  type="text"
                  placeholder="Search monsters..."
                  class="w-full rounded-xl border border-white/10 bg-[#07101a]/90 px-4 py-3 text-sm text-white outline-none"
                >

                <div class="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Results <span class="text-slate-400">({{ monsterResults.length }})</span>
                </div>

                <div class="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
                  <button
                    v-for="item in monsterResults"
                    :key="monsterItemKey(item)"
                    type="button"
                    class="w-full rounded-xl border px-4 py-3 text-left transition"
                    :class="selectedMonsterKey === monsterItemKey(item)
                      ? 'border-sky-400/30 bg-sky-400/12 text-sky-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]'"
                    @click="selectedMonsterKey = monsterItemKey(item)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="truncate font-medium">{{ item.name }}</div>
                        <div class="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {{ item.source }} <span v-if="item.cr">• CR {{ item.cr }}</span>
                        </div>
                      </div>
                      <div
                        class="shrink-0 rounded-full border px-2 py-1 text-[10px]"
                        :class="item.hasFluff ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.04] text-slate-400'"
                      >
                        {{ item.hasFluff ? 'Fluff' : 'Base' }}
                      </div>
                    </div>
                  </button>

                  <div
                    v-if="monsterResultsBusy"
                    class="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300"
                  >
                    Loading source results...
                  </div>

                  <div
                    v-if="!selectedMonsterItem()"-if="!monsterResults.length"
                    class="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300"
                  >
                    No monsters found.
                  </div>
                </div>
              </div>

              <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div class="text-xs uppercase tracking-[0.25em] text-slate-500">Selected Monster</div>

                <template v-if="selectedMonsterItem()">
                  <div class="mt-3 text-2xl font-semibold text-white">
                    {{ selectedMonsterItem()?.name }}
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span>{{ selectedMonsterItem()?.source }}</span>
                    <span v-if="selectedMonsterItem()?.cr">• CR {{ selectedMonsterItem()?.cr }}</span>
                    <span v-if="selectedMonsterItem()?.hasFluff">• Fluff</span>
                  </div>

                  <pre class="mt-5 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-[#07101a]/90 p-4 text-xs text-slate-200">{{ JSON.stringify(selectedMonsterItem(), null, 2) }}</pre>

                  <div class="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      class="rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:opacity-50"
                      :disabled="previewBusy"
                      @click="previewSelectedMonster"
                    >
                      {{ previewBusy ? 'Previewing…' : 'Preview Selected' }}
                    </button>

                    <button
                      type="button"
                      class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-50"
                      :disabled="saveBusy"
                      @click="importSelectedMonster"
                    >
                      {{ saveBusy ? 'Importing…' : 'Import Selected' }}
                    </button>

                    <button
                      type="button"
                      class="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-50"
                      :disabled="saveBusy || !monsterSource"
                      @click="importMonsterSource"
                    >
                      {{ saveBusy ? 'Importing Source…' : `Import Source (${monsterSource?.toUpperCase() || '—'})` }}
                    </button>
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


                <div
                  v-if="!selectedMonsterItem()"
                  class="mt-4 rounded-xl border border-white/10 bg-[#07101a]/90 p-4 text-sm text-slate-300"
                >
                  Select a monster to preview or import.
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
          <section class="rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(26,30,38,0.40),rgba(12,16,22,0.28))] p-5 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
            <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Preview Result</div>

            <pre
              v-if="previewResult"
              class="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-[#07101a]/90 p-4 text-xs text-slate-200"
            >{{ JSON.stringify(previewResult, null, 2) }}</pre>

            <div
              v-if="!selectedMonsterItem()"
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
              v-if="!selectedMonsterItem()"
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

