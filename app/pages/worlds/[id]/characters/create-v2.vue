<script setup lang="ts">
// Character Creation V2 -- the first Character Creation workflow driven
// entirely by the World Content Catalogue (GET /api/worlds/:id/catalogue).
// See server/api/worlds/[id]/characters/create-v2.post.ts for the save
// side. Deliberately separate from characters/builder.vue (V1), which
// reads World Entities (GET /api/worlds/:id/entities) for its
// species/class/background options -- this page never calls that endpoint
// or any /entities route. Selection only: no ability scores, no equipment,
// no rules evaluation, no sheet -- this is not the Character Sheet. On
// success this navigates to Character Sheet V2
// (characters/[characterId]/sheet-v2.vue) -- this flow's own natural next
// step, rendering exactly what was just recorded via the Assembly endpoint.

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

type CatalogueEntry = {
  packageId: string
  packageVersion: string
  systemKey: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
}

type WorldCatalogue = {
  worldId: string
  packs: Array<{ ok: boolean; packageId: string; version: string }>
  species: CatalogueEntry[]
  classes: CatalogueEntry[]
  backgrounds: CatalogueEntry[]
  feats: CatalogueEntry[]
  items: CatalogueEntry[]
  spells: CatalogueEntry[]
}

const { data: catalogue, pending: catalogueLoading, error: catalogueError } = await useFetch<WorldCatalogue>(
  () => `/api/worlds/${worldId.value}/catalogue`
)

// Every option below comes from the fetched catalogue -- nothing here is a
// literal list of species/classes/backgrounds.
const speciesOptions = computed(() => catalogue.value?.species ?? [])
const classOptions = computed(() => catalogue.value?.classes ?? [])
const backgroundOptions = computed(() => catalogue.value?.backgrounds ?? [])

const hasAnyBoundPack = computed(() => (catalogue.value?.packs?.length ?? 0) > 0)
const catalogueIsEmpty = computed(() =>
  !catalogueLoading.value &&
  speciesOptions.value.length === 0 &&
  classOptions.value.length === 0 &&
  backgroundOptions.value.length === 0
)

const name = ref('')
const selectedSpeciesSlug = ref('')
const selectedClassSlug = ref('')
const selectedBackgroundSlug = ref('')

const selectedSpecies = computed(() => speciesOptions.value.find((entry) => entry.slug === selectedSpeciesSlug.value) ?? null)
const selectedClass = computed(() => classOptions.value.find((entry) => entry.slug === selectedClassSlug.value) ?? null)
const selectedBackground = computed(() => backgroundOptions.value.find((entry) => entry.slug === selectedBackgroundSlug.value) ?? null)

const canCreate = computed(() =>
  Boolean(name.value.trim() && selectedSpecies.value && selectedClass.value && selectedBackground.value)
)

const creating = ref(false)
const createErrorMessage = ref('')

function selectionPayload(entry: CatalogueEntry) {
  return {
    packageId: entry.packageId,
    slug: entry.slug,
    title: entry.title,
    externalId: entry.externalId
  }
}

