<script setup lang="ts">
import WorldCreateModal from '~/components/world/WorldCreateModal.vue'
import { useAuth } from '~/composables/useAuth'
import { resolveWorldSelectionState } from '~/utils/worldSelectionState'

// Authentication Flow Cleanup -- this page (the World Selection page,
// "Choose a world to enter") is now gated by the project's own canonical
// `auth` middleware (app/middleware/auth.ts), same as every other
// protected route. An unauthenticated request is redirected to
// `/login?redirect=/` during route resolution, BEFORE this component's own
// setup ever runs -- so by the time the code below executes, authentication
// is already known to have succeeded. This replaces the page's previous,
// bespoke "render an inline signed-out card instead of the real page"
// branch, which was a second, divergent auth-gating path outside the
// middleware every other protected page already uses.
definePageMeta({
  middleware: 'auth'
})

const { state, fetchMe } = useAuth()

if (!state.value.ready) {
  await fetchMe()
}

// GET /api/worlds is intentionally still gated by the Phase 0 deny-by-default
// middleware (server/middleware/authorize.ts) -- it stays that way. The
// `auth` middleware above already guarantees this request only ever fires
// for an authenticated visitor, so it is called unconditionally here (no
// `immediate` gate needed) like any other page's own `useFetch` call.
const { data: worlds, pending: worldsPending, error: worldsError, refresh: refreshWorlds } = await useFetch('/api/worlds')

// WORLD SELECTION DATA STATES -- see worldSelectionState.ts's own header
// for why this is a pure, separately-tested function rather than inline
// template conditionals: it is the one place that decides whether "No
// worlds yet" is allowed to render at all.
const selectionState = computed(() =>
  resolveWorldSelectionState({
    authReady: state.value.ready,
    authenticated: state.value.authenticated,
    worldsPending: worldsPending.value,
    worldsError: !!worldsError.value,
    worldsCount: worlds.value?.length ?? 0
  })
)

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
      v-if="selectionState === 'populated' || selectionState === 'empty' || selectionState === 'loading' || selectionState === 'error'"
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

      <section v-if="selectionState === 'populated'" class="space-y-8">
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
            {{ worlds?.length }} world<span v-if="worlds?.length !== 1">s</span>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-10 2xl:grid-cols-2">
          <NuxtLink
            v-for="world in worlds ?? []"
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

      <!--
        LOADING -- CRITICAL EMPTY-STATE RULE: while /api/worlds is still
        pending, this branch (not "empty") is what renders, so a slow
        request can never read as "you own zero Worlds."
      -->
      <section
        v-else-if="selectionState === 'loading'"
        class="rounded-[36px] border border-dashed border-white/10 bg-white/[0.04] px-8 py-16 text-center backdrop-blur"
      >
        <div class="mx-auto max-w-2xl">
          <div class="text-[11px] uppercase tracking-[0.35em] text-slate-500">
            Eldra Cosmos
          </div>

          <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">
            Loading your Worlds…
          </h2>
        </div>
      </section>

      <!--
        ERROR -- CRITICAL EMPTY-STATE RULE: a failed /api/worlds request
        (including a stale/rejected session -- see the DEPLOYMENT / STALE
        SESSION CASE this state also exists for) must never be silently
        presented as "No worlds yet." Offers a retry via the SAME
        `refreshWorlds` the Create World flow already uses, not a full
        page reload.
      -->
      <section
        v-else-if="selectionState === 'error'"
        class="rounded-[36px] border border-dashed border-white/10 bg-white/[0.04] px-8 py-16 text-center backdrop-blur"
      >
        <div class="mx-auto max-w-2xl">
          <div class="text-[11px] uppercase tracking-[0.35em] text-slate-500">
            Something went wrong
          </div>

          <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">
            Couldn't load your Worlds
          </h2>

          <p class="mt-4 text-base leading-8 text-slate-300">
            This is a loading error, not an empty account -- your Worlds are still there.
          </p>

          <button
            type="button"
            class="mt-7 inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400/25"
            @click="refreshWorlds()"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              class="h-4 w-4"
            />
            <span>Try again</span>
          </button>
        </div>
      </section>

      <!--
        EMPTY -- the ONLY state that may say "No worlds yet" (this task's
        own CRITICAL EMPTY-STATE RULE): reached only once auth is resolved,
        authenticated, loading has finished, and the request succeeded.
      -->
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
      Authentication Flow Cleanup -- an unauthenticated visitor is now
      redirected to /login by the `auth` middleware above BEFORE this
      component's own setup runs (see this file's own header comment), so
      this branch is a defensive fallback for the brief `auth-unresolved`
      moment (or a genuinely unreachable-in-practice `unauthenticated` one)
      rather than a full second sign-in experience -- maintaining a whole
      parallel "you're signed out" page here would just be the same
      divergent auth-gating path this cleanup removed, rebuilt one level
      down. Deliberately minimal: it exists to never flash a false "No
      worlds yet," not to be seen.
    -->
    <div
      v-else
      class="relative z-10 flex min-h-[calc(100vh-3.5rem)] items-center justify-center"
    >
      <div class="text-sm uppercase tracking-[0.3em] text-slate-500">
        Loading…
      </div>
    </div>

    <WorldCreateModal
      v-if="selectionState === 'populated' || selectionState === 'empty'"
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
