<script setup lang="ts">
const route = useRoute()
const worldId = route.params.id

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
</script>

<template>
  <div class="space-y-8">
    <section class="overflow-hidden rounded-[30px] border border-[#b89a5a]/25 bg-[rgba(30,22,16,0.62)] shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
      <div class="relative h-[290px] md:h-[360px]">
        <img
          src="https://picsum.photos/seed/eldra-hero/1600/700"
          alt="World banner"
          class="h-full w-full object-cover"
        >
        <div class="absolute inset-0 bg-gradient-to-r from-[rgba(20,12,8,0.78)] via-[rgba(20,12,8,0.35)] to-transparent" />
        <div class="absolute inset-0 bg-gradient-to-t from-[rgba(24,16,11,0.85)] via-transparent to-transparent" />

        <div class="absolute inset-x-0 bottom-0 p-8 md:p-10">
          <div class="max-w-4xl">
            <div class="mb-2 text-xs uppercase tracking-[0.45em] text-[#e3d4b2]/70">
              World {{ worldId }}
            </div>

            <h1 class="text-5xl font-semibold tracking-[0.08em] text-[#d6b25e] md:text-7xl">
              NAME
            </h1>

            <p class="mt-4 max-w-2xl text-base leading-7 text-[#f3ecdd]/88">
              A living world of old powers, forgotten roads, contested kingdoms, and stories waiting to be written.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_0.9fr]">
      <div class="rounded-[26px] border border-[#b89a5a]/20 bg-[rgba(28,21,16,0.68)] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-2xl font-semibold text-[#f5efe2]">Recent Entries</h2>
          <div class="text-xs uppercase tracking-[0.35em] text-[#d8c39c]/45">
            Latest Activity
          </div>
        </div>

        <div class="space-y-4">
          <article
            v-for="entry in recentEntries"
            :key="entry.title"
            class="group grid grid-cols-[140px_1fr] gap-4 rounded-2xl border border-[#b89a5a]/12 bg-[rgba(12,9,7,0.45)] p-3 transition hover:border-[#d6b25e]/20 hover:bg-[rgba(12,9,7,0.56)]"
          >
            <div class="overflow-hidden rounded-xl">
              <img
                :src="entry.image"
                :alt="entry.title"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              >
            </div>

            <div class="min-w-0">
              <div class="mb-1 text-xs uppercase tracking-[0.35em] text-[#d8c39c]/45">
                {{ entry.meta }}
              </div>

              <h3 class="truncate text-xl font-semibold text-[#f6f0e4]">
                {{ entry.title }}
              </h3>

              <p class="mt-2 line-clamp-3 text-sm leading-7 text-[#ece2cf]/78">
                {{ entry.summary }}
              </p>
            </div>
          </article>
        </div>
      </div>

      <div class="rounded-[26px] border border-[#b89a5a]/20 bg-[rgba(28,21,16,0.68)] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-2xl font-semibold text-[#f5efe2]">Quick Links</h2>
          <div class="text-xs uppercase tracking-[0.35em] text-[#d8c39c]/45">
            Jump Points
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="item in quickLinks"
            :key="item.label"
            class="group overflow-hidden rounded-2xl border border-[#b89a5a]/15 bg-[rgba(12,9,7,0.45)] text-left transition hover:border-[#d6b25e]/25 hover:bg-[rgba(12,9,7,0.56)]"
          >
            <div class="aspect-square overflow-hidden">
              <img
                :src="item.image"
                :alt="item.label"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              >
            </div>

            <div class="px-3 py-2">
              <div class="truncate text-sm font-medium text-[#f2ead8]">
                {{ item.label }}
              </div>
            </div>
          </button>
        </div>
      </div>
    </section>

    <section class="overflow-hidden rounded-[30px] border border-[#b89a5a]/20 bg-[rgba(28,21,16,0.68)] shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
      <div class="border-b border-[#b89a5a]/15 px-6 py-4">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-semibold text-[#f5efe2]">World Map</h2>
          <div class="text-xs uppercase tracking-[0.35em] text-[#d8c39c]/45">
            Visual Overview
          </div>
        </div>
      </div>

      <div class="relative">
        <img
          src="https://picsum.photos/seed/eldra-map/1600/800"
          alt="World map"
          class="h-[430px] w-full object-cover md:h-[580px]"
        >

        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(20,14,10,0.35)] to-transparent" />

        <div class="absolute left-[18%] top-[58%] rounded-full border border-white/10 bg-black/60 px-3 py-1 text-sm text-[#f6efdf] backdrop-blur">
          Dragonspire Mountains
        </div>

        <div class="absolute left-[42%] top-[68%] rounded-full border border-white/10 bg-black/60 px-3 py-1 text-sm text-[#f6efdf] backdrop-blur">
          Stonehold
        </div>

        <div class="absolute right-[18%] top-[30%] rounded-full border border-white/10 bg-black/60 px-3 py-1 text-sm text-[#f6efdf] backdrop-blur">
          Port of Aedier
        </div>
      </div>
    </section>
  </div>
</template>
