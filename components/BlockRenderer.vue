<script setup lang="ts">
const props = defineProps<{
  block: {
    id: string
    template?: string
    data?: Record<string, any>
    sort?: number
    visibility?: string
  }
}>()

const templateName = computed(() => String(props.block?.template || '').toLowerCase())
const data = computed(() => props.block?.data || {})

const title = computed(() =>
  data.value.title ||
  data.value.heading ||
  data.value.name ||
  ''
)

const textContent = computed(() =>
  data.value.body ||
  data.value.content ||
  data.value.text ||
  data.value.description ||
  ''
)

const imageUrl = computed(() =>
  data.value.image_url ||
  data.value.image ||
  data.value.url ||
  ''
)

const statEntries = computed(() => {
  if (data.value.stats && typeof data.value.stats === 'object') {
    return Object.entries(data.value.stats)
  }

  if (data.value.values && typeof data.value.values === 'object') {
    return Object.entries(data.value.values)
  }

  const ignored = new Set(['title', 'heading', 'name', 'body', 'content', 'text', 'description', 'image', 'image_url', 'url'])
  return Object.entries(data.value).filter(([key]) => !ignored.has(key))
})
</script>

<template>
  <div class="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm">
    <div class="mb-3 flex items-center justify-between">
      <div class="text-xs uppercase tracking-[0.2em] text-neutral-400">
        {{ block.template || 'block' }}
      </div>
      <div class="text-xs text-neutral-500">
        {{ block.visibility || 'visible' }}
      </div>
    </div>

    <template v-if="templateName.includes('image')">
      <div class="space-y-4">
        <h3 v-if="title" class="text-xl font-semibold text-neutral-100">
          {{ title }}
        </h3>

        <img
          v-if="imageUrl"
          :src="imageUrl"
          :alt="title || 'Block image'"
          class="max-h-[28rem] w-full rounded-xl border border-neutral-800 object-cover"
        >

        <div v-if="textContent" class="prose prose-invert max-w-none text-neutral-200" v-html="textContent" />
      </div>
    </template>

    <template v-else-if="templateName.includes('text') || templateName.includes('rich')">
      <div class="space-y-4">
        <h3 v-if="title" class="text-xl font-semibold text-neutral-100">
          {{ title }}
        </h3>

        <div
          v-if="textContent"
          class="prose prose-invert max-w-none text-neutral-200"
          v-html="textContent"
        />

        <pre v-else class="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-400">{{ JSON.stringify(block.data, null, 2) }}</pre>
      </div>
    </template>

    <template v-else-if="templateName.includes('stat')">
      <div class="space-y-4">
        <h3 v-if="title" class="text-xl font-semibold text-neutral-100">
          {{ title }}
        </h3>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="[key, value] in statEntries"
            :key="key"
            class="rounded-xl border border-neutral-800 bg-neutral-950 p-3"
          >
            <div class="text-xs uppercase tracking-wide text-neutral-500">
              {{ key }}
            </div>
            <div class="mt-1 text-base font-semibold text-neutral-100">
              {{ value }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="space-y-4">
        <h3 v-if="title" class="text-xl font-semibold text-neutral-100">
          {{ title }}
        </h3>

        <div v-if="textContent" class="prose prose-invert max-w-none text-neutral-200" v-html="textContent" />

        <pre v-else class="overflow-x-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-400">{{ JSON.stringify(block.data, null, 2) }}</pre>
      </div>
    </template>
  </div>
</template>
