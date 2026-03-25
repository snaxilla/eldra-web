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
    if (value.id) return `/api/assets/${value.id}`
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

const entityType = computed(() => String(entity.value?.entity_type || '').toLowerCase())

const typeTheme = computed(() => {
  const type = entityType.value

  if (type === 'spell') {
    return {
      accent: '#7c5cff',
      soft: '#f1ecff',
      border: '#d8cbff',
      tag: '#ede7ff'
    }
  }

  if (type === 'item') {
    return {
      accent: '#b38a2e',
      soft: '#fbf2de',
      border: '#dcc28a',
      tag: '#f7efdf'
    }
  }

  if (['character', 'npc', 'person', 'hero', 'species'].includes(type)) {
    return {
      accent: '#8d5a3d',
      soft: '#f5e8df',
      border: '#d8b49c',
      tag: '#f6ede7'
    }
  }

  if (type === 'location') {
    return {
      accent: '#3d7c6a',
      soft: '#e4f3ee',
      border: '#abd3c6',
      tag: '#eef8f4'
    }
  }

  return {
    accent: '#90704a',
    soft: '#f3eadc',
    border: '#d7c4a0',
    tag: '#f7efdf'
  }
})

const heroImage = computed(() => {
  return entity.value?.image_url || world.value?.banner_image_url || null
})

const summaryText = computed(() => {
  if (entity.value?.summary) return entity.value.summary

  for (const block of entity.value?.blocks || []) {
    if (block?.data?.summary) return block.data.summary
    if (block?.data?.description) return block.data.description
    if (block?.data?.bio) return block.data.bio
    if (block?.data?.text) return block.data.text
  }

  return null
})

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
    <div class="flex items-center justify-between">
      <NuxtLink
        :to="`/worlds/${worldId}/entities`"
        class="inline-flex items-center gap-2 rounded-full border border-[#cfb07a] bg-[#fbf6ee] px-4 py-2 text-sm font-medium text-[#6b5333] transition hover:bg-[#f4ead8]"
      >
        <span>←</span>
        <span>Back to Entities</span>
      </NuxtLink>
    </div>

    <section
      class="overflow-hidden rounded-[34px] border bg-[#fbf6ee] shadow-[0_18px_38px_rgba(80,60,30,0.10)]"
      :style="{
        borderColor: typeTheme.border
      }"
    >
      <div
        :class="isCharacterLike ? 'xl:grid-cols-[440px_1fr]' : 'xl:grid-cols-[380px_1fr]'"
        class="grid gap-0"
      >
        <div
          v-if="heroImage"
          :class="isCharacterLike ? 'min-h-[580px]' : 'min-h-[440px]'"
          class="relative overflow-hidden border-b bg-[#efe5d4] xl:border-b-0 xl:border-r"
          :style="{
            borderColor: typeTheme.border
          }"
        >
          <img
            :src="heroImage"
            :alt="entity?.title || 'Entity image'"
            class="h-full w-full object-cover"
          >
          <div
            class="absolute inset-0 bg-gradient-to-t from-[rgba(20,14,10,0.18)] via-transparent to-transparent"
          />
        </div>

        <div class="p-8 md:p-10 xl:p-12">
          <div class="flex flex-wrap items-center gap-3">
            <div
              class="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em]"
              :style="{
                color: typeTheme.accent,
                backgroundColor: typeTheme.soft
              }"
            >
              {{ world?.name || 'World' }}
            </div>

            <div
              v-if="entity?.entity_type"
              class="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em]"
              :style="{
                color: typeTheme.accent,
                backgroundColor: typeTheme.tag,
                border: `1px solid ${typeTheme.border}`
              }"
            >
              {{ prettyLabel(entity.entity_type) }}
            </div>
          </div>

          <h1 class="mt-5 text-5xl font-semibold tracking-[0.01em] text-[#2f2419] md:text-6xl">
            {{ entity?.title || 'Untitled Entity' }}
          </h1>

          <div class="mt-5 flex flex-wrap gap-2">
            <div
              v-if="entity?.status"
              class="rounded-full border px-4 py-2 text-sm text-[#6b5333]"
              :style="{
                borderColor: typeTheme.border,
                backgroundColor: typeTheme.tag
              }"
            >
              {{ entity.status }}
            </div>

            <div
              v-if="entity?.visibility"
              class="rounded-full border px-4 py-2 text-sm text-[#6b5333]"
              :style="{
                borderColor: typeTheme.border,
                backgroundColor: typeTheme.tag
              }"
            >
              {{ entity.visibility }}
            </div>
          </div>

          <p
            v-if="summaryText"
            class="mt-8 max-w-4xl text-xl leading-10 text-[#4f4030]"
          >
            {{ summaryText }}
          </p>

          <div
            v-if="isCharacterLike && primaryProfileBlock && primaryProfileBlock.profileEntries.length"
            class="mt-10 rounded-[28px] border bg-[#fffaf2] p-6 shadow-[0_8px_18px_rgba(80,60,30,0.05)]"
            :style="{
              borderColor: typeTheme.border
            }"
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
                class="rounded-2xl border bg-[#fbf6ee] p-4"
                :style="{
                  borderColor: typeTheme.border
                }"
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

          <div class="mt-10 grid gap-4 md:grid-cols-2" v-if="entity?.slug || entity?.updated_at">
            <div
              v-if="entity?.slug"
              class="rounded-2xl border bg-[#fffaf2] p-4"
              :style="{
                borderColor: typeTheme.border
              }"
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
              class="rounded-2xl border bg-[#fffaf2] p-4"
              :style="{
                borderColor: typeTheme.border
              }"
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
      class="rounded-[30px] border bg-[#fbf6ee] p-6 md:p-8 shadow-[0_10px_24px_rgba(80,60,30,0.08)]"
      :style="{
        borderColor: typeTheme.border
      }"
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
          class="rounded-2xl border bg-[#fffaf2] p-4"
          :style="{
            borderColor: typeTheme.border
          }"
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
          class="rounded-2xl border bg-[#fffaf2] p-6"
          :style="{
            borderColor: typeTheme.border
          }"
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
          class="rounded-2xl border bg-[#fffaf2] p-5"
          :style="{
            borderColor: typeTheme.border
          }"
        >
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(key) }}
          </div>

          <div class="mt-4">
            <img
              :src="String(displayValue(rawValue))"
              :alt="prettyLabel(key)"
              class="max-h-[560px] rounded-xl border border-[#e4d6bc] object-cover"
            >
          </div>
        </div>
      </div>
    </section>

    <section
      v-if="importBlock && importEntries.length"
      class="rounded-[30px] border bg-[#f3eadc] p-6 md:p-8 shadow-[0_8px_18px_rgba(80,60,30,0.06)]"
      :style="{
        borderColor: typeTheme.border
      }"
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

        <div
          class="rounded-full px-3 py-1 text-xs text-[#6b5333]"
          :style="{
            border: `1px solid ${typeTheme.border}`,
            backgroundColor: typeTheme.tag
          }"
        >
          Developer / Admin
        </div>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <div
          v-for="[key, rawValue] in importEntries"
          :key="key"
          class="rounded-2xl border bg-[#fffaf2] p-4"
          :style="{
            borderColor: typeTheme.border
          }"
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
