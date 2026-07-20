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

const sourceLabelsBusy = ref(false)
const sourceLabels = ref<Record<string, string>>({})

function sourceCodeLabel(value: any) {
  return String(value || '').trim().toUpperCase()
}

function sourceFullName(value: any) {
  const code = sourceCodeLabel(value)
  return sourceLabels.value[code] || ''
}

function sourceDisplayLabel(value: any) {
  const code = sourceCodeLabel(value)
  if (!code) return ''

  if (code === 'ALL') return 'ALL SOURCES'

  const fullName = sourceFullName(code)
  return fullName ? `${code} - ${fullName}` : code
}

function sourceShortLabel(value: any) {
  const code = sourceCodeLabel(value)
  return code || '-'
}

const sourceGuideOptions = computed(() =>
  (Array.isArray(sourceOptions.value) ? sourceOptions.value : [])
    .map((option: any) => ({
      ...option,
      source: String(option?.source || '').trim()
    }))
    .filter((option: any) => option.source)
    .sort((a: any, b: any) => sourceDisplayLabel(a.source).localeCompare(sourceDisplayLabel(b.source)))
)

const selectedSourceDisplay = computed(() =>
  sourceSelection.value === 'all'
    ? 'ALL SOURCES'
    : sourceDisplayLabel(sourceSelection.value)
)

async function loadSourceLabels(force = false) {
  sourceLabelsBusy.value = true

  try {
    const res: any = await $fetch('/api/import/source/labels', {
      query: force ? { _t: Date.now(), refresh: 1 } : {}
    })

    sourceLabels.value = res?.labels && typeof res.labels === 'object'
      ? res.labels
      : {}
  } catch {
    sourceLabels.value = {}
  } finally {
    sourceLabelsBusy.value = false
  }
}

async function refreshSourcePickerAfterDatasetUpdate() {
  await loadSourceLabels(true)

  sourceOptions.value = []
  sourceResults.value = []
  sourceTotalCount.value = 0
  selectedSourceKey.value = ''

  await loadSourceOptions()

  if (sourceSelection.value !== 'all') {
    const selectedStillExists = sourceOptions.value.some((option: any) =>
      String(option?.source || '').toLowerCase() === String(sourceSelection.value || '').toLowerCase()
    )

    if (!selectedStillExists) {
      sourceSelection.value = 'all'
    }
  }

  await searchSourceResults()
}




type DatasetUpdateTarget = 'src' | 'img' | 'both'

const datasetTargetOptions: Array<{ key: DatasetUpdateTarget; label: string; description: string }> = [
  {
    key: 'src',
    label: 'Update Data',
    description: 'Pull latest 5e.tools JSON/source data.'
  },
  {
    key: 'img',
    label: 'Update Images',
    description: 'Pull latest local 5e.tools image mirror.'
  },
  {
    key: 'both',
    label: 'Update Both',
    description: 'Pull data first, then images.'
  }
]

const datasetStatusBusy = ref(false)
const datasetUpdateBusy = ref(false)
const datasetUpdateTarget = ref<DatasetUpdateTarget | ''>('')
const datasetStatus = ref<any>(null)
const datasetUpdateResult = ref<any>(null)
const datasetMessage = ref('')
const datasetError = ref('')

const datasetToken = ref('')
const datasetTokenRemember = ref(true)
const datasetTokenLoaded = ref(false)

const datasetRows = computed(() =>
  Array.isArray(datasetStatus.value?.datasets) ? datasetStatus.value.datasets : []
)

const datasetHasToken = computed(() =>
  datasetToken.value.trim().length > 0
)

const datasetTokenStorageKey = computed(() =>
  `eldra:dataset-update-token:${worldId.value || 'global'}`
)

function datasetAuthHeaders() {
  const token = datasetToken.value.trim()

  return token
    ? {
        'x-eldra-dataset-token': token
      }
    : {}
}

function loadSavedDatasetToken() {
  if (typeof window === 'undefined') return

  datasetToken.value =
    window.localStorage.getItem(datasetTokenStorageKey.value) ||
    window.localStorage.getItem('eldra:dataset-update-token') ||
    ''

  datasetTokenLoaded.value = true
}

function persistDatasetToken() {
  if (typeof window === 'undefined') return

  const token = datasetToken.value.trim()

  window.localStorage.removeItem('eldra:dataset-update-token')

  if (!datasetTokenRemember.value || !token) {
    window.localStorage.removeItem(datasetTokenStorageKey.value)
    return
  }

  window.localStorage.setItem(datasetTokenStorageKey.value, token)
}

function clearDatasetToken() {
  datasetToken.value = ''
  datasetStatus.value = null
  datasetUpdateResult.value = null
  datasetMessage.value = ''
  datasetError.value = ''

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(datasetTokenStorageKey.value)
    window.localStorage.removeItem('eldra:dataset-update-token')
  }
}

