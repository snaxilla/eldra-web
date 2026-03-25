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
  }
}>()

const routeTo = computed(() => {
  if (props.entity.world_id) {
    return `/worlds/${props.entity.world_id}/entities/${props.entity.id}`
  }

  return '/'
})

const typeLabel = computed(() => {
  const value = props.entity.entity_type || 'entity'
  return value.charAt(0).toUpperCase() + value.slice(1)
})

const isPortraitType = computed(() => {
  const type = (props.entity.entity_type || '').toLowerCase()
  return ['character', 'npc', 'person', 'hero', 'species', 'class'].includes(type)
})

function excerpt(text?: string, max = 120) {
  if (!text) return 'No summary yet.'
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}
</script>

<template>
  <NuxtLink
    :to="routeTo"
    class="group overflow-hidden rounded-[28px] border border-[#d7c4a0] bg-[#fbf6ee] shadow-[0_10px_24px_rgba(80,60,30,0.08)] transition hover:-translate-y-1 hover:border-[#cfa85a] hover:shadow-[0_18px_34px_rgba(80,60,30,0.14)]"
  >
    <div
      v-if="entity.image_url"
      :class="isPortraitType ? 'h-80' : 'h-52'"
      class="overflow-hidden border-b border-[#e4d6bc] bg-[#efe5d4]"
    >
      <img
        :src="entity.image_url"
        :alt="entity.title || 'Entity image'"
        class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
      >
    </div>

    <div
      v-else
      :class="isPortraitType ? 'h-80' : 'h-52'"
      class="flex items-center justify-center border-b border-[#e4d6bc] bg-[linear-gradient(180deg,#f1e6d5_0%,#e7d8bf_100%)]"
    >
      <div class="text-center">
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          {{ typeLabel }}
        </div>
        <div class="mt-3 text-5xl text-[#b38a2e]">
          ✦
        </div>
      </div>
    </div>

    <div class="p-5">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
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

        <div class="shrink-0 rounded-full border border-[#cfb07a] bg-[#f7efdf] px-3 py-1 text-xs font-medium text-[#6b5333]">
          {{ typeLabel }}
        </div>
      </div>

      <p class="mt-4 min-h-[4.5rem] text-sm leading-7 text-[#4f4030]">
        {{ excerpt(entity.preview_text) }}
      </p>

      <div class="mt-5 flex flex-wrap gap-2">
        <div
          v-if="entity.status"
          class="rounded-full border border-[#d7c4a0] bg-[#f4ead8] px-3 py-1 text-xs text-[#6b5333]"
        >
          {{ entity.status }}
        </div>

        <div
          v-if="entity.visibility"
          class="rounded-full border border-[#d7c4a0] bg-[#f4ead8] px-3 py-1 text-xs text-[#6b5333]"
        >
          {{ entity.visibility }}
        </div>
      </div>
    </div>
  </NuxtLink>
</template>
