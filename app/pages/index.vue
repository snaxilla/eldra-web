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
  <div class="relative">
    <section class="relative overflow-hidden rounded-[40px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,30,0.72)_0%,rgba(8,14,24,0.52)_100%)] px-8 py-14 sm:px-10 lg:px-14 lg:py-20 gateway-hero-glow">
      <div class="absolute inset-0 opacity-[0.10]">
        <div class="h-full w-full bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] bg-[size:36px_36px]" />
      </div>

      <div class="absolute -left-16 top-10 h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl" />
      <div class="absolute right-0 top-0 h-72 w-72 rounded-full bg-indigo-500/12 blur-3xl" />
      <div class="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />

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
          <div class="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 backdrop-blur">
            Separate worlds
          </div>
          <div class="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 backdrop-blur">
            Play · Run · Build
          </div>
        </div>
      </div>
    </section>

    <section v-if="worlds?.length" class="mt-14 space-y-8">
      <div class="flex items-end justify-between gap-4">
        <div>
          <div class="text-[11px] uppercase tracking-[0.35em] text-slate-500">
            Available Worlds
          </div>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Enter a realm
          </h2>
        </div>

        <div class="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 backdrop-blur">
          {{ worlds.length }} world<span v-if="worlds.length !== 1">s</span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-8 2xl:grid-cols-2">
        <NuxtLink
          v-for="world in worlds"
          :key="world.id"
          :to="worldHref(world)"
          class="group gateway-world-card relative overflow-hidden rounded-[36px] border border-white/10 bg-[#0b1220]/55 transition duration-300 hover:-translate-y-1 hover:border-sky-300/20"
        >
          <div class="relative h-[520px] overflow-hidden">
            <img
              :src="worldImage(world)"
              :alt="world.name"
              class="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
            >

            <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,16,0.18)_0%,rgba(6,10,16,0.40)_34%,rgba(4,8,14,0.88)_100%)]" />

            <div class="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(8,12,18,0.42)_0%,transparent_100%)]" />

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
                    class="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-200 backdrop-blur"
                  >
                    {{ world.visibility }}
                  </div>
                </div>
              </div>

              <div class="mt-10 flex items-center justify-between gap-4">
                <div class="text-[11px] uppercase tracking-[0.38em] text-slate-400">
                  Step through the gate
                </div>

                <div class="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.07] px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition group-hover:border-sky-300/25 group-hover:bg-sky-400/12">
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
      class="mt-14 rounded-[36px] border border-dashed border-white/10 bg-white/[0.03] px-8 py-16 text-center backdrop-blur"
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
