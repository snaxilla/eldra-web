<script setup lang="ts">
// Character Builder V2 -- Eldra's canonical Character Builder, Phase 1
// (Name + Species + Class + Background).
//
// DATA: consumes ONLY GET /api/worlds/:id/catalogue -- the live World
// Content Catalogue produced by the approved Content Platform
// (server/utils/world-content-catalogue.ts). There is no fixture, no
// hardcoded species/class/background list, and no /entities call anywhere
// in this file; every option a player can pick came from a Content Pack a
// GM actually published and bound. Saving goes to
// POST /api/worlds/:id/characters/create-v2, which re-verifies every choice
// against its own copy of that same catalogue by (packageId, slug) and
// never trusts what this page sends beyond those two fields.
//
// ---------------------------------------------------------------------------
// ADAPTIVE, NOT RESPONSIVE-AS-AN-AFTERTHOUGHT
// ---------------------------------------------------------------------------
// This is one feature-complete application with two LAYOUTS, not a desktop
// app that degrades. The functional core -- the same option pickers, the
// same search, the same validation, the same submit -- is shared verbatim
// between them; only arrangement differs, and only because desktop has room
// to show simultaneously what a phone shows sequentially:
//
//   compact (phone / small tablet / any coarse pointer under 1366px)
//     one step at a time, full-bleed cards, progress rail at the top,
//     sticky bottom action bar within thumb reach.
//
//   roomy (laptop / desktop / large fine-pointer tablet)
//     every step on screen at once in two columns, with a persistent live
//     summary beside them; no stepper, because nothing needs hiding.
//
// NOTHING IS GATED BY LAYOUT. The progress rail is a set of buttons, so a
// phone user can jump to any step at any time exactly as a desktop user can
// scroll to any section -- "Next" is a convenience, never a lock. No feature,
// field, or control exists on one layout and not the other.
//
// The breakpoint heuristic (width < 768, or a coarse pointer at <= 1366)
// deliberately matches the one app/pages/worlds/[id]/entities/[entityId]/sheet.vue
// already uses, so the two character surfaces agree about what "compact"
// means. It is intentionally pointer-aware rather than width-only: an iPad
// in landscape is 1024px wide but is still a touch device and still wants
// large targets.
//
// ---------------------------------------------------------------------------
// TEACHING, NOT JUST CHOOSING (Phase 2)
// ---------------------------------------------------------------------------
// A player must never have to leave the Builder to understand what they are
// selecting. Each choice therefore renders a live preview -- the resolved
// presentation model for the currently selected option -- directly beneath
// its picker, on BOTH layouts.
//
// Beneath the picker, not in a modal, a drawer, or a linked page: selecting
// a Species and reading about it are one continuous act, and every mechanism
// that interrupts it (a dialog to dismiss, a route to come back from) makes
// comparing two options cost more than it should. The preview simply appears
// where the choice was made, and changing the radio changes it in place.
//
// The preview is the SAME component the Character Sheet renders
// (~/components/characters/ContentPresentationPanel.vue) against the SAME
// models, so what a player learns here reads identically on the sheet
// afterwards.
//
// This page still knows nothing about 5etools, Content Packs, or `data`.
// `entry.presentation` arrives already resolved from
// GET /api/worlds/:id/catalogue (server/utils/world-content-catalogue.ts ->
// app/lib/content-presentation); no field name from any game system appears
// anywhere in this file.
//
// ---------------------------------------------------------------------------
// PHASE 3: ABILITY SCORES
// ---------------------------------------------------------------------------
// A fifth step, between Background and Review, rendered by the SAME editor
// the standalone ability-editing page uses
// (~/components/characters/builder/CharacterAbilityScoreEditor.vue), and
// summarised on Review by the SAME read-only panel the Character Sheet
// renders (~/components/characters/CharacterAbilityScoresPanel.vue). This
// page owns no ability-score logic of its own: method switching, point-buy
// budgeting, and completeness all live in the pure modules
// (characterBuilderSelection.ts -> app/lib/characters/ability-scores.ts) and
// are unit-tested there.
//
// Nothing here computes a modifier, save, skill, or hit point from a score.
// Those belong to the Rules Engine, which this page does not import.

