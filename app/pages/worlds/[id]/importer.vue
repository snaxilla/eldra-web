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

function buildPayload() {
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

async function runPreview() {
  resultMessage.value = ''
  previewResult.value = null

  if (!payloadText.value.trim()) {
    resultMessage.value = 'Paste some 5etools JSON first.'
    return
  }

  previewBusy.value = true

  try {
    const payload = buildPayload()
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
    const payload = buildPayload()
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
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1700px] p-6">
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div class="space-y-6">
          <section class="eldra-panel rounded-[24px] p-6 shadow-xl">
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

            <div class="mt-6 grid gap-4 lg:grid-cols-2">
              <div>
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Import Type</label>
                <select
                  v-model="importType"
                  class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none"
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
                  class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="create">Create Only</option>
                  <option value="update">Update Only</option>
                  <option value="upsert">Upsert</option>
                </select>
              </div>
            </div>

            <div class="mt-6 grid gap-6" :class="importType === 'monsters' ? 'xl:grid-cols-2' : 'grid-cols-1'">
              <div>
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">5etools JSON Payload</label>
                <textarea
                  v-model="payloadText"
                  rows="24"
                  placeholder="Paste raw 5etools JSON here..."
                  class="min-h-[420px] w-full rounded-2xl border border-white/10 bg-[#07101a]/90 px-4 py-4 font-mono text-sm text-slate-100 outline-none transition focus:border-sky-400/30"
                />
              </div>

              <div v-if="importType === 'monsters'">
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Monster Fluff Markdown (Optional)</label>
                <textarea
                  v-model="fluffMarkdownText"
                  rows="24"
                  placeholder="Paste monster lore/fluff markdown here..."
                  class="min-h-[420px] w-full rounded-2xl border border-white/10 bg-[#07101a]/90 px-4 py-4 font-mono text-sm text-slate-100 outline-none transition focus:border-sky-400/30"
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
                {{ previewBusy ? 'Previewing…' : 'Preview Import' }}
              </button>

              <button
                type="button"
                class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-50"
                :disabled="saveBusy"
                @click="runSave"
              >
                {{ saveBusy ? 'Importing…' : 'Run Import' }}
              </button>
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
            <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Preview Result</div>

            <pre
              v-if="previewResult"
              class="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-[#07101a]/90 p-4 text-xs text-slate-200"
            >{{ JSON.stringify(previewResult, null, 2) }}</pre>

            <div
              v-else
              class="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300"
            >
              No preview loaded yet.
            </div>
          </section>

          <section class="eldra-panel rounded-[24px] p-5 shadow-xl">
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
