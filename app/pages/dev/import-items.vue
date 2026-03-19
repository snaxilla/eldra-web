<script setup lang="ts">
const sampleJson = `{
  "item": [
    {
      "name": "Longsword",
      "source": "PHB",
      "page": 149,
      "type": "M",
      "weight": 3,
      "value": "15 gp",
      "dmg1": "1d8",
      "dmgType": "slashing",
      "entries": [
        "A versatile martial melee weapon."
      ]
    }
  ]
}`

const rawJson = ref(sampleJson)
const loading = ref(false)
const preview = ref<any>(null)
const errorMessage = ref('')

async function runPreview() {
  loading.value = true
  errorMessage.value = ''

  try {
    preview.value = await $fetch('/api/import/preview/5etools/items', {
      method: 'POST',
      body: {
        payload: rawJson.value
      }
    })
  } catch (error: any) {
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      'Import preview failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
    <div class="mx-auto max-w-7xl">
      <div class="mb-8">
        <div class="text-xs uppercase tracking-[0.3em] text-neutral-500">
          Eldra Dev
        </div>
        <h1 class="mt-2 text-3xl font-bold">
          5etools Item Import Preview
        </h1>
        <p class="mt-3 max-w-3xl text-sm text-neutral-400">
          Paste 5etools item JSON and preview how Eldra maps it into import_source and item_core blocks.
        </p>
      </div>

      <div class="grid gap-6 xl:grid-cols-2">
        <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div class="mb-3 text-sm font-semibold text-neutral-100">
            Raw 5etools JSON
          </div>

          <textarea
            v-model="rawJson"
            class="h-[34rem] w-full rounded-xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-sm text-neutral-200 outline-none"
            spellcheck="false"
          />

          <div class="mt-4 flex items-center gap-3">
            <button
              type="button"
              class="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-70"
              :disabled="loading"
              @click="runPreview"
            >
              {{ loading ? 'Previewing...' : 'Preview Import' }}
            </button>
          </div>

          <div
            v-if="errorMessage"
            class="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
          >
            {{ errorMessage }}
          </div>
        </div>

        <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div class="mb-3 text-sm font-semibold text-neutral-100">
            Eldra Preview Result
          </div>

          <div
            v-if="preview?.warnings?.length"
            class="mb-4 rounded-xl border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300"
          >
            <div
              v-for="warning in preview.warnings"
              :key="warning"
            >
              {{ warning }}
            </div>
          </div>

          <div v-if="preview" class="space-y-4">
            <div class="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
              <div>Provider: {{ preview.provider }}</div>
              <div>System: {{ preview.systemKey }}</div>
              <div>Entity Type: {{ preview.entityType }}</div>
              <div>Count: {{ preview.count }}</div>
            </div>

            <div
              v-for="item in preview.items"
              :key="item.externalId"
              class="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div class="text-lg font-semibold text-neutral-100">
                {{ item.title }}
              </div>
              <div class="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                {{ item.slug }}
              </div>

              <div class="mt-4 space-y-3">
                <div
                  v-for="block in item.blocks"
                  :key="block.blockKey"
                  class="rounded-xl border border-neutral-800 bg-neutral-900 p-3"
                >
                  <div class="mb-2 text-sm font-semibold text-neutral-200">
                    {{ block.label }} <span class="text-neutral-500">({{ block.blockKey }})</span>
                  </div>

                  <pre class="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-300">{{ JSON.stringify(block.data, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-500">
            No preview yet.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