import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import CharacterAbilityScoresPanel from '~/components/characters/CharacterAbilityScoresPanel.vue'
import CharacterAbilityScoreEditor from '~/components/characters/builder/CharacterAbilityScoreEditor.vue'
import {
  CHOICE_KEYS,
  STEP_KEYS,
  STEP_LABELS,
  activeAssignment,
  draftAbilityScores,
  emptyDraft,
  findOptionByKey,
  isDraftComplete,
  isStepComplete,
  missingRequirements,
  nextStep,
  optionKey,
  previousStep,
  switchAbilityMethod,
  toCreatePayload,
  type BuilderCatalogueEntry,
  type BuilderChoiceKey,
  type BuilderStepKey
} from '~/components/characters/builder/characterBuilderSelection'
import CharacterBuilderOptionPicker from '~/components/characters/builder/CharacterBuilderOptionPicker.vue'
import type { AbilityKey, AbilityScoreMethod } from '~/lib/characters/ability-scores'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

type WorldCatalogue = {
  worldId: string
  packs: Array<{ ok: boolean; packageId: string; version: string }>
  species: BuilderCatalogueEntry[]
  classes: BuilderCatalogueEntry[]
  backgrounds: BuilderCatalogueEntry[]
}

const { data: catalogue, pending: catalogueLoading, error: catalogueError } = await useFetch<WorldCatalogue>(
  () => `/api/worlds/${worldId.value}/catalogue`
)

const optionsFor = computed<Record<BuilderChoiceKey, BuilderCatalogueEntry[]>>(() => ({
  species: catalogue.value?.species ?? [],
  class: catalogue.value?.classes ?? [],
  background: catalogue.value?.backgrounds ?? []
}))

const hasAnyBoundPack = computed(() => (catalogue.value?.packs?.length ?? 0) > 0)
const catalogueIsEmpty = computed(
  () => !catalogueLoading.value && CHOICE_KEYS.every((key) => optionsFor.value[key].length === 0)
)

// ---------------------------------------------------------------------------
// Adaptive layout -- see this file's header.
// ---------------------------------------------------------------------------

const viewportWidth = ref(0)
const pointerCoarse = ref(false)

function updateViewport() {
  if (!import.meta.client) return
  viewportWidth.value = window.innerWidth || 0
  pointerCoarse.value = window.matchMedia?.('(pointer: coarse)').matches || false
}

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  window.addEventListener('orientationchange', updateViewport)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('orientationchange', updateViewport)
})

// Defaults to the roomy layout during SSR / before measurement, then
// corrects on mount. Both layouts render the same controls, so a brief
// pre-hydration mismatch changes arrangement only, never capability.
const compact = computed(() => {
  const width = viewportWidth.value
  if (!width) return false
  return width < 768 || (pointerCoarse.value && width <= 1366)
})

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

const draft = reactive(emptyDraft())
const activeStep = ref<BuilderStepKey>('identity')

// The picker speaks in composite (packageId::slug) keys -- never bare slugs,
// which can collide across packs. See characterBuilderSelection.ts.
const selectedKeys = computed<Record<BuilderChoiceKey, string>>(() => ({
  species: optionKey(draft.species),
  class: optionKey(draft.class),
  background: optionKey(draft.background)
}))

function chooseOption(key: BuilderChoiceKey, value: string) {
  draft[key] = findOptionByKey(optionsFor.value[key], value)
}

// ---------------------------------------------------------------------------
// Ability scores (Phase 3) -- state only; all logic is in the pure modules.
// ---------------------------------------------------------------------------

const abilityAssignment = computed(() => activeAssignment(draft))
const abilityScores = computed(() => draftAbilityScores(draft))

function chooseAbilityMethod(method: AbilityScoreMethod) {
  switchAbilityMethod(draft, method)
}

function setAbility(key: AbilityKey, value: number | null) {
  draft.abilities.byMethod[draft.abilities.method][key] = value
}

const steps = computed(() =>
  STEP_KEYS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    complete: isStepComplete(draft, key)
  }))
)

const complete = computed(() => isDraftComplete(draft))
const outstanding = computed(() => missingRequirements(draft))

const summaryRows = computed(() =>
  CHOICE_KEYS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    entry: draft[key]
  }))
)

function goTo(step: BuilderStepKey) {
  activeStep.value = step
}

function goNext() {
  const next = nextStep(activeStep.value)
  if (next) activeStep.value = next
}

