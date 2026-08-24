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
//
// ---------------------------------------------------------------------------
// RULES ENGINE INTEGRATION (rules-package-architecture.md §13.1)
// ---------------------------------------------------------------------------
// The ability score panel is replaced by DERIVED output: ability modifiers,
// proficiency bonus, and saving throw / skill proficiencies, all read from
// GET /api/worlds/:id/characters/:characterId/derived.
//
// NOT ONE OF THOSE NUMBERS IS COMPUTED HERE. This page performs no
// arithmetic at all -- it fetches a projection and renders it. The engine
// calculated every value; the bridge supplied every input; this file chose
// only where things sit on screen.
//
// It also names no ability, skill, or Definition ID. It selects which
// CATEGORIES to render (§13.2: "Sheet regions address Rule Categories"),
// which is the agnostic vocabulary -- a package that declares no
// `core.skills` definitions simply produces no skills region, with no
// configuration and no per-system code.
//
// Two absences are legal and rendered as such, never as errors: a World with
// no Rules Package activated, and a package that is activated but broken.
// Those are distinct states and the sheet says which.
//
// ---------------------------------------------------------------------------
// PHASE 3: IDENTITY AND ABILITY SCORES
// ---------------------------------------------------------------------------
// The placeholder identity section (a bare title and a sentence explaining
// the page) is replaced by a real one: Name, then Species / Class /
// Background at a glance, then the six ability scores.
//
// VALUES ONLY. This page displays what the character HAS and derives nothing
// from it -- no modifier beside a score, no saving throw, no skill bonus, no
// armour class, no hit points, no initiative. Every one of those is the Rules
// Engine's (app/lib/rules/**), which this page does not import and must not
// reimplement. When they arrive, they arrive as data.
//
// The Sheet DISPLAYS; the Builder EDITS. There is no inline editing here --
// the ability scores link out to the Builder's own editing surface
// (.../[characterId]/abilities), which is also the path by which a character
// created before Phase 3 acquires scores at all.
//
// The identity summary is composed inline rather than extracted into a
// component: it is used by exactly this one page. The ability scores ARE
// extracted (CharacterAbilityScoresPanel), because the Builder's review step
// renders the same panel -- the same test ContentPresentationPanel passed.

import CharacterAbilityScoresPanel from '~/components/characters/CharacterAbilityScoresPanel.vue'
import CharacterDerivedPanel from '~/components/characters/CharacterDerivedPanel.vue'
import { DERIVED_SHEET_REGIONS, type DerivedCharacterResponse } from '~/components/characters/characterDerivedValues'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import type { StoredAbilityScores } from '~/lib/characters/ability-scores'
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
  // null for every character created before Phase 3 -- a real state, shown
  // as "not assigned yet" with a link to assign them, never as an error.
  abilityScores: StoredAbilityScores | null
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

// ---------------------------------------------------------------------------
// Derived values -- fetched, never computed. See this file's header.
// ---------------------------------------------------------------------------

const { data: derivedResponse, pending: derivedPending } = await useFetch<DerivedCharacterResponse>(
  () => `/api/worlds/${worldId.value}/characters/${characterId.value}/derived`
)

const derived = computed(() => (derivedResponse.value?.available ? derivedResponse.value.derived : null))

// Why derived values are unavailable, when they are. "No rules activated"
// and "the activated rules are broken" are different problems with different
// fixes, so they are never collapsed into one message.
const derivedUnavailable = computed(() => {
  const response = derivedResponse.value
  if (!response || response.available) return ''
  return response.message || 'Derived values are unavailable for this character.'
})

// Which regions to render is a category-level decision, declared once in
// characterDerivedValues.ts -- see the header for why category rather than
// Definition ID is what keeps this page game-agnostic.
const derivedRegions = computed(() =>
  DERIVED_SHEET_REGIONS
    .map((region) => ({ ...region, entries: derived.value?.byCategory?.[region.category] ?? [] }))
    .filter((region) => region.entries.length > 0)
)

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

