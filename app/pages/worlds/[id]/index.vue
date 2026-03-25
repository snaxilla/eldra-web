<script setup lang="ts">
const route = useRoute()
const worldId = route.params.id

const { data: world } = await useFetch(`/api/worlds/${worldId}`)
const { data: entities } = await useFetch(`/api/worlds/${worldId}/entities`)

function prettyLabel(value?: string) {
  if (!value) return ''
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function excerpt(text?: string, max = 160) {
  if (!text) return 'No description yet.'
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}

const bannerUrl = computed(() => {
  return world.value?.banner_image_url || 'https://picsum.photos/seed/eldra-hero/1600/700'
})

const recentEntries = computed(() => {
  const list = Array.isArray(entities.value) ? [...entities.value] : []

  return list
    .sort((a: any, b: any) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime()
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime()
      return bTime - aTime
    })
    .slice(0, 4)
})

const quickLinks = computed(() => {
  const list = Array.isArray(entities.value) ? entities.value : []
  const buckets = new Map<string, any[]>()

  for (const entity of list) {
    const type = entity?.entity_type || 'entity'
    if (!buckets.has(type)) buckets.set(type, [])
    buckets.get(type)!.push(entity)
  }

  return Array.from(buckets.entries())
    .map(([type, items]) => {
      const withImage = items.find((item: any) => item.image_url)
      const first = withImage || items[0]

      return {
        type,
        count: items.length,
        label: prettyLabel(type),
        image_url: first?.image_url || null,
        href: `/worlds/${worldId}/entities?type=${encodeURIComponent(type)}`
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
})

const featuredEntities = computed(() => {
  const list = Array.isArray(entities.value) ? entities.value : []

  return list
    .filter((entity: any) => entity.image_url)
    .slice(0, 3)
})
</script>

<template>
  <div class="space-y-8">
    <section class="overflow-hidden rounded-[30px] border border-[#c8b28a] bg-[#f6efe2] shadow-[0_14px_35px_rgba(80,60,30,0.12)]">
      <div class="relative h-[290px] md:h-[360px]">
        <img
          :src="bannerUrl"
          alt="World banner"
          class="h-full w-full object-cover"
        >
        <div class="absolute inset-0 bg-gradient-to-r from-[rgba(35,25,15,0.22)] via-[rgba(35,25,15,0.10)] to-transparent" />
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(245,236,223,0.78)] via-[rgba(245,236,223,0.22)] to-transparent p-8 md:p-10">
          <div class="max-w-4xl">
            <div class="mb-2 text-xs uppercase tracking-[0.45em] text-[#6c5a40]">
              World {{ worldId }}
            </div>

            <h1 class="text-5xl font-semibold tracking-[0.08em] text-[#b38a2e] md:text-7xl">
              {{ world?.name || 'Untitled World' }}
            </h1>

            <p
              v-if="world?.subtitle"
              class="mt-3 max-w-2xl text-lg leading-7 text-[#5b4935]"
            >
              {{ world.subtitle }}
            </p>

            <p class="mt-4 max-w-2xl text-base leading-7 text-[#3f3122]">
              {{ world?.description || 'No world description yet.' }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-6 xl:grid-cols-[1.55fr_0.95fr]">
      <div class="rounded-[26px] border border-[#d7c4a0] bg-[#f8f2e8] p-5 shadow-[0_10px_24px_rgba(80,60,30,0.10)]">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-2xl font-semibold text-[#2f2419]">Recent Entries</h2>
          <NuxtLink
            :to="`/worlds/${worldId}/entities`"
            class="text-xs uppercase tracking-[0.35em] text-[#907a58] transition hover:text-[#6b5333]"
          >
            Browse All
          </NuxtLink>
        </div>

        <div v-if="!recentEntries.length" class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-6 text-[#4f4030]">
          No entities yet for this world.
        </div>

        <div v-else class="space-y-4">
          <NuxtLink
            v-for="entry in recentEntries"
            :key="entry.id"
            :to="`/worlds/${worldId}/entities/${entry.id}`"
            class="group grid grid-cols-[140px_1fr] gap-4 rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-3 transition hover:border-[#cfa85a] hover:bg-[#fffdf8]"
          >
            <div class="overflow-hidden rounded-xl border border-[#e4d6bc] bg-[#efe5d4]">
              <img
                v-if="entry.image_url"
                :src="entry.image_url"
                :alt="entry.title"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              >
              <div
                v-else
                class="flex h-full min-h-[110px] items-center justify-center bg-[linear-gradient(180deg,#efe3cd_0%,#e6d6bc_100%)]"
              >
                <div class="text-center">
                  <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                    {{ prettyLabel(entry.entity_type) }}
                  </div>
                  <div class="mt-2 text-3xl text-[#b38a2e]">✦</div>
                </div>
              </div>
            </div>

            <div class="min-w-0">
              <div class="mb-1 text-xs uppercase tracking-[0.35em] text-[#907a58]">
                {{ prettyLabel(entry.entity_type) }}
              </div>

              <h3 class="truncate text-2xl font-semibold text-[#2d2318]">
                {{ entry.title }}
              </h3>

              <p class="mt-2 line-clamp-3 text-sm leading-7 text-[#4f4030]">
                {{ excerpt(entry.preview_text || entry.summary) }}
              </p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <div class="space-y-6">
        <div class="rounded-[26px] border border-[#d7c4a0] bg-[#f8f2e8] p-5 shadow-[0_10px_24px_rgba(80,60,30,0.10)]">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-2xl font-semibold text-[#2f2419]">Quick Links</h2>
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              Type Buckets
            </div>
          </div>

          <div v-if="!quickLinks.length" class="text-[#4f4030]">
            No entity types available yet.
          </div>

          <div v-else class="grid grid-cols-2 gap-3">
            <NuxtLink
              v-for="item in quickLinks"
              :key="item.type"
              :to="item.href"
              class="group overflow-hidden rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] text-left transition hover:border-[#cfa85a] hover:bg-[#fffdf8]"
            >
              <div class="aspect-square overflow-hidden border-b border-[#e4d6bc] bg-[#efe5d4]">
                <img
                  v-if="item.image_url"
                  :src="item.image_url"
                  :alt="item.label"
                  class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                >
                <div
                  v-else
                  class="flex h-full items-center justify-center bg-[linear-gradient(180deg,#efe3cd_0%,#e6d6bc_100%)]"
                >
                  <div class="text-center">
                    <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                      {{ item.label }}
                    </div>
                    <div class="mt-2 text-3xl text-[#b38a2e]">✦</div>
                  </div>
                </div>
              </div>

              <div class="px-3 py-3">
                <div class="truncate text-sm font-medium text-[#2f2419]">
                  {{ item.label }}
                </div>
                <div class="mt-1 text-xs uppercase tracking-[0.25em] text-[#907a58]">
                  {{ item.count }} entries
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <div
          v-if="featuredEntities.length"
          class="rounded-[26px] border border-[#d7c4a0] bg-[#f8f2e8] p-5 shadow-[0_10px_24px_rgba(80,60,30,0.10)]"
        >
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-2xl font-semibold text-[#2f2419]">Featured</h2>
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              With Artwork
            </div>
          </div>

          <div class="space-y-3">
            <NuxtLink
              v-for="entry in featuredEntities"
              :key="entry.id"
              :to="`/worlds/${worldId}/entities/${entry.id}`"
              class="group flex items-center gap-3 rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-3 transition hover:border-[#cfa85a] hover:bg-[#fffdf8]"
            >
              <div class="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[#e4d6bc] bg-[#efe5d4]">
                <img
                  :src="entry.image_url"
                  :alt="entry.title"
                  class="h-full w-full object-cover"
                >
              </div>

              <div class="min-w-0">
                <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                  {{ prettyLabel(entry.entity_type) }}
                </div>
                <div class="truncate text-lg font-semibold text-[#2d2318]">
                  {{ entry.title }}
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
