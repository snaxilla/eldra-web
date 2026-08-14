<script setup lang="ts">
import WorldCreateModal from '~/components/world/WorldCreateModal.vue'
import { useAuth } from '~/composables/useAuth'

// GET /api/worlds is intentionally still gated by the Phase 0 deny-by-default
// middleware (server/middleware/authorize.ts) -- it stays that way; see this
// task's own ISSUE 1 ("Do NOT make GET /api/worlds public"). An anonymous
// visitor must never even ATTEMPT that request, so auth state is resolved
// FIRST, and the fetch below only ever fires when it's already known to
// succeed. Same `if (!state.value.ready) await fetchMe()` sequencing
// app/middleware/auth.ts and app/plugins/auth-init.client.ts already use --
// fetchMe() forwards the incoming request's cookie during SSR (useAuth.ts),
// so this resolves correctly on the very first server-rendered response,
// not just after client-side hydration.
const { state, fetchMe } = useAuth()

if (!state.value.ready) {
  await fetchMe()
}

const isAuthenticated = computed(() => state.value.authenticated)

// `immediate: isAuthenticated.value` is read once, here, after the await
// above -- not reactively -- so this never issues the request for a
// signed-out visitor (no 401 round-trip, no "attempt" at all), while still
// calling useFetch unconditionally (consistent composable usage, SSR-safe
// hydration) rather than skipping the call itself.
const { data: worlds, refresh: refreshWorlds } = await useFetch('/api/worlds', {
  immediate: isAuthenticated.value
})

const createWorldOpen = ref(false)

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

// On success: refresh the World list (so a later back-navigation to this
// page already shows it, per this task's own ON SUCCESS requirement), then
// navigate straight into the new World. navigateTo is client-side routing
// -- no page refresh, no full reload.
async function onWorldCreated(world: { id: string | number; slug: string }) {
  await refreshWorlds()
  await navigateTo(worldHref(world))
}
</script>

<template>
  <div class="relative min-h-[calc(100vh-3.5rem)]">
    <WorldChooserThpace />

    <div
      v-if="isAuthenticated"
      class="relative z-10 space-y-12 lg:space-y-16"
    >
      <section class="relative overflow-hidden rounded-[40px] border border-white/10 bg-[rgba(4,9,22,0.40)] shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div class="relative px-8 py-16 sm:px-10 lg:px-14 lg:py-20">
          <div class="max-w-5xl">
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

            <div class="mt-9 flex flex-wrap items-center gap-3">
              <div class="rounded-full border border-sky-300/20 bg-sky-400/10 px-4 py-2 text-sm text-sky-100 backdrop-blur">
                Shared universe
              </div>
              <div class="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm text-slate-100 backdrop-blur">
                Separate worlds
              </div>
              <div class="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm text-slate-100 backdrop-blur">
                Play · Run · Build
              </div>

              <button
                type="button"
                class="ml-1 inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400/25"
                @click="createWorldOpen = true"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="h-4 w-4"
                />
                <span>Create World</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-if="worlds?.length" class="space-y-8">
        <div class="flex items-end justify-between gap-4">
          <div>
            <div class="text-[11px] uppercase tracking-[0.35em] text-slate-400">
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
            class="group relative overflow-hidden rounded-[36px] border border-white/12 bg-[rgba(8,16,27,0.48)] shadow-[0_24px_80px_rgba(0,0,0,0.50)] backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-sky-300/25"
          >
            <div class="relative h-[560px] overflow-hidden">
              <img
                :src="worldImage(world)"
                :alt="world.name"
                class="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
              >

              <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,16,0.08)_0%,rgba(6,10,16,0.24)_34%,rgba(4,8,14,0.94)_100%)]" />
              <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(56,189,248,0.14),transparent_30%)]" />

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

          <button
            type="button"
            class="mt-7 inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400/25"
            @click="createWorldOpen = true"
          >
            <UIcon
              name="i-lucide-plus"
              class="h-4 w-4"
            />
            <span>Create World</span>
          </button>
        </div>
      </section>
    </div>

    <!--
      Signed-out experience -- this task's own ISSUE 1/SIGNED-OUT EXPERIENCE.
      GET /api/worlds stays protected (never called above when
      !isAuthenticated, per the script's `immediate` guard); this section
      exists specifically so the page says WHY nothing is shown, instead of
      falling through to the authenticated branch's "No worlds yet" empty
      state, which would misleadingly imply zero Worlds exist rather than
      "you are not signed in."  No World metadata, no Create World entry
      point -- both require an authenticated session this visitor doesn't
      have.
    -->
    <div
      v-else
      class="relative z-10 flex min-h-[calc(100vh-3.5rem)] items-center justify-center"
    >
      <section class="relative w-full max-w-2xl overflow-hidden rounded-[40px] border border-white/10 bg-[rgba(4,9,22,0.40)] px-8 py-16 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:px-14 sm:py-20">
        <div class="text-[12px] uppercase tracking-[0.42em] text-sky-300/90">
          Eldra Cosmos
        </div>

        <h1 class="mt-5 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
          Welcome to Eldra
        </h1>

        <p class="mt-7 text-lg leading-9 text-slate-200">
          Worlds are private by default. Sign in to continue into the realms
          you're part of.
        </p>

        <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
          <NuxtLink
            to="/login"
            class="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400/25"
          >
            <UIcon
              name="i-lucide-log-in"
              class="h-4 w-4"
            />
            <span>Sign In</span>
          </NuxtLink>

          <button
            type="button"
            disabled
            class="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-slate-400 opacity-50"
          >
            <UIcon
              name="i-lucide-user-plus"
              class="h-4 w-4"
            />
            <span>Create Account (coming soon)</span>
          </button>
        </div>
      </section>
    </div>

    <WorldCreateModal
      v-if="isAuthenticated"
      v-model:open="createWorldOpen"
      @created="onWorldCreated"
    />

    <a
      href="https://github.com/ImBaedin/Thpace"
      target="_blank"
      rel="noreferrer"
      class="fixed bottom-3 right-4 z-20 text-[10px] uppercase tracking-[0.24em] text-slate-500 transition hover:text-slate-300"
    >
      bg by thpace
    </a>
  </div>
</template>