// The at-a-glance identity line. Reads a resolved slot's title, or says the
// choice is missing -- it never falls back to a blank, because "this
// character's Species no longer resolves" is information, not an empty cell.
const identityRows = computed(() =>
  sections.value.map((section) => ({
    key: section.key,
    label: section.label,
    value: section.slot.status === 'resolved' ? section.slot.entry.title : 'Missing',
    missing: section.slot.status !== 'resolved'
  }))
)
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <!-- max-w-4xl rather than 3xl: the cards now carry trait prose and
         two-column fact grids, not two lines of provenance. px-4 on phones
         keeps those same cards readable with no horizontal scroll. -->
    <div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div class="eldra-kicker text-xs">
        Character Sheet
      </div>
      <h1 class="eldra-title mt-2 break-words text-3xl font-semibold">
        {{ blueprint?.characterTitle || 'Character Sheet' }}
      </h1>

      <!-- Identity at a glance: who this character is, in one line on a
           phone-friendly wrapping list. The full Species/Class/Background
           detail cards follow further down. -->
      <dl
        v-if="blueprint"
        class="mt-3 flex flex-wrap gap-x-6 gap-y-2"
      >
        <div
          v-for="row in identityRows"
          :key="row.key"
          class="min-w-0"
        >
          <dt class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
            {{ row.label }}
          </dt>
          <dd
            class="break-words text-base font-semibold"
            :class="row.missing ? 'text-red-300' : 'text-[#fff7df]'"
          >
            {{ row.value }}
          </dd>
        </div>
      </dl>

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
        <!-- Ability Scores. Values only -- nothing on this page derives a
             modifier, save, skill, AC, HP, or initiative from them. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Ability Scores
            </div>
            <!-- The Sheet displays; the Builder edits. -->
            <NuxtLink
              :to="`/worlds/${worldId}/characters/${characterId}/abilities`"
              class="text-sm text-[#9f9278] underline-offset-4 hover:text-[#d8ceb8] hover:underline"
            >
              {{ blueprint.abilityScores ? 'Edit' : 'Assign' }}
            </NuxtLink>
          </div>

          <div class="mt-3">
            <CharacterAbilityScoresPanel
              :scores="blueprint.abilityScores?.scores ?? null"
              empty-message="No ability scores have been assigned yet. Use Assign above to set them."
            />
          </div>
        </section>

        <!-- Derived by the Rules Engine. Every value below was computed by
             the evaluator from this character's data and the World's active
             Rules Package; nothing on this page calculates. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Derived
            </div>
            <p
              v-if="derived"
              class="break-words text-xs text-[#6f6754]"
            >
              {{ derived.packageId }}@{{ derived.packageVersion }}
            </p>
          </div>

          <p
            v-if="derivedPending"
            class="mt-3 text-sm text-[#9f9278]"
          >
            Evaluating this character against the World's rules…
          </p>

          <p
            v-else-if="!derived"
            class="mt-3 rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-4 text-sm text-[#9f9278]"
          >
            {{ derivedUnavailable }}
          </p>

          <div
            v-else
            class="mt-3 grid gap-5"
          >
            <div
              v-for="region in derivedRegions"
              :key="region.category"
              class="min-w-0"
            >
              <h3 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
                {{ region.label }}
              </h3>
              <CharacterDerivedPanel :entries="region.entries" />
            </div>

            <!-- Declared by a Class or Background, answered by nobody yet.
                 Stated rather than silently omitted, because "you still have
                 skills to choose" is information a player needs. -->
            <p
              v-if="derived.pendingChoices.length"
              class="text-xs leading-5 text-[#6f6754]"
            >
              {{ derived.pendingChoices.length }} proficiency
              {{ derived.pendingChoices.length === 1 ? 'choice is' : 'choices are' }}
              still outstanding. Choosing them is not available yet, so those proficiencies show as unselected.
            </p>
          </div>
        </section>

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
