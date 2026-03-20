<script setup lang="ts">
const props = defineProps<{
  block: {
    id?: number | string
    blockKey: string
    label: string
    sort: number
    repeatable: boolean
    data: Record<string, any> | null
  }
}>()

const config = useRuntimeConfig()

const directusBase = computed(() => {
  const raw = String(config.public?.directusUrl || '')
  return raw.replace(/\/+$/, '').replace(/^http:\/\//i, 'https://')
})

const imageUrl = computed(() => {
  const data = props.block?.data || {}

  if (data.image_url) {
    return String(data.image_url).replace(/^http:\/\//i, 'https://')
  }

  if (data.image && typeof data.image === 'string' && directusBase.value) {
    return `${directusBase.value}/assets/${data.image}`
  }

  return ''
})

const displayRows = computed(() => {
  const data = props.block?.data || {}

  return Object.entries(data)
    .filter(([key]) => !['raw_json', 'image', 'image_url'].includes(key))
    .map(([key, value]) => ({
      key,
      value:
        typeof value === 'object' && value !== null
          ? JSON.stringify(value, null, 2)
          : String(value ?? '')
    }))
})
</script>

<template>
  <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div>
        <div class="text-lg font-semibold text-neutral-100">
          {{ block.label }}
        </div>
        <div class="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
          {{ block.blockKey }}
        </div>
      </div>

      <div class="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-400">
        Sort {{ block.sort }}
      </div>
    </div>

    <img
      v-if="imageUrl"
      :src="imageUrl"
      alt=""
      class="mb-4 max-h-72 w-full rounded-xl border border-neutral-800 object-cover"
    />

    <div class="space-y-3">
      <div
        v-for="row in displayRows"
        :key="row.key"
        class="rounded-xl border border-neutral-800 bg-neutral-950 p-3"
      >
        <div class="mb-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
          {{ row.key }}
        </div>
        <pre class="whitespace-pre-wrap break-words text-sm text-neutral-200">{{ row.value }}</pre>
      </div>
    </div>
  </div>
</template>
