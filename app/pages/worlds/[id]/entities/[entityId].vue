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

function isLikelyImage(value: any) {
  const resolved = String(displayValue(value) || '')
  return resolved.startsWith('/api/assets/') || resolved.startsWith('http')
}

const heroImage = computed(() => {
  return entity.value?.image_url || world.value?.banner_image_url || null
})

const summaryText = computed(() => {
  if (entity.value?.summary) return entity.value.summary

  for (const block of entity.value?.blocks || []) {
    if (block?.data?.summary) return block.data.summary
    if (block?.data?.description) return block.data.description
    if (block?.data?.bio) return block.data.bio
  }

  return null
})

const contentBlocks = computed(() => {
  const blocks = entity.value?.blocks || []

  return blocks
    .filter((block: any) => block.block_key !== 'import_source')
    .map((block: any) => ({
      ...block,
      entries: Object.entries(block.data || {})
        .filter(([key]) => key !== 'image')
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
    }))
    .filter((block: any) => block.entries.length > 0)
})

const importBlock = computed(() => {
  return (entity.value?.blocks || []).find((block: any) => block.block_key === 'import_source') || null
})

const importEntries = computed(() => {
  if (!importBlock.value) return []

  return Object.entries(importBlock.value.data || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
})
</script>

<template>
  <div class="space-y-8">
    <section class="overflow-hidden rounded-[32px] border border-[#d7c4a0] bg-[#fbf6ee] shadow-[0_16px_34px_rgba(80,60,30,0.10)]">
      <div class="grid gap-0 xl:grid-cols-[420px_1fr]">
        <div
          v-if="heroImage"
          class="min-h-[420px] overflow-hidden border-b border-[#e4d6bc] bg-[#efe5d4] xl:border-b-0 xl:border-r"
        >
          <img
            :src="heroImage"
            :alt="entity?.title || 'Entity image'"
            class="h-full w-full object-cover"
          >
        </div>

        <div class="p-8 md:p-10">
          <div class="text-xs uppercase tracking-[0.38em] text-[#907a58]">
            {{ world?.name || 'World' }}
          </div>

          <h1 class="mt-3 text-5xl font-semibold tracking-[0.02em] text-[#2f2419] md:text-6xl">
            {{ entity?.title || 'Untitled Entity' }}
          </h1>

          <div class="mt-5 flex flex-wrap gap-2">
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

          <p
            v-if="summaryText"
            class="mt-8 max-w-4xl text-lg leading-9 text-[#4f4030]"
          >
            {{ summaryText }}
          </p>

          <div class="mt-8 grid gap-4 md:grid-cols-2" v-if="entity?.slug || entity?.updated_at">
            <div
              v-if="entity?.slug"
              class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-4"
            >
              <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                Slug
              </div>
              <div class="mt-2 text-base text-[#2f2419]">
                {{ entity.slug }}
              </div>
            </div>

            <div
              v-if="entity?.updated_at"
              class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-4"
            >
              <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                Updated
              </div>
              <div class="mt-2 text-base text-[#2f2419]">
                {{ entity.updated_at }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      v-for="block in contentBlocks"
      :key="block.id"
      class="rounded-[30px] border border-[#d7c4a0] bg-[#fbf6ee] p-6 md:p-8 shadow-[0_10px_24px_rgba(80,60,30,0.08)]"
    >
      <div class="max-w-5xl">
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          {{ prettyLabel(block.block_key) }}
        </div>

        <h2 class="mt-2 text-3xl font-semibold text-[#2f2419]">
          {{ block.label || prettyLabel(block.block_key) }}
        </h2>
      </div>

      <div class="mt-8 space-y-5">
        <div
          v-for="[key, rawValue] in block.entries"
          :key="key"
          class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-5"
        >
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(key) }}
          </div>

          <div class="mt-4">
            <template v-if="isLikelyImage(rawValue)">
              <img
                :src="String(displayValue(rawValue))"
                :alt="prettyLabel(key)"
                class="max-h-[520px] rounded-xl border border-[#e4d6bc] object-cover"
              >
            </template>

            <pre
              v-else-if="typeof rawValue === 'object' && rawValue !== null"
              class="overflow-x-auto whitespace-pre-wrap rounded-xl bg-[#f3eadc] p-4 text-sm leading-7 text-[#4f4030]"
            >{{ displayValue(rawValue) }}</pre>

            <p
              v-else
              class="whitespace-pre-wrap text-lg leading-9 text-[#4f4030]"
            >{{ displayValue(rawValue) || '—' }}</p>
          </div>
        </div>
      </div>
    </section>

    <section
      v-if="importBlock && importEntries.length"
      class="rounded-[30px] border border-[#d7c4a0] bg-[#f3eadc] p-6 md:p-8 shadow-[0_8px_18px_rgba(80,60,30,0.06)]"
    >
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            Reference Data
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-[#2f2419]">
            Import Source
          </h2>
        </div>

        <div class="rounded-full border border-[#cfb07a] bg-[#f7efdf] px-3 py-1 text-xs text-[#6b5333]">
          Developer / Admin
        </div>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <div
          v-for="[key, rawValue] in importEntries"
          :key="key"
          class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-4"
        >
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(key) }}
          </div>

          <div class="mt-3 text-base leading-7 text-[#4f4030]">
            {{ displayValue(rawValue) || '—' }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
