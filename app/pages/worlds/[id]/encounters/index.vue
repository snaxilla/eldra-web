<script setup lang="ts">
// Encounters -- the Encounter Management System's DM entry point. Lists
// every Encounter in this World and creates new ones.
//
// Reuses GET /api/worlds/:id/entities?type=encounter&summary=1 verbatim --
// an Encounter is its own `entities` row (server/utils/encounter-persistence.ts's
// own header), so the already-generic entities list route needs no change
// to list them. This page performs no encounter-specific computation of its
// own: creating calls POST /api/worlds/:id/encounters
// (server/utils/encounter-actions.ts's `createEncounter`) and this page
// only routes to the result.

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))

type EncounterSummary = {
  id: string | number
  title: string
  status?: string
}

const { data: encounters, pending, refresh } = await useFetch<EncounterSummary[]>(
  () => `/api/worlds/${worldId.value}/entities?type=encounter&summary=1`,
  { default: () => [] }
)

const title = ref('')
const creating = ref(false)
const createError = ref('')

function encounterUrl(encounter: EncounterSummary) {
  return `/worlds/${worldId.value}/encounters/${encounter.id}`
}

async function createEncounter() {
  if (creating.value) return
  const trimmed = title.value.trim()
  if (!trimmed) {
    createError.value = 'Encounter title is required.'
    return
  }

  creating.value = true
  createError.value = ''

  try {
    const res = await $fetch<{ success: true; encounter: { id: string; title: string } }>(
      `/api/worlds/${worldId.value}/encounters`,
      { method: 'POST', body: { title: trimmed } }
    )
    title.value = ''
    await router.push(encounterUrl(res.encounter))
  } catch (error: any) {
    createError.value =
      error?.data?.statusMessage || error?.statusMessage || 'Could not create encounter.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1100px] p-6">
      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-6 backdrop-blur-xl">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Encounter Management</div>
            <h1 class="mt-3 text-4xl font-semibold tracking-tight text-white">Encounters</h1>
            <p class="mt-2 max-w-3xl text-sm leading-7 text-[#d8ceb8]">
              Track initiative, round, and whose turn it is. Combat Resolution itself still happens on
              each character's own Actions panel -- this page only organizes the battle around it.
            </p>
          </div>

          <button
            type="button"
            class="eldra-button rounded-none px-4 py-2 text-sm"
            @click="refresh"
          >
            Refresh
          </button>
        </div>

        <div class="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            v-model="title"
            class="eldra-input min-h-11 rounded-none px-4 py-3 text-sm"
            placeholder="New encounter title, e.g. Goblin Ambush"
            @keyup.enter="createEncounter"
          >
          <button
            type="button"
            class="eldra-button min-h-11 rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
            :disabled="creating"
            @click="createEncounter"
          >
            {{ creating ? 'Creating…' : 'Create Encounter' }}
          </button>
        </div>

        <div
          v-if="createError"
          class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {{ createError }}
        </div>
      </section>

      <section class="mt-6">
        <div
          v-if="pending"
          class="eldra-ornate-panel eldra-frame-corners rounded-none border p-8 text-center text-[#d8ceb8]"
        >
          Loading encounters...
        </div>

        <div
          v-else-if="!encounters?.length"
          class="eldra-ornate-panel eldra-frame-corners rounded-none border p-10 text-center"
        >
          <div class="text-xl font-semibold text-white">No encounters yet</div>
          <p class="mt-2 text-sm text-[#9f9278]">
            Create one above to start tracking initiative and turns.
          </p>
        </div>

        <div
          v-else
          class="grid gap-4 sm:grid-cols-2"
        >
          <NuxtLink
            v-for="encounter in encounters"
            :key="encounter.id"
            :to="encounterUrl(encounter)"
            class="eldra-ornate-panel eldra-frame-corners block rounded-none border p-5 backdrop-blur-xl"
          >
            <h2 class="break-words text-xl font-semibold text-white">
              {{ encounter.title }}
            </h2>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
