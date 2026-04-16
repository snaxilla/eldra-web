<script setup lang="ts">
const { data: worlds } = await useFetch('/api/worlds')

function worldHref(world: any) {
  return `/worlds/${world.id}`
}

function worldImage(world: any) {
  return world?.banner_image_url || world?.sidebar_image_url || 'https://picsum.photos/seed/eldra-world/1600/900'
}

function worldSubtitle(world: any) {
  return (
    world?.subtitle ||
    world?.description ||
    'A distinct realm within the Eldra cosmos, waiting to be explored.'
  )
}
</script>

<template>
  <div class="space-y-8 lg:space-y-10">
    <section class="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_28%),linear-gradient(180deg,#101826_0%,#0b1119_100%)] px-6 py-10 shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:px-8 lg:px-10 lg:py-14">
      <div class="absolute inset-0 opacity-[0.08]">
        <div class="h-full w-full bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <div class="relative max-w-4xl">
        <div class="text-[11px] uppercase tracking-[0.38em] text-sky-300/80">
          Eldra Cosmos
        </div>

        <h1 class="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Choose a world to enter
        </h1>

        <p class="mt-5 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
          Eldra is a shared universe of separate worlds. Each world carries its own history,
          atmosphere, rules, characters, and mysteries. Step into one realm and continue building,
          playing, or running the story inside it.
        </p>

        <div class="mt-8 flex flex-wrap gap-3">
          <div class="rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm text-sky-100">
            Shared universe
          </div>
          <div class="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200">
            Separate worlds
          </div>
          <div class="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200">
            Play · Run · Build
          </div>
        </div>
      </div>
    </section>

    <section
      v-if="worlds?.length"
      class="rounded-[36px] border border-white/10 bg-[#0f1722]/70 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.28)] sm:p-5 lg:p-6"
    >
      <div class="mb-5 flex items-center justify-between gap-4 px-2 sm:px-1">
        <div>
          <div class="text-[11px] uppercase tracking-[0.35em] text-slate-500">
            Available Worlds
          </div>
          <h2 class="mt-2 text-2xl font-semibold tracking-tight text-white">
            Enter a realm
          </h2>
        </div>

        <div class="hidden rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 sm:block">
          {{ worlds.length }} world<span v-if="worlds.length !== 1">s</span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <NuxtLink
          v-for="world in worlds"
          :key="world.id"
          :to="worldHref(world)"
          class="group overflow-hidden rounded-[32px] border border-white/10 bg-[#101826] transition duration-300 hover:-translate-y-1 hover:border-sky-400/25 hover:shadow-[0_22px_50px_rgba(0,0,0,0.36)]"
        >
          <div class="relative h-[260px] overflow-hidden sm:h-[320px]">
            <img
              :src="worldImage(world)"
              :alt="world.name"
              class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            >
            <div class="absolute inset-0 bg-gradient-to-t from-[rgba(8,12,18,0.92)] via-[rgba(8,12,18,0.36)] to-[rgba(8,12,18,0.08)]" />

            <div class="absolute inset-x-0 bottom-0 p-6 sm:p-7">
              <div class="text-[11px] uppercase tracking-[0.38em] text-sky-200/80">
                World
              </div>

              <h3 class="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {{ world.name }}
              </h3>

              <p class="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                {{ worldSubtitle(world) }}
              </p>
            </div>
          </div>

          <div class="flex items-center justify-between gap-4 border-t border-white/8 px-6 py-5 sm:px-7">
            <div class="flex flex-wrap gap-2">
              <div
                v-if="world.system_key"
                class="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-sky-100"
              >
                {{ world.system_key }}
              </div>

              <div
                v-if="world.visibility"
                class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-300"
              >
                {{ world.visibility }}
              </div>
            </div>

            <div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-medium text-white transition group-hover:border-sky-400/25 group-hover:bg-sky-400/10">
              <span>Enter World</span>
              <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section
      v-else
      class="rounded-[36px] border border-dashed border-white/10 bg-[#0f1722]/60 px-6 py-12 text-center shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
    >
      <div class="mx-auto max-w-2xl">
        <div class="text-[11px] uppercase tracking-[0.35em] text-slate-500">
          Empty Cosmos
        </div>

        <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">
          No worlds yet
        </h2>

        <p class="mt-4 text-base leading-8 text-slate-300">
          Create your first world and start building a place for players, characters, maps, and lore.
        </p>
      </div>
    </section>
  </div>
</template>
