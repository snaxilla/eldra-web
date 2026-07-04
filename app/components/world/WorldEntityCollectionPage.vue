<script setup lang="ts">
import WorldMentionText from '~/components/world/WorldMentionText.vue'
const props = defineProps<{
  entityType: string
  title: string
  eyebrow?: string
  description?: string
  searchPlaceholder?: string
  emptyMessage?: string
}>()

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const search = ref('')
const classImageCache = ref<Record<string, string>>({})

const entitySummaryTypes = computed(() => {
  const type = normalizeEntityType(props.entityType)
  if (type === 'species') return 'species,race'
  return type
})

const {
  data: entities,
  pending,
  refresh
} = await useFetch(() => `/api/worlds/${worldId.value}/entities?summary=1&type=${encodeURIComponent(entitySummaryTypes.value)}`, {
  default: () => []
})

function normalizeEntityType(value: any) {
  return String(value || '').trim().toLowerCase()
}

function imageUrlForEntity(entity: any) {
  if (entity?.imageUrl) return String(entity.imageUrl)
  if (entity?.image_url) return String(entity.image_url)

  const id = String(entity?.id || '')
  const type = normalizeEntityType(entity?.entityType || entity?.entity_type)

  if (type === 'class' && id && classImageCache.value[id]) {
    return classImageCache.value[id]
  }

  const blocks = Array.isArray(entity?.blocks) ? entity.blocks : []
  for (const block of blocks) {
    const image = block?.data?.image
    if (!image) continue

    if (typeof image === 'string') return `/api/assets/${image}`

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return null
}

async function hydrateClassImages(list: any[]) {
  const classes = (list || []).filter((entity: any) =>
    normalizeEntityType(entity?.entityType || entity?.entity_type) === 'class'
  )

  await Promise.all(classes.map(async (entity: any) => {
    const id = String(entity?.id || '')
    if (!id || entity?.imageUrl || entity?.image_url || classImageCache.value[id]) return

    try {
      const result: any = await $fetch(`/api/worlds/${worldId.value}/entities/${id}/class-features`)
      if (result?.imageUrl) classImageCache.value[id] = String(result.imageUrl)
    } catch {}
  }))
}

function summaryForEntity(entity: any) {
  if (entity?.summary) return String(entity.summary)

  const blocks = Array.isArray(entity?.blocks) ? entity.blocks : []
  const overview = blocks.find((block: any) => {
    const key = String(block?.blockKey || block?.block_key || '')
    return key === 'overview'
  })

  const text = String(overview?.data?.text || '').trim()
  if (text) return text

  return ''
}

function initialsFor(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '??'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('')
}

const filteredEntities = computed(() => {
  const all = Array.isArray(entities.value) ? entities.value : []
  const needle = search.value.trim().toLowerCase()

  return all
    .filter((entity: any) => {
      const type = normalizeEntityType(entity?.entityType || entity?.entity_type)
      return type === normalizeEntityType(props.entityType)
    })
    .filter((entity: any) => {
      if (!needle) return true

      const haystack = [
        entity?.title,
        entity?.slug,
        entity?.summary,
        summaryForEntity(entity)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(needle)
    })
    .sort((a: any, b: any) => String(a?.title || '').localeCompare(String(b?.title || '')))
})

const countLabel = computed(() => filteredEntities.value.length)

watch(
  filteredEntities,
  () => {
    hydrateClassImages(filteredEntities.value)
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1700px] p-6">
      <section class="eldra-filigree rounded-none border border-[rgba(201,164,90,0.30)] bg-[linear-gradient(to_bottom,rgba(18,16,12,0.62),rgba(7,7,6,0.48))] p-6 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-zinc-500">
              {{ eyebrow || title }}
            </div>
            <h1 class="mt-2 text-3xl font-semibold text-white">{{ title }}</h1>
            <p class="mt-2 max-w-3xl text-sm text-zinc-300">
              {{ description || `Browse imported ${title.toLowerCase()} in this world.` }}
            </p>
          </div>

          <button
            type="button"
            class="rounded-none border border-stone-500/20 bg-[#151515]/70 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
            @click="refresh()"
          >
            Refresh
          </button>
        </div>

        <div class="mt-6">
          <input
            v-model="search"
            type="text"
            :placeholder="searchPlaceholder || `Search ${title.toLowerCase()}...`"
            class="w-full rounded-none border border-stone-500/20 bg-[#07101a]/90 px-4 py-4 text-sm text-zinc-100 outline-none transition focus:border-sky-400/30"
          >
        </div>
      </section>

      <div v-if="pending" class="mt-6 rounded-none border border-stone-500/20 bg-[#151515]/70 p-5 text-sm text-zinc-300">
        Loading {{ title.toLowerCase() }}...
      </div>

      <div
        v-else-if="!filteredEntities.length"
        class="mt-6 rounded-none border border-dashed border-stone-500/20 bg-[#121212]/70 p-10 text-center"
      >
        <div class="text-xs uppercase tracking-[0.35em] text-zinc-500">{{ title }}</div>
        <div class="mt-3 text-2xl font-semibold text-white">Nothing here yet</div>
        <p class="mt-3 text-sm text-zinc-300">
          {{ emptyMessage || `No ${title.toLowerCase()} have been imported into this world yet.` }}
        </p>
      </div>

      <div v-else class="mt-6">
        <div class="mb-4 text-xs uppercase tracking-[0.3em] text-zinc-500">
          Results <span class="text-zinc-400">({{ countLabel }})</span>
        </div>

        <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="entity in filteredEntities"
            :key="entity.id"
            :to="`/worlds/${worldId}/entities/${entity.id}`"
            class="overflow-hidden rounded-none border border-stone-500/20 bg-[linear-gradient(to_right,rgba(31,58,138,0.22),rgba(17,24,39,0.38))] transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[linear-gradient(to_right,rgba(31,58,138,0.30),rgba(17,24,39,0.52))]"
          >
            <div class="grid min-h-[220px] grid-cols-[120px_minmax(0,1fr)]">
              <div class="overflow-hidden border-r border-stone-500/20 bg-[linear-gradient(to_bottom,rgba(30,58,138,0.26),rgba(15,23,42,0.32))]">
                <img
                  v-if="imageUrlForEntity(entity)"
                  :src="imageUrlForEntity(entity)"
                  :alt="entity.title"
                  class="h-full w-full object-cover object-top"
                >
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center text-4xl font-semibold text-zinc-300"
                >
                  {{ initialsFor(entity.title || '') }}
                </div>
              </div>

              <div class="p-5">
                <div class="flex items-start justify-between gap-3">
                  <h2 class="line-clamp-2 text-2xl font-semibold text-white">
                    {{ entity.title }}
                  </h2>

                  <div
                    class="eldra-gold-chip shrink-0 rounded-none border px-3 py-1.5 text-[11px] uppercase tracking-[0.2em]"
                  >
                    {{ entityType }}
                  </div>
                </div>

                <WorldMentionText
                  v-if="summaryForEntity(entity)"
                  :world-id="worldId"
                  :markdown="summaryForEntity(entity)"
                  :interactive="false"
                  class="mt-4 line-clamp-5 text-sm leading-7 text-zinc-300"
                />

                <p v-else class="mt-4 line-clamp-5 text-sm leading-7 text-zinc-300">
                  Open article →
                </p>

                <div class="mt-6 text-sm font-medium text-[#f5e7bd]">
                  Open {{ title.replace(/s$/i, '') }} →
                </div>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

// force rebuild 2026-05-09T00:24:23Z
