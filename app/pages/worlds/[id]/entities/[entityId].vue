<script setup lang="ts">
const route = useRoute()
const worldId = route.params.id
const entityId = route.params.entityId

const { data: world } = await useFetch(`/api/worlds/${worldId}`)
const { data: entity } = await useFetch(`/api/worlds/${worldId}/entities/${entityId}`)

function prettyLabel(value?: string) {
  if (!value) return ''
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function displayValue(value: any) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    if (value.image_url) return value.image_url
    if (value.file_id) return `/api/assets/${value.file_id}`
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

const heroImage = computed(() => {
  return entity.value?.image_url || world.value?.banner_image_url || null
})

const renderedBlocks = computed(() => {
  return (entity.value?.blocks || []).map((block: any) => {
    const entries = Object.entries(block.data || {}).filter(([key]) => key !== 'image')
    return {
      ...block,
      entries
    }
  })
})
</script>

<template>
  <div class="space-y-8">
    <section class="overflow-hidden rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] shadow-[0_12px_28px_rgba(80,60,30,0.10)]">
      <div class="grid gap-0 lg:grid-cols-[360px_1fr]">
        <div
          v-if="heroImage"
          class="h-[420px] overflow-hidden border-b border-[#e4d6bc] bg-[#efe5d4] lg:h-full lg:border-b-0 lg:border-r"
        >
          <img
            :src="heroImage"
            :alt="entity?.title || 'Entity image'"
            class="h-full w-full object-cover"
          >
        </div>

        <div class="p-8">
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ world?.name || 'World' }}
          </div>

          <h1 class="mt-3 text-5xl font-semibold tracking-[0.04em] text-[#2f2419]">
            {{ entity?.title || 'Untitled Entity' }}
          </h1>

          <div class="mt-4 flex flex-wrap gap-2">
            <div
              v-if="entity?.entity_type"
              class="rounded-full border border-[#cfb07a] bg-[#f7efdf] px-4 py-2 text-sm font-medium text-[#6b5333]"
            >
              {{ prettyLabel(entity.entity_type) }}
            </div>

            <div
              v-if="entity?.status"
              class="rounded-full border border-[#d7c4a0] bg-[#f4ead8] px-4 py-2 text-sm text-[#6b5333]"
            >
              {{ entity.status }}
            </div>

            <div
              v-if="entity?.visibility"
              class="rounded-full border border-[#d7c4a0] bg-[#f4ead8] px-4 py-2 text-sm text-[#6b5333]"
            >
              {{ entity.visibility }}
            </div>
          </div>

          <div class="mt-6 grid gap-4 md:grid-cols-2">
            <div class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-4">
              <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                Slug
              </div>
              <div class="mt-2 text-lg text-[#2f2419]">
                {{ entity?.slug || '—' }}
              </div>
            </div>

            <div class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-4">
              <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                Updated
              </div>
              <div class="mt-2 text-lg text-[#2f2419]">
                {{ entity?.updated_at || '—' }}
              </div>
            </div>
          </div>

          <div
            v-if="entity?.summary"
            class="mt-6 rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-5"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              Summary
            </div>
            <p class="mt-3 text-base leading-8 text-[#4f4030]">
              {{ entity.summary }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section
      v-for="block in renderedBlocks"
      :key="block.id"
      class="rounded-[28px] border border-[#d7c4a0] bg-[#f8f2e8] p-6 shadow-[0_10px_24px_rgba(80,60,30,0.08)]"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(block.block_key) }}
          </div>
          <h2 class="mt-2 text-3xl font-semibold text-[#2f2419]">
            {{ block.label || prettyLabel(block.block_key) }}
          </h2>
        </div>

        <div class="rounded-full border border-[#cfb07a] bg-[#f7efdf] px-3 py-1 text-xs text-[#6b5333]">
          Sort {{ block.sort }}
        </div>
      </div>

      <div class="mt-6 grid gap-4">
        <div
          v-for="[key, rawValue] in block.entries"
          :key="key"
          class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-4"
        >
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(key) }}
          </div>

          <div class="mt-3">
            <template v-if="String(displayValue(rawValue)).startsWith('/api/assets/') || String(displayValue(rawValue)).startsWith('http')">
              <img
                :src="String(displayValue(rawValue))"
                :alt="prettyLabel(key)"
                class="max-h-[420px] rounded-xl border border-[#e4d6bc] object-cover"
              >
            </template>

            <pre
              v-else-if="typeof rawValue === 'object' && rawValue !== null"
              class="overflow-x-auto whitespace-pre-wrap rounded-xl bg-[#f3eadc] p-4 text-sm leading-7 text-[#4f4030]"
            >{{ displayValue(rawValue) }}</pre>

            <p
              v-else
              class="whitespace-pre-wrap text-base leading-8 text-[#4f4030]"
            >{{ displayValue(rawValue) || '—' }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
