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
  <div class="space-y-6">
    <section class="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
      <div class="relative h-[260px] md:h-[320px]">
        <img
          src="https://picsum.photos/seed/eldra-hero/1600/700"
          alt="World banner"
          class="h-full w-full object-cover"
        >
        <div class="absolute inset-0 bg-gradient-to-t from-[#08111f] via-[#08111f]/45 to-black/20" />

        <div class="absolute inset-x-0 bottom-0 p-6 md:p-8">
          <div class="max-w-4xl">
            <div class="mb-2 text-xs uppercase tracking-[0.4em] text-white/50">
              World {{ worldId }}
            </div>

            <h1 class="text-4xl font-semibold tracking-[0.06em] text-[#d6b25e] md:text-6xl">
              NAME
            </h1>

            <p class="mt-3 max-w-2xl text-sm leading-6 text-white/75 md:text-base">
              A living world of old powers, forgotten roads, contested kingdoms, and stories waiting to be written.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_0.9fr]">
      <div class="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-semibold text-white">Recent Entries</h2>
          <div class="text-xs uppercase tracking-[0.3em] text-white/35">
            Latest activity
          </div>
        </div>

        <div class="space-y-4">
          <article
            v-for="entry in recentEntries"
            :key="entry.title"
            class="group grid grid-cols-[120px_1fr] gap-4 rounded-2xl border border-white/8 bg-black/20 p-3 transition hover:border-white/15 hover:bg-black/25"
          >
            <div class="overflow-hidden rounded-xl">
              <img
                :src="entry.image"
                :alt="entry.title"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              >
            </div>

            <div class="min-w-0">
              <div class="mb-1 text-xs uppercase tracking-[0.3em] text-white/35">
                {{ entry.meta }}
              </div>

              <h3 class="truncate text-lg font-semibold text-white">
                {{ entry.title }}
              </h3>

              <p class="mt-2 line-clamp-3 text-sm leading-6 text-white/70">
                {{ entry.summary }}
              </p>
            </div>
          </article>
        </div>
      </div>

      <div class="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-semibold text-white">Quick Links</h2>
          <div class="text-xs uppercase tracking-[0.3em] text-white/35">
            Jump points
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="item in quickLinks"
            :key="item.label"
            class="group overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left transition hover:border-white/20 hover:bg-black/25"
          >
            <div class="aspect-square overflow-hidden">
              <img
                :src="item.image"
                :alt="item.label"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              >
            </div>

            <div class="px-3 py-2">
              <div class="truncate text-sm font-medium text-white/85">
                {{ item.label }}
              </div>
            </div>
          </button>
        </div>
      </div>
    </section>

    <section class="overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div class="border-b border-white/10 px-5 py-4">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-white">World Map</h2>
          <div class="text-xs uppercase tracking-[0.3em] text-white/35">
            Visual overview
          </div>
        </div>
      </div>

      <div class="relative">
        <img
          src="https://picsum.photos/seed/eldra-map/1600/800"
          alt="World map"
          class="h-[420px] w-full object-cover md:h-[560px]"
        >

        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08111f]/30 to-transparent" />

        <div class="absolute left-[18%] top-[58%] rounded-full bg-black/60 px-3 py-1 text-sm text-white backdrop-blur">
          Dragonspire Mountains
        </div>

        <div class="absolute left-[42%] top-[68%] rounded-full bg-black/60 px-3 py-1 text-sm text-white backdrop-blur">
          Stonehold
        </div>

        <div class="absolute right-[18%] top-[30%] rounded-full bg-black/60 px-3 py-1 text-sm text-white backdrop-blur">
          Port of Aedier
        </div>
      </div>
    </section>
  </div>
</template>
