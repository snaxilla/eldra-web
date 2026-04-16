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
  <div class="relative space-y-12 lg:space-y-16">
    <section class="eld-gateway-hero px-8 py-16 sm:px-10 lg:px-14 lg:py-20">
      <div class="relative max-w-5xl">
        <div class="text-[12px] uppercase tracking-[0.42em] text-sky-300/90">
          Eldra Cosmos
        </div>

        <h1 class="mt-5 max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
          Choose a world to enter
        </h1>

        <p class="mt-7 max-w-3xl text-lg leading-9 text-slate-200 sm:text-xl">
          Eldra is a shared universe of separate worlds. Each realm carries its own
          atmosphere, rules, characters, and mysteries. Step through the gateway and
          continue building, playing, or running the story inside it.
        </p>

        <div class="mt-9 flex flex-wrap gap-3">
          <div class="rounded-full border border-sky-300/20 bg-sky-400/10 px-4 py-2 text-sm text-sky-100 backdrop-blur">
            Shared universe
          </div>
          <div class="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm text-slate-100 backdrop-blur">
            Separate worlds
          </div>
          <div class="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm text-slate-100 backdrop-blur">
            Play · Run · Build
          </div>
        </div>
      </div>
    </section>

    <section v-if="worlds?.length" class="space-y-8">
      <div class="flex items-end justify-between gap-4">
        <div>
          <div class="text-[11px] uppercase tracking-[0.35em] text-slate-500">
            Available Worlds
          </div>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Enter a realm
          </h2>
        </div>

        <div class="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-300 backdrop-blur">
          {{ worlds.length }} world<span v-if="worlds.length !== 1">s</span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-10 2xl:grid-cols-2">
        <NuxtLink
          v-for="world in worlds"
          :key="world.id"
          :to="worldHref(world)"
          class="eld-gateway-card group"
        >
          <div class="relative h-[560px] overflow-hidden">
            <img
              :src="worldImage(world)"
              :alt="world.name"
              class="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
            >

            <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,16,0.10)_0%,rgba(6,10,16,0.26)_34%,rgba(4,8,14,0.92)_100%)]" />
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(56,189,248,0.16),transparent_30%)]" />

            <div class="absolute inset-x-0 bottom-0 p-8 sm:p-10">
              <div class="max-w-3xl">
                <div class="text-[11px] uppercase tracking-[0.42em] text-sky-200/80">
                  World
                </div>

                <h3 class="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  {{ world.name }}
                </h3>

                <p class="mt-5 text-base leading-8 text-slate-200 sm:text-lg">
                  {{ worldSubtitle(world) }}
                </p>

                <div class="mt-7 flex flex-wrap gap-2">
                  <div
                    v-if="world.system_key"
                    class="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-sky-100 backdrop-blur"
                  >
                    {{ world.system_key }}
                  </div>

                  <div
                    v-if="world.visibility"
                    class="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-200 backdrop-blur"
                  >
                    {{ world.visibility }}
                  </div>
                </div>
              </div>

              <div class="mt-10 flex items-center justify-between gap-4">
                <div class="text-[11px] uppercase tracking-[0.38em] text-slate-400">
                  Step through the gate
                </div>

                <div class="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.10] px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition group-hover:border-sky-300/25 group-hover:bg-sky-400/12">
                  <span>Enter World</span>
                  <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section
      v-else
      class="rounded-[36px] border border-dashed border-white/10 bg-white/[0.04] px-8 py-16 text-center backdrop-blur"
    >
      <div class="mx-auto max-w-2xl">
        <div class="text-[11px] uppercase tracking-[0.35em] text-slate-500">
          Empty Cosmos
        </div>

        <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">
          No worlds yet
        </h2>

        <p class="mt-4 text-base leading-8 text-slate-300">
          Create your first world and open a new realm for players, lore, characters, and maps.
        </p>
      </div>
    </section>
  </div>
</template>