function goBack() {
  const previous = previousStep(activeStep.value)
  if (previous) activeStep.value = previous
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const creating = ref(false)
const createErrorMessage = ref('')

async function createCharacter() {
  const payload = toCreatePayload(draft)
  if (!payload || creating.value) return

  creating.value = true
  createErrorMessage.value = ''

  try {
    const created = await $fetch<{ id?: string | number }>(
      `/api/worlds/${worldId.value}/characters/create-v2`,
      { method: 'POST', body: payload }
    )

    if (created?.id) {
      await navigateTo(`/worlds/${worldId.value}/characters/${created.id}/sheet-v2`)
    } else {
      await navigateTo(`/worlds/${worldId.value}/characters`)
    }
  } catch (error: any) {
    createErrorMessage.value =
      error?.data?.statusMessage || error?.statusMessage || 'Failed to create character'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div
      class="mx-auto px-4 pb-32 pt-8 sm:px-6"
      :class="compact ? 'max-w-2xl' : 'max-w-6xl'"
    >
      <div class="eldra-kicker text-xs">
        Character Builder
      </div>
      <h1 class="eldra-title mt-2 text-2xl font-semibold sm:text-3xl">
        Create Character
      </h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
        Choose a Species, Class, and Background from this World's bound Content Packs.
      </p>

      <!-- States ---------------------------------------------------------- -->
      <div
        v-if="catalogueLoading"
        class="mt-8 text-sm text-[#9f9278]"
      >
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

      <!-- ================================================================ -->
      <!-- COMPACT: one step at a time + sticky action bar                   -->
      <!-- ================================================================ -->
      <template v-else-if="compact">
        <!-- Progress rail: buttons, so any step is reachable at any time. -->
        <nav
          aria-label="Builder steps"
          class="mt-6 flex gap-1.5 overflow-x-auto pb-1"
        >
          <button
            v-for="step in steps"
            :key="step.key"
            type="button"
            class="flex min-h-11 shrink-0 items-center gap-1.5 rounded-none border px-3 text-xs font-semibold uppercase tracking-[0.12em] transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
            :class="activeStep === step.key
              ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
              : 'border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] text-[#9f9278]'"
            :aria-current="activeStep === step.key ? 'step' : undefined"
            @click="goTo(step.key)"
          >
            <span
              v-if="step.complete"
              aria-hidden="true"
            >✓</span>
            {{ step.label }}
            <span class="sr-only">{{ step.complete ? '(complete)' : '(incomplete)' }}</span>
          </button>
        </nav>

        <section class="mt-5">
          <div v-if="activeStep === 'identity'">
            <label
              for="character-name-compact"
              class="mb-2 block text-sm font-semibold text-[#d8ceb8]"
            >Character Name</label>
            <input
              id="character-name-compact"
              v-model="draft.name"
              type="text"
              autocomplete="off"
              placeholder="Character name"
              class="min-h-12 w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-4 py-3 text-base text-[#fff7df] outline-none focus-visible:border-[rgba(201,164,90,0.58)] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.35)]"
            >
          </div>

          <div
            v-for="key in CHOICE_KEYS"
            v-show="activeStep === key"
            :key="key"
          >
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#f5e7bd]">
              {{ STEP_LABELS[key] }}
            </h2>
            <CharacterBuilderOptionPicker
              :label="STEP_LABELS[key]"
              :name="`builder-${key}`"
              :options="optionsFor[key]"
              :model-value="selectedKeys[key]"
              compact
              @update:model-value="(value: string) => chooseOption(key, value)"
            />

            <!-- Live preview: the selected option, explained in place.
                 Same component, same models the Character Sheet renders. -->
            <div class="mt-5">
              <h3 class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">
                About this {{ STEP_LABELS[key] }}
              </h3>
              <div class="eldra-ornate-panel eldra-frame-corners mt-2 min-w-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-4 backdrop-blur">
                <ContentPresentationPanel
                  v-if="draft[key]"
                  :entry="draft[key]?.presentation"
                  context="preview"
                  :empty-message="`This Content Pack publishes no further details for this ${STEP_LABELS[key].toLowerCase()}.`"
                />
                <p
                  v-else
                  class="text-sm text-[#9f9278]"
                >
                  Choose a {{ STEP_LABELS[key].toLowerCase() }} above to see what it is and what it grants.
                </p>
              </div>
            </div>
          </div>

          <div v-if="activeStep === 'abilities'">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#f5e7bd]">
              {{ STEP_LABELS.abilities }}
            </h2>
            <CharacterAbilityScoreEditor
              :method="draft.abilities.method"
              :assignment="abilityAssignment"
              @update:method="chooseAbilityMethod"
              @update:ability="setAbility"
            />
          </div>

          <div v-if="activeStep === 'review'">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#f5e7bd]">
              Review
            </h2>
            <dl class="grid gap-2">
              <div class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-3">
                <dt class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">
                  Name
                </dt>
                <dd class="mt-1 text-base text-[#fff7df]">
                  {{ draft.name.trim() || '—' }}
                </dd>
              </div>
              <div
                v-for="row in summaryRows"
                :key="row.key"
                class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-3"
              >
                <dt class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">
                  {{ row.label }}
                </dt>
                <dd class="mt-1 text-base text-[#fff7df]">
                  {{ row.entry?.title || '—' }}
                  <span
                    v-if="row.entry"
                    class="mt-0.5 block text-xs text-[#9f9278]"
                  >
                    <template v-if="row.entry.sourceBook">{{ row.entry.sourceBook }} · </template>{{ row.entry.packageId }}
                  </span>
                </dd>
              </div>
            </dl>

            <!-- The same read-only panel the Character Sheet renders. -->
            <div class="mt-4 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-3">
              <div class="mb-2 text-xs uppercase tracking-[0.2em] text-[#9f9278]">
                {{ STEP_LABELS.abilities }}
              </div>
              <CharacterAbilityScoresPanel
                :scores="abilityScores"
                empty-message="Not assigned yet."
              />
            </div>

            <!-- Everything chosen, explained, before the Create button is
                 reachable. The roomy layout does not need this: it shows all
                 three previews beside the picker simultaneously. -->
            <div class="mt-5 grid gap-4">
              <div
                v-for="row in summaryRows"
                :key="`review-${row.key}`"
                class="eldra-ornate-panel eldra-frame-corners min-w-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-4 backdrop-blur"
              >
                <h3 class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">
                  {{ row.label }}
                </h3>
                <div class="mt-2">
                  <ContentPresentationPanel
                    v-if="row.entry"
                    :entry="row.entry.presentation"
                    context="preview"
                    :empty-message="`This Content Pack publishes no further details for this ${row.label.toLowerCase()}.`"
                  />
                  <p
                    v-else
                    class="text-sm text-[#9f9278]"
                  >
                    No {{ row.label.toLowerCase() }} chosen yet.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <p
          v-if="createErrorMessage"
          class="mt-4 rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
        >
          {{ createErrorMessage }}
        </p>

        <!-- Sticky bottom bar: primary actions within thumb reach. -->
        <div class="fixed inset-x-0 bottom-0 z-20 border-t border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.96)] px-4 py-3 backdrop-blur">
          <div class="mx-auto flex max-w-2xl items-center gap-2">
            <button
              type="button"
              class="min-h-12 shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] px-4 text-sm font-semibold text-[#d8ceb8] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
              :disabled="!previousStep(activeStep)"
              @click="goBack"
            >
              Back
            </button>

            <button
              v-if="activeStep !== 'review'"
              type="button"
              class="eldra-button min-h-12 flex-1 rounded-none px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
              @click="goNext"
            >
              Next
            </button>

            <button
              v-else
              type="button"
              class="eldra-button min-h-12 flex-1 rounded-none px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
              :disabled="!complete || creating"
              @click="createCharacter"
            >
              {{ creating ? 'Creating…' : 'Create Character' }}
            </button>
          </div>
          <ul
            v-if="activeStep === 'review' && outstanding.length"
            class="mx-auto mt-2 max-w-2xl list-disc pl-5 text-xs text-[#9f9278]"
          >
            <li
              v-for="message in outstanding"
              :key="message"
            >
              {{ message }}
            </li>
          </ul>
        </div>
      </template>

      <!-- ================================================================ -->
      <!-- ROOMY: everything at once + persistent summary                    -->
      <!-- ================================================================ -->
      <template v-else>
        <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div class="min-w-0 space-y-8">
            <section>
              <label
                for="character-name"
                class="mb-2 block text-sm font-semibold text-[#d8ceb8]"
              >Character Name</label>
              <input
                id="character-name"
                v-model="draft.name"
                type="text"
                autocomplete="off"
                placeholder="Character name"
                class="min-h-11 w-full max-w-md rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-4 py-2.5 text-sm text-[#fff7df] outline-none focus-visible:border-[rgba(201,164,90,0.58)] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.35)]"
              >
            </section>

            <section
              v-for="key in CHOICE_KEYS"
              :key="key"
            >
              <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#f5e7bd]">
                {{ STEP_LABELS[key] }}
              </h2>
              <CharacterBuilderOptionPicker
                :label="STEP_LABELS[key]"
                :name="`builder-${key}`"
                :options="optionsFor[key]"
                :model-value="selectedKeys[key]"
                @update:model-value="(value: string) => chooseOption(key, value)"
              />

              <!-- Live preview: the selected option, explained in place.
                   Same component, same models the Character Sheet renders. -->
              <div class="mt-5">
                <h3 class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">
                  About this {{ STEP_LABELS[key] }}
                </h3>
                <div class="eldra-ornate-panel eldra-frame-corners mt-2 min-w-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-4 backdrop-blur">
                  <ContentPresentationPanel
                    v-if="draft[key]"
                    :entry="draft[key]?.presentation"
                    context="preview"
                    :empty-message="`This Content Pack publishes no further details for this ${STEP_LABELS[key].toLowerCase()}.`"
                  />
                  <p
                    v-else
                    class="text-sm text-[#9f9278]"
                  >
                    Choose a {{ STEP_LABELS[key].toLowerCase() }} above to see what it is and what it grants.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#f5e7bd]">
                {{ STEP_LABELS.abilities }}
              </h2>
              <CharacterAbilityScoreEditor
                :method="draft.abilities.method"
                :assignment="abilityAssignment"
                @update:method="chooseAbilityMethod"
                @update:ability="setAbility"
              />
            </section>
          </div>

          <!-- Persistent summary: desktop's extra room used to show state
               continuously that compact shows on its Review step. -->
          <aside class="lg:sticky lg:top-8">
            <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
              <h2 class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Summary
              </h2>

              <dl class="mt-3 space-y-3 text-sm">
                <div>
                  <dt class="text-xs uppercase tracking-[0.16em] text-[#9f9278]">
                    Name
                  </dt>
                  <dd class="mt-0.5 text-[#fff7df]">
                    {{ draft.name.trim() || '—' }}
                  </dd>
                </div>
                <div
                  v-for="row in summaryRows"
                  :key="row.key"
                >
                  <dt class="text-xs uppercase tracking-[0.16em] text-[#9f9278]">
                    {{ row.label }}
                  </dt>
                  <dd class="mt-0.5 text-[#fff7df]">
                    {{ row.entry?.title || '—' }}
                    <span
                      v-if="row.entry"
                      class="mt-0.5 block text-xs text-[#9f9278]"
                    >
                      <template v-if="row.entry.sourceBook">{{ row.entry.sourceBook }} · </template>{{ row.entry.packageId }}
                    </span>
                  </dd>
                </div>
              </dl>

              <div class="mt-4 border-t border-[rgba(201,164,90,0.14)] pt-3">
                <div class="mb-2 text-xs uppercase tracking-[0.16em] text-[#9f9278]">
                  {{ STEP_LABELS.abilities }}
                </div>
                <CharacterAbilityScoresPanel
                  :scores="abilityScores"
                  empty-message="Not assigned yet."
                />
              </div>

              <button
                type="button"
                class="eldra-button mt-5 min-h-11 w-full rounded-none px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
                :disabled="!complete || creating"
                @click="createCharacter"
              >
                {{ creating ? 'Creating…' : 'Create Character' }}
              </button>

              <ul
                v-if="outstanding.length"
                class="mt-2 list-disc pl-5 text-xs text-[#9f9278]"
              >
                <li
                  v-for="message in outstanding"
                  :key="message"
                >
                  {{ message }}
                </li>
              </ul>

              <p
                v-if="createErrorMessage"
                class="mt-3 rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
              >
                {{ createErrorMessage }}
              </p>

              <NuxtLink
                :to="`/worlds/${worldId}/characters`"
                class="mt-3 inline-block text-sm text-[#9f9278] hover:text-[#d8ceb8]"
              >
                Cancel
              </NuxtLink>
            </div>
          </aside>
        </div>
      </template>
    </div>
  </div>
</template>
