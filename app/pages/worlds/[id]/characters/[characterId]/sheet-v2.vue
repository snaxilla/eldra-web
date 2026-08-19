<script setup lang="ts">
// Character Sheet V2 -- Phase 1. See server/utils/character-assembly.ts and
// server/api/worlds/[id]/characters/[characterId]/assembly.get.ts for the
// design this renders. This page consumes ONLY
// GET /api/worlds/:id/characters/:characterId/assembly -- it holds no
// concept of Content Packs, bindings, the Catalogue, the importer, or
// 5etools; those abstractions are already resolved away behind the
// assembly endpoint by the time this page ever sees a response. Deliberately
// separate from entities/[entityId]/sheet.vue (V1, which reads World
// Entities and a character_sheets row) -- this page never calls
// /entities or /character_sheets. This is an inspection surface only: no
// ability scores, equipment, spellcasting, actions, notes, or editing (this
// task's own NON-GOALS) -- just Name/Species/Class/Background, rendered
// exactly as Assembly resolved them, including "missing" when it did not.

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const characterId = computed(() => String(route.params.characterId || ''))

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

type AssemblySlot =
  | { status: 'resolved'; entry: CatalogueEntry }
  | { status: 'missing'; packageId: string; slug: string; reason: string }

type AssemblyBlueprint = {
  worldId: string
  characterId: string
  characterTitle: string
  species: AssemblySlot
  class: AssemblySlot
  background: AssemblySlot
}

type AssemblyResponse =
  | { available: true; blueprint: AssemblyBlueprint }
  | { available: false; reason: string; message?: string }

const {
  data: assembly,
  pending,
  error
} = await useFetch<AssemblyResponse>(() => `/api/worlds/${worldId.value}/characters/${characterId.value}/assembly`)

const blueprint = computed(() => (assembly.value?.available ? assembly.value.blueprint : null))

const notAvailableMessage = computed(() => {
  if (!assembly.value || assembly.value.available) return ''
  return assembly.value.message || 'This character has nothing for Character Sheet V2 to assemble yet.'
})

const errorMessage = computed(() => {
  if (!error.value) return ''
  const statusCode = (error.value as any)?.statusCode
  if (statusCode === 404) {
    return 'This character could not be found in this World.'
  }
  return 'Could not load this character. Try again shortly.'
})

const SECTION_LABELS: Record<'species' | 'class' | 'background', string> = {
  species: 'Species',
  class: 'Class',
  background: 'Background'
}

const sections = computed(() => {
  if (!blueprint.value) return []
  const current = blueprint.value

  return (['species', 'class', 'background'] as const).map((key) => ({
    key,
    label: SECTION_LABELS[key],
    slot: current[key]
  }))
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-3xl px-6 py-10">
      <div class="eldra-kicker text-xs">
        Character Sheet · V2 (Inspection)
      </div>
      <h1 class="eldra-title mt-2 text-3xl font-semibold">
        {{ blueprint?.characterTitle || 'Character Sheet' }}
      </h1>
      <p class="mt-2 max-w-2xl text-sm text-[#d8ceb8]">
        A read-only view of this character's assembled Species, Class, and Background, resolved live against this World's current Content Catalogue.
      </p>

      <NuxtLink
        :to="`/worlds/${worldId}/characters`"
        class="mt-4 inline-block text-sm text-[#9f9278] hover:text-[#d8ceb8]"
      >
        &larr; Back to Characters
      </NuxtLink>

      <div
        v-if="pending"
        class="mt-8 text-sm text-[#9f9278]"
      >
        Loading this character's Assembly…
      </div>

      <div
        v-else-if="error"
        class="mt-8 rounded-none border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
      >
        {{ errorMessage }}
      </div>

      <div
        v-else-if="assembly && !assembly.available"
        class="mt-8 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-4 text-sm text-[#d8ceb8]"
      >
        {{ notAvailableMessage }}
      </div>

      <div
        v-else-if="blueprint"
        class="mt-8 grid gap-4"
      >
        <section
          v-for="section in sections"
          :key="section.key"
          class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            {{ section.label }}
          </div>

          <template v-if="section.slot.status === 'resolved'">
            <div class="mt-2 text-xl font-semibold text-white">
              {{ section.slot.entry.title }}
            </div>
            <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt class="text-[#9f9278]">
                Source Book
              </dt>
              <dd class="text-[#d8ceb8]">
                {{ section.slot.entry.sourceBook || '—' }}
              </dd>

              <dt class="text-[#9f9278]">
                Package
              </dt>
              <dd class="text-[#d8ceb8]">
                {{ section.slot.entry.packageId }}@{{ section.slot.entry.packageVersion }}
              </dd>
            </dl>
          </template>

          <template v-else>
            <div class="mt-2 rounded-none border border-red-900 bg-red-950/40 p-3">
              <div class="text-sm font-semibold uppercase tracking-[0.1em] text-red-300">
                Missing
              </div>
              <p class="mt-1 text-sm text-red-200">
                {{ section.slot.reason }}
              </p>
              <dl
                v-if="section.slot.packageId"
                class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs"
              >
                <dt class="text-red-300/70">
                  Package
                </dt>
                <dd class="text-red-200">
                  {{ section.slot.packageId }}
                </dd>
              </dl>
            </div>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>
