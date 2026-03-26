<script setup lang="ts">
const props = defineProps<{
  entity: {
    id: number | string
    world_id?: number | string
    title?: string
    slug?: string
    entity_type?: string
    status?: string
    visibility?: string
    image_url?: string | null
    preview_text?: string
    summary?: string
  }
}>()

const routeTo = computed(() => {
  if (props.entity.world_id) {
    return `/worlds/${props.entity.world_id}/entities/${props.entity.id}`
  }

  return '/'
})

const entityType = computed(() => String(props.entity.entity_type || '').toLowerCase())

const typeLabel = computed(() => {
  const value = props.entity.entity_type || 'entity'
  return value.charAt(0).toUpperCase() + value.slice(1)
})

const isPortraitType = computed(() => {
  return ['character', 'npc', 'person', 'hero', 'species', 'class'].includes(entityType.value)
})

const typeTheme = computed(() => {
  const type = entityType.value

  if (type === 'spell') {
    return {
      accent: '#7c5cff',
      soft: '#f1ecff',
      border: '#d8cbff',
      tag: '#ede7ff',
      glow: 'shadow-[0_16px_30px_rgba(124,92,255,0.10)]'
    }
  }

  if (type === 'item') {
    return {
      accent: '#b38a2e',
      soft: '#fbf2de',
      border: '#dcc28a',
      tag: '#f7efdf',
      glow: 'shadow-[0_16px_30px_rgba(179,138,46,0.10)]'
    }
  }

  if (['character', 'npc', 'person', 'hero', 'species'].includes(type)) {
    return {
      accent: '#8d5a3d',
      soft: '#f5e8df',
      border: '#d8b49c',
      tag: '#f6ede7',
      glow: 'shadow-[0_16px_30px_rgba(141,90,61,0.10)]'
    }
  }

  if (type === 'class') {
    return {
      accent: '#6f5a3c',
      soft: '#f3eadb',
      border: '#cfba96',
      tag: '#f6efe2',
      glow: 'shadow-[0_16px_30px_rgba(111,90,60,0.10)]'
    }
  }

  if (type === 'location') {
    return {
      accent: '#3d7c6a',
      soft: '#e4f3ee',
      border: '#abd3c6',
      tag: '#eef8f4',
      glow: 'shadow-[0_16px_30px_rgba(61,124,106,0.10)]'
    }
  }

  return {
    accent: '#90704a',
    soft: '#f3eadc',
    border: '#d7c4a0',
    tag: '#f7efdf',
    glow: 'shadow-[0_16px_30px_rgba(144,112,74,0.08)]'
  }
})

function excerpt(text?: string, max = 125) {
  if (!text) return 'No summary yet.'
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}

const summaryText = computed(() => {
  return props.entity.preview_text || props.entity.summary || ''
})
</script>

<template>
  <NuxtLink
    :to="routeTo"
    class="group overflow-hidden rounded-[30px] border bg-[#fbf6ee] transition hover:-translate-y-1"
    :class="typeTheme.glow"
    :style="{
      borderColor: typeTheme.border
    }"
  >
    <div
      v-if="entity.image_url"
      :class="isPortraitType ? 'h-84' : 'h-56'"
      class="relative overflow-hidden border-b bg-[#efe5d4]"
      :style="{
        borderColor: typeTheme.border
      }"
    >
      <img
        :src="entity.image_url"
        :alt="entity.title || 'Entity image'"
        class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
      >
      <div class="absolute inset-0 bg-gradient-to-t from-[rgba(20,14,10,0.16)] via-transparent to-transparent" />

      <div class="absolute left-4 top-4">
        <div
          class="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em]"
          :style="{
            color: typeTheme.accent,
            backgroundColor: 'rgba(255,248,236,0.88)',
            border: `1px solid ${typeTheme.border}`
          }"
        >
          {{ typeLabel }}
        </div>
      </div>
    </div>

    <div
      v-else
      :class="isPortraitType ? 'h-84' : 'h-56'"
      class="relative flex items-center justify-center border-b"
      :style="{
        borderColor: typeTheme.border,
        background: `linear-gradient(180deg, ${typeTheme.soft} 0%, #efe3cd 100%)`
      }"
    >
      <div class="text-center px-6">
        <div
          class="text-xs uppercase tracking-[0.35em]"
          :style="{ color: typeTheme.accent }"
        >
          {{ typeLabel }}
        </div>

        <div
          class="mt-4 text-6xl"
          :style="{ color: typeTheme.accent }"
        >
          ✦
        </div>

        <div
          class="mt-4 text-sm"
          :style="{ color: '#6b5333' }"
        >
          Artwork can be added
        </div>
      </div>
    </div>

    <div class="p-5 md:p-6">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div
            class="text-xs uppercase tracking-[0.35em]"
            :style="{ color: '#907a58' }"
          >
            {{ typeLabel }}
          </div>

          <h3 class="mt-2 truncate text-2xl font-semibold text-[#2d2318]">
            {{ entity.title || 'Untitled Entity' }}
          </h3>

          <div
            v-if="entity.slug"
            class="mt-1 truncate text-xs uppercase tracking-[0.25em] text-[#9a8667]"
          >
            {{ entity.slug }}
          </div>
        </div>

        <div
          class="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
          :style="{
            color: typeTheme.accent,
            backgroundColor: typeTheme.tag,
            border: `1px solid ${typeTheme.border}`
          }"
        >
          {{ typeLabel }}
        </div>
      </div>

      <p class="mt-5 min-h-[4.8rem] text-sm leading-7 text-[#4f4030]">
        {{ excerpt(summaryText) }}
      </p>

      <div class="mt-5 flex flex-wrap gap-2">
        <div
          v-if="entity.status"
          class="rounded-full px-3 py-1 text-xs"
          :style="{
            color: '#6b5333',
            backgroundColor: typeTheme.tag,
            border: `1px solid ${typeTheme.border}`
          }"
        >
          {{ entity.status }}
        </div>

        <div
          v-if="entity.visibility"
          class="rounded-full px-3 py-1 text-xs"
          :style="{
            color: '#6b5333',
            backgroundColor: typeTheme.tag,
            border: `1px solid ${typeTheme.border}`
          }"
        >
          {{ entity.visibility }}
        </div>
      </div>

      <div class="mt-6 flex items-center justify-between">
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          Open Entry
        </div>

        <div
          class="rounded-full px-4 py-2 text-sm font-medium transition"
          :style="{
            color: typeTheme.accent,
            backgroundColor: typeTheme.soft,
            border: `1px solid ${typeTheme.border}`
          }"
        >
          Read →
        </div>
      </div>
    </div>
  </NuxtLink>
</template>
