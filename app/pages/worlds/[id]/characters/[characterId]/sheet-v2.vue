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
//
// ---------------------------------------------------------------------------
// PHASE 2: THE SAME MODELS THE BUILDER SHOWED
// ---------------------------------------------------------------------------
// Each resolved slot's placeholder card (source book + package id, and
// nothing else) is replaced by the resolved presentation model the Content
// Pack publishes, rendered through the SAME component the Character Builder
// previews with (~/components/characters/ContentPresentationPanel.vue).
//
// Builder and Sheet are two contexts on one model, not two renderings of one
// idea: what a player read while choosing a Species is exactly what they read
// afterwards on the sheet, down to the wording, because it is the same
// component fed by the same resolver.
//
// Provenance stays on the card and does NOT move into the panel: which pack
// and version an entry resolved through is a fact about this character's
// binding, not about the Species, and it is what makes a later "missing"
// state intelligible.
//
// This page still holds no concept of Content Packs' internals, 5etools, or
// `data` -- `entry.presentation` arrives already resolved from the assembly
// endpoint, which gets it from the World Content Catalogue.

import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import type { PresentationEntry } from '~/lib/content-presentation'

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
  // Optional and nullable for the same reasons the catalogue's own field is
  // -- a pack from a system with no resolver, or an entry whose published
  // `data` could not be read. The sheet still renders identity and
  // provenance in that case; it never fails.
  presentation?: PresentationEntry | null
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
    <!-- max-w-4xl rather than 3xl: the cards now carry trait prose and
         two-column fact grids, not two lines of provenance. px-4 on phones
         keeps those same cards readable with no horizontal scroll. -->
    <div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
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
            <!-- When the pack publishes details, the panel supplies the name
                 and source line itself; the bare title is the fallback for an
                 entry that resolved but carries no presentation model. -->
            <div
              v-if="!section.slot.entry.presentation"
              class="mt-2 break-words text-xl font-semibold text-white"
            >
              {{ section.slot.entry.title }}
            </div>

            <div class="mt-2">
              <ContentPresentationPanel
                :entry="section.slot.entry.presentation"
                context="detail"
                :empty-message="`This Content Pack publishes no further details for this ${section.label.toLowerCase()}.`"
              />
            </div>

            <!-- Which bound pack this choice resolved through -- a fact about
                 this character, not about the Species/Class/Background. -->
            <p class="mt-4 break-words border-t border-[rgba(201,164,90,0.14)] pt-3 text-xs text-[#6f6754]">
              Resolved from {{ section.slot.entry.packageId }}@{{ section.slot.entry.packageVersion }}
            </p>
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