function datasetStateText(dataset: any) {
  if (!dataset?.exists) return 'Missing'
  if (!dataset?.isGitRepo) return 'Not Git'
  if (dataset?.dirty) return 'Dirty'
  if (Number(dataset?.behind || 0) > 0) return `${dataset.behind} Behind`
  return 'Clean'
}

function datasetStateClass(dataset: any) {
  if (!dataset?.exists || !dataset?.isGitRepo || dataset?.dirty) {
    return 'border-red-400/30 bg-red-500/10 text-red-100'
  }

  if (Number(dataset?.behind || 0) > 0) {
    return 'border-amber-300/30 bg-amber-300/10 text-amber-100'
  }

  return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
}

async function loadDatasetStatus() {
  if (!datasetHasToken.value) {
    datasetError.value = 'Enter the dataset maintenance key first.'
    datasetMessage.value = ''
    return
  }

  datasetStatusBusy.value = true
  datasetError.value = ''
  datasetMessage.value = ''

  try {
    persistDatasetToken()

    datasetStatus.value = await $fetch('/api/import/datasets/status', {
      headers: datasetAuthHeaders()
    })
  } catch (error: any) {
    datasetError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load dataset status.'
  } finally {
    datasetStatusBusy.value = false
  }
}

async function updateDatasetTarget(target: DatasetUpdateTarget) {
  if (!datasetHasToken.value) {
    datasetError.value = 'Enter the dataset maintenance key first.'
    datasetMessage.value = ''
    return
  }

  datasetUpdateBusy.value = true
  datasetUpdateTarget.value = target
  datasetError.value = ''
  datasetMessage.value = ''
  datasetUpdateResult.value = null

  try {
    persistDatasetToken()

    const result: any = await $fetch('/api/import/datasets/update', {
      method: 'POST',
      headers: datasetAuthHeaders(),
      body: {
        target
      }
    })

    datasetUpdateResult.value = result
    datasetStatus.value = {
      ok: true,
      checkedAt: result?.updatedAt || new Date().toISOString(),
      datasets: result?.datasets || []
    }
    datasetMessage.value = result?.ok
      ? 'Dataset update complete.'
      : 'Dataset update finished with errors.'

    await refreshSourcePickerAfterDatasetUpdate()
  } catch (error: any) {
    datasetError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Dataset update failed.'
  } finally {
    datasetUpdateBusy.value = false
    datasetUpdateTarget.value = ''
  }
}

onMounted(() => {
  void loadSourceLabels()
  loadSavedDatasetToken()

  if (datasetHasToken.value) {
    void loadDatasetStatus()
  }
})


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
  return `${String(item?.kind || '').toLowerCase()}::${String(item?.name || '').toLowerCase()}::${String(item?.source || '').toLowerCase()}`
}

function selectedSourceItem() {
  return sourceResults.value.find((item: any) => sourceItemKey(item) === selectedSourceKey.value) || null
}