async function createCharacter() {
  if (!canCreate.value || creating.value) {
    return
  }

  creating.value = true
  createErrorMessage.value = ''

  try {
    const created = await $fetch<{ id?: string | number }>(`/api/worlds/${worldId.value}/characters/create-v2`, {
      method: 'POST',
      body: {
        title: name.value.trim(),
        species: selectionPayload(selectedSpecies.value!),
        class: selectionPayload(selectedClass.value!),
        background: selectionPayload(selectedBackground.value!)
      }
    })

    // Character Sheet V2 (sheet-v2.vue) is this flow's own natural next
    // step -- it renders exactly what was just recorded. Falls back to the
    // roster if the create response carries no id for some reason.
    if (created?.id) {
      await navigateTo(`/worlds/${worldId.value}/characters/${created.id}/sheet-v2`)
    } else {
      await navigateTo(`/worlds/${worldId.value}/characters`)
    }
  } catch (error: any) {
    createErrorMessage.value =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      'Failed to create character'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-2xl px-6 py-10">
      <div class="eldra-kicker text-xs">Character Creation</div>
      <h1 class="eldra-title mt-2 text-3xl font-semibold">Create Character</h1>
      <p class="mt-2 text-sm text-[#d8ceb8]">
        Choose a Species, Class, and Background from this World's bound Content Packs.
      </p>

      <div v-if="catalogueLoading" class="mt-8 text-sm text-[#9f9278]">
        Loading the World's Content Catalogue…
      </div>

      <div
        v-else-if="catalogueError"
        class="mt-8 rounded-none border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
      >
        Could not load this World's Content Catalogue. Try again shortly.
      </div>

      <div
        v-else-if="catalogueIsEmpty"
        class="mt-8 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-4 text-sm text-[#d8ceb8]"
      >
        <template v-if="!hasAnyBoundPack">
          This World has no Content Packs bound yet. Bind one from Game Admin before creating a character.
        </template>
        <template v-else>
          This World's bound Content Packs contain no Species, Classes, or Backgrounds yet.
        </template>
      </div>

      <form v-else class="mt-8 space-y-6" @submit.prevent="createCharacter">
        <div>
          <label class="mb-2 block text-sm text-[#d8ceb8]">Character Name</label>
          <input
            v-model="name"
            type="text"
            required
            placeholder="Character name"
            class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-4 py-2.5 text-sm text-[#fff7df] outline-none focus:border-[rgba(201,164,90,0.58)]"
          />
        </div>

        <div>
          <label class="mb-2 block text-sm text-[#d8ceb8]">Species</label>
          <select
            v-model="selectedSpeciesSlug"
            required
            :disabled="speciesOptions.length === 0"
            class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-4 py-2.5 text-sm text-[#fff7df] outline-none focus:border-[rgba(201,164,90,0.58)]"
          >
            <option value="" disabled>
              {{ speciesOptions.length === 0 ? 'No Species available' : 'Choose a Species' }}
            </option>
            <option v-for="entry in speciesOptions" :key="`${entry.packageId}:${entry.slug}`" :value="entry.slug">
              {{ entry.title }}
            </option>
          </select>
        </div>

        <div>
          <label class="mb-2 block text-sm text-[#d8ceb8]">Class</label>
          <select
            v-model="selectedClassSlug"
            required
            :disabled="classOptions.length === 0"
            class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-4 py-2.5 text-sm text-[#fff7df] outline-none focus:border-[rgba(201,164,90,0.58)]"
          >
            <option value="" disabled>
              {{ classOptions.length === 0 ? 'No Classes available' : 'Choose a Class' }}
            </option>
            <option v-for="entry in classOptions" :key="`${entry.packageId}:${entry.slug}`" :value="entry.slug">
              {{ entry.title }}
            </option>
          </select>
        </div>

        <div>
          <label class="mb-2 block text-sm text-[#d8ceb8]">Background</label>
          <select
            v-model="selectedBackgroundSlug"
            required
            :disabled="backgroundOptions.length === 0"
            class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-4 py-2.5 text-sm text-[#fff7df] outline-none focus:border-[rgba(201,164,90,0.58)]"
          >
            <option value="" disabled>
              {{ backgroundOptions.length === 0 ? 'No Backgrounds available' : 'Choose a Background' }}
            </option>
            <option v-for="entry in backgroundOptions" :key="`${entry.packageId}:${entry.slug}`" :value="entry.slug">
              {{ entry.title }}
            </option>
          </select>
        </div>

        <p v-if="createErrorMessage" class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {{ createErrorMessage }}
        </p>

        <div class="flex items-center gap-3">
          <button
            type="submit"
            class="eldra-button rounded-none px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!canCreate || creating"
          >
            {{ creating ? 'Creating…' : 'Create' }}
          </button>

          <NuxtLink :to="`/worlds/${worldId}/characters`" class="text-sm text-[#9f9278] hover:text-[#d8ceb8]">
            Cancel
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
