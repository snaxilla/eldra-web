<script setup lang="ts">
const route = useRoute()
const worldId = route.params.id

const { data: world, refresh } = await useFetch(`/api/worlds/${worldId}`)

const quickLinks = [
  { label: 'Characters', image: 'https://picsum.photos/seed/eldra-char-1/200/200' },
  { label: 'Locations', image: 'https://picsum.photos/seed/eldra-char-2/200/200' },
  { label: 'Factions', image: 'https://picsum.photos/seed/eldra-char-3/200/200' },
  { label: 'Items', image: 'https://picsum.photos/seed/eldra-char-4/200/200' },
  { label: 'Magic', image: 'https://picsum.photos/seed/eldra-char-5/200/200' },
  { label: 'History', image: 'https://picsum.photos/seed/eldra-char-6/200/200' }
]

const recentEntries = [
  {
    title: 'The City of Eldoria',
    summary: 'A trade hub built on old imperial foundations, now split by noble intrigue and guild rivalries.',
    image: 'https://picsum.photos/seed/eldra-entry-1/400/200',
    meta: 'Article'
  },
  {
    title: 'Battle of Blackstone Keep',
    summary: 'The turning point in the northern wars, where three banners broke and only one returned intact.',
    image: 'https://picsum.photos/seed/eldra-entry-2/400/200',
    meta: 'Timeline'
  },
  {
    title: 'The Elven Enclave',
    summary: 'A hidden woodland sanctuary where old bloodlines, treaties, and dangerous secrets still survive.',
    image: 'https://picsum.photos/seed/eldra-entry-3/400/200',
    meta: 'Location'
  }
]

const bannerUrl = computed(() => {
  return world.value?.banner_image_url || 'https://picsum.photos/seed/eldra-hero/1600/700'
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

    <section class="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_0.9fr]">
      <div class="rounded-[26px] border border-[#d7c4a0] bg-[#f8f2e8] p-5 shadow-[0_10px_24px_rgba(80,60,30,0.10)]">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-2xl font-semibold text-[#2f2419]">Recent Entries</h2>
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            Latest Activity
          </div>
        </div>

        <div class="space-y-4">
          <article
            v-for="entry in recentEntries"
            :key="entry.title"
            class="group grid grid-cols-[140px_1fr] gap-4 rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-3 transition hover:border-[#cfa85a] hover:bg-[#fffdf8]"
          >
            <div class="overflow-hidden rounded-xl">
              <img
                :src="entry.image"
                :alt="entry.title"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              >
            </div>

            <div class="min-w-0">
              <div class="mb-1 text-xs uppercase tracking-[0.35em] text-[#907a58]">
                {{ entry.meta }}
              </div>

              <h3 class="truncate text-xl font-semibold text-[#2d2318]">
                {{ entry.title }}
              </h3>

              <p class="mt-2 line-clamp-3 text-sm leading-7 text-[#4f4030]">
                {{ entry.summary }}
              </p>
            </div>
          </article>
        </div>
      </div>

      <div class="rounded-[26px] border border-[#d7c4a0] bg-[#f8f2e8] p-5 shadow-[0_10px_24px_rgba(80,60,30,0.10)]">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-2xl font-semibold text-[#2f2419]">Quick Links</h2>
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            Jump Points
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="item in quickLinks"
            :key="item.label"
            class="group overflow-hidden rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] text-left transition hover:border-[#cfa85a] hover:bg-[#fffdf8]"
          >
            <div class="aspect-square overflow-hidden">
              <img
                :src="item.image"
                :alt="item.label"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              >
            </div>

            <div class="px-3 py-2">
              <div class="truncate text-sm font-medium text-[#2f2419]">
                {{ item.label }}
              </div>
            </div>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
