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

function isLongText(value: any) {
  const resolved = String(displayValue(value) || '')
  return resolved.length > 140 || resolved.includes('\n')
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

const entityType = computed(() => String(entity.value?.entity_type || '').toLowerCase())

const isCharacterLike = computed(() => {
  return ['character', 'npc', 'person', 'hero', 'species'].includes(entityType.value)
})

const rawBlocks = computed(() => {
  return (entity.value?.blocks || []).filter((block: any) => block.block_key !== 'import_source')
})

const normalizedBlocks = computed(() => {
  return rawBlocks.value
    .map((block: any) => {
      const entries = Object.entries(block.data || {})
        .filter(([key]) => key !== 'image')
        .filter(([, value]) => value !== null && value !== undefined && value !== '')

      const profileEntries = entries.filter(([, value]) => !isLikelyImage(value) && !isLongText(value))
      const proseEntries = entries.filter(([, value]) => !isLikelyImage(value) && isLongText(value))
      const imageEntries = entries.filter(([, value]) => isLikelyImage(value))

      return {
        ...block,
        profileEntries,
        proseEntries,
        imageEntries
      }
    })
    .filter((block: any) => block.profileEntries.length || block.proseEntries.length || block.imageEntries.length)
})

const primaryProfileBlock = computed(() => {
  if (!isCharacterLike.value) return null

  return normalizedBlocks.value.find((block: any) => block.profileEntries.length > 0) || null
})

const remainingBlocks = computed(() => {
  if (!isCharacterLike.value) return normalizedBlocks.value
  return normalizedBlocks.value.filter((block: any) => block.id !== primaryProfileBlock.value?.id)
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
      <div
        :class="isCharacterLike ? 'xl:grid-cols-[420px_1fr]' : 'xl:grid-cols-[360px_1fr]'"
        class="grid gap-0"
      >
        <div
          v-if="heroImage"
          :class="isCharacterLike ? 'min-h-[540px]' : 'min-h-[420px]'"
          class="overflow-hidden border-b border-[#e4d6bc] bg-[#efe5d4] xl:border-b-0 xl:border-r"
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

          <div
            v-if="isCharacterLike && primaryProfileBlock && primaryProfileBlock.profileEntries.length"
            class="mt-8 rounded-[28px] border border-[#d7c4a0] bg-[#fffaf2] p-6 shadow-[0_8px_18px_rgba(80,60,30,0.05)]"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              Profile
            </div>

            <h2 class="mt-2 text-2xl font-semibold text-[#2f2419]">
              {{ primaryProfileBlock.label || prettyLabel(primaryProfileBlock.block_key) }}
            </h2>

            <div class="mt-6 grid gap-4 md:grid-cols-2">
              <div
                v-for="[key, rawValue] in primaryProfileBlock.profileEntries"
                :key="key"
                class="rounded-2xl border border-[#dfcfb1] bg-[#fbf6ee] p-4"
              >
                <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                  {{ prettyLabel(key) }}
                </div>

                <div class="mt-3 text-base leading-7 text-[#4f4030]">
                  {{ displayValue(rawValue) || '—' }}
                </div>
              </div>
            </div>
          </div>

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
      v-for="block in remainingBlocks"
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

      <div
        v-if="block.profileEntries.length"
        class="mt-8 grid gap-4 md:grid-cols-2"
      >
        <div
          v-for="[key, rawValue] in block.profileEntries"
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

      <div
        v-if="block.proseEntries.length"
        class="mt-8 space-y-5"
      >
        <div
          v-for="[key, rawValue] in block.proseEntries"
          :key="key"
          class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-5"
        >
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(key) }}
          </div>

          <div class="mt-4">
            <p class="whitespace-pre-wrap text-lg leading-9 text-[#4f4030]">
              {{ displayValue(rawValue) || '—' }}
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="block.imageEntries.length"
        class="mt-8 space-y-5"
      >
        <div
          v-for="[key, rawValue] in block.imageEntries"
          :key="key"
          class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-5"
        >
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(key) }}
          </div>

          <div class="mt-4">
            <img
              :src="String(displayValue(rawValue))"
              :alt="prettyLabel(key)"
              class="max-h-[520px] rounded-xl border border-[#e4d6bc] object-cover"
            >
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
