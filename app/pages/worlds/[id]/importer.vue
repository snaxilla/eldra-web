<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

const importType = ref('monsters')
const mode = ref('upsert')

const payloadText = ref('')
const fluffMarkdown = ref('')

const previewResult = ref(null)
const saveResult = ref(null)
const resultMessage = ref('')

const previewBusy = ref(false)
const saveBusy = ref(false)

function buildPayload() {
  const payload = JSON.parse(payloadText.value)

  if (importType.value === 'monsters' && fluffMarkdown.value.trim()) {
    if (Array.isArray(payload.monster)) {
      payload.monster = payload.monster.map(m => ({
        ...m,
        fluffMarkdown: fluffMarkdown.value
      }))
    } else if (payload.name) {
      payload.fluffMarkdown = fluffMarkdown.value
    }
  }

  return payload
}

async function runPreview() {
  previewBusy.value = true
  try {
    previewResult.value = await $fetch('/api/import/preview/5etools/monsters', {
      method: 'POST',
      body: { payload: buildPayload() }
    })
    resultMessage.value = 'Preview loaded.'
  } catch (e:any) {
    resultMessage.value = e.message || 'Preview failed.'
  }
  previewBusy.value = false
}

async function runSave() {
  saveBusy.value = true
  try {
    saveResult.value = await $fetch('/api/import/save/5etools/monsters', {
      method: 'POST',
      body: {
        worldId: Number(worldId.value),
        mode: mode.value,
        payload: buildPayload()
      }
    })
    resultMessage.value = 'Import complete.'
  } catch (e:any) {
    resultMessage.value = e.message || 'Import failed.'
  }
  saveBusy.value = false
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Monster Importer</h1>
    </div>

    <textarea v-model="payloadText" rows="12" placeholder="Monster JSON"
      class="w-full bg-black/40 text-white p-3 rounded" />

    <textarea v-model="fluffMarkdown" rows="10" placeholder="Optional Markdown fluff"
      class="w-full bg-black/40 text-white p-3 rounded" />

    <div class="flex gap-3">
      <button @click="runPreview" class="btn">Preview</button>
      <button @click="runSave" class="btn">Import</button>
    </div>

    <pre v-if="previewResult">{{ previewResult }}</pre>
    <pre v-if="saveResult">{{ saveResult }}</pre>

    <div class="text-sm text-slate-300">{{ resultMessage }}</div>
  </div>
</template>