const selectedSourceLabel = computed(() => {
  const item = selectedSourceItem()
  if (!item) return ''
  return `${String(item?.name || '')}${item?.source ? ` (${sourceDisplayLabel(item.source)})` : ''}`
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
      sourceTotalCount.value = Number(res?.filteredCount || sourceResults.value.length || 0)

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
      params.set('limit', '-1')

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
                    {{ sourceDisplayLabel(src.source) }}
                  </option>
                </select>

                <div
                  data-import-source-guide
                  class="mt-3 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.38)] p-3"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Source Guide</div>
                      <div class="mt-1 text-sm font-semibold text-white">{{ selectedSourceDisplay }}</div>
                    </div>

                    <div class="text-xs text-[#9f9278]">
                      {{ sourceLabelsBusy ? 'Loading names...' : `${sourceGuideOptions.length} sources` }}
                    </div>
                  </div>

                  <p class="mt-2 text-xs leading-5 text-[#d8ceb8]">
                    Source codes come from the mounted local 5e.tools dataset. New books appear here after Dataset Update refreshes the source picker.
                  </p>

                  <div
                    v-if="sourceGuideOptions.length"
                    class="mt-3 max-h-[180px] overflow-auto rounded-none border border-[rgba(201,164,90,0.10)] bg-black/20"
                  >
                    <button
                      v-for="option in sourceGuideOptions.slice(0, 120)"
                      :key="`source-guide-${option.source}`"
                      type="button"
                      class="grid w-full grid-cols-[90px_minmax(0,1fr)] gap-3 border-b border-[rgba(201,164,90,0.08)] px-3 py-2 text-left text-xs last:border-b-0 hover:bg-[rgba(201,164,90,0.08)]"
                      @click="sourceSelection = option.source; searchSourceResults()"
                    >
                      <span class="font-semibold uppercase tracking-[0.16em] text-[#fff7df]">{{ sourceShortLabel(option.source) }}</span>
                      <span class="truncate text-[#d8ceb8]">{{ sourceFullName(option.source) || 'Name not found in local source map yet' }}</span>
                    </button>
                  </div>
                </div>

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

            <section
        data-dataset-tools
        class="mb-6 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.66)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Dataset Tools</div>
            <h2 class="mt-2 text-2xl font-semibold text-white">5e.tools Dataset Updates</h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-[#d8ceb8]">
              Pull the mounted 5e.tools data and image repositories from GitHub without SSHing into the VPS.
            </p>
          </div>

          <button
            type="button"
            class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] px-4 py-2 text-sm font-semibold text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df] disabled:opacity-50"
            :disabled="datasetStatusBusy || datasetUpdateBusy || !datasetHasToken"
            @click="loadDatasetStatus"
          >
            {{ datasetStatusBusy ? 'Checking...' : 'Check Status' }}
          </button>
        </div>

        <div
          data-dataset-maintenance-key
          class="mt-4 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.38)] p-4"
        >
          <div class="flex flex-wrap items-end gap-3">
            <label class="min-w-[260px] flex-1">
              <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
                Dataset Maintenance Key
              </span>
              <input
                v-model="datasetToken"
                type="password"
                autocomplete="off"
                class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                placeholder="Enter the server maintenance key..."
                @keyup.enter="loadDatasetStatus"
              >
            </label>

            <label class="inline-flex items-center gap-2 pb-2 text-xs text-[#d8ceb8]">
              <input
                v-model="datasetTokenRemember"
                type="checkbox"
                class="accent-[#c9a45a]"
              >
              Remember on this browser
            </label>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.28)] bg-[rgba(201,164,90,0.10)] px-4 py-2 text-sm font-semibold text-[#fff7df] transition hover:border-[rgba(201,164,90,0.54)] hover:bg-[rgba(201,164,90,0.16)] disabled:opacity-50"
              :disabled="!datasetHasToken || datasetStatusBusy || datasetUpdateBusy"
              @click="loadDatasetStatus"
            >
              Unlock Tools
            </button>

            <button
              type="button"
              class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] px-4 py-2 text-sm font-semibold text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]"
              @click="clearDatasetToken"
            >
              Clear Key
            </button>
          </div>

          <p class="mt-3 text-xs leading-5 text-[#9f9278]">
            Temporary admin bridge until Eldra permissions/user accounts are wired. The key is checked server-side against
            <code class="text-[#d8ceb8]">ELDRA_DATASET_UPDATE_TOKEN</code>.
          </p>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="target in datasetTargetOptions"
            :key="target.key"
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-4 py-2 text-sm font-semibold text-[#fff7df] transition hover:border-[rgba(201,164,90,0.52)] hover:bg-[rgba(201,164,90,0.16)] disabled:opacity-50"
            :disabled="datasetUpdateBusy || !datasetHasToken"
            :title="target.description"
            @click="updateDatasetTarget(target.key)"
          >
            {{ datasetUpdateBusy && datasetUpdateTarget === target.key ? 'Updating...' : target.label }}
          </button>
        </div>

        <div
          v-if="datasetError"
          class="mt-4 rounded-none border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
        >
          {{ datasetError }}
        </div>

        <div
          v-if="datasetMessage"
          class="mt-4 rounded-none border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100"
        >
          {{ datasetMessage }}
        </div>

        <div
          v-if="datasetRows.length"
          class="mt-5 grid gap-3 lg:grid-cols-2"
        >
          <article
            v-for="dataset in datasetRows"
            :key="dataset.key"
            class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.38)] p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-white">{{ dataset.label }}</div>
                <div class="mt-1 text-xs leading-5 text-[#9f9278]">{{ dataset.description }}</div>
              </div>

              <span
                class="rounded-none border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                :class="datasetStateClass(dataset)"
              >
                {{ datasetStateText(dataset) }}
              </span>
            </div>

            <div class="mt-3 grid gap-2 text-xs leading-5 text-[#d8ceb8]">
              <div>
                <span class="text-[#9f9278]">Branch:</span>
                <span class="ml-1">{{ dataset.branch || '-' }}</span>
              </div>
              <div>
                <span class="text-[#9f9278]">Commit:</span>
                <span class="ml-1">{{ dataset.lastCommit || dataset.shortHash || '-' }}</span>
              </div>
              <div class="break-all">
                <span class="text-[#9f9278]">Remote:</span>
                <span class="ml-1">{{ dataset.remote || '-' }}</span>
              </div>
              <div class="break-all">
                <span class="text-[#9f9278]">Path:</span>
                <span class="ml-1">{{ dataset.path }}</span>
              </div>
            </div>
          </article>
        </div>

        <details
          v-if="datasetUpdateResult"
          class="mt-4 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(4,8,14,0.44)] p-3"
        >
          <summary class="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-[#d8ceb8]">
            Update Log
          </summary>

          <pre class="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-none border border-[rgba(201,164,90,0.12)] bg-black/30 p-3 text-xs leading-5 text-[#d8ceb8]">{{ JSON.stringify(datasetUpdateResult, null, 2) }}</pre>
        </details>
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
