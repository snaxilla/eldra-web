<script setup lang="ts">
// Proficiency choices editor for an EXISTING character.
//
// The exact counterpart of this directory's abilities.vue, and deliberately
// its twin: the Builder teaches, the Sheet displays, so editing lives here
// in a Builder-context page and NOT on sheet-v2.vue, which stays a pure
// display surface. The Sheet links here; it never edits.
//
// This page exists for the same reason abilities.vue does: a character can
// predate its choices. Every character created before proficiency choices
// existed -- and every character created through the API without a
// `choices` payload -- has unanswered ChoiceSets and, without an editing
// surface, could never answer them.
//
// DATA IN: GET /api/worlds/:id/characters/:characterId/derived -- the same
// endpoint the Sheet reads. It already returns every declared choice with
// its prompt, its options, each option's label, and what is currently
// selected, so a dedicated GET would be a new endpoint returning a subset of
// an existing one.
//
// Reading from `derived` rather than from the assembly does mean this page
// needs the World to have a Rules Package activated, even though the
// QUESTIONS come from content facets and exist without one. That is the
// honest coupling: with no package active there is nothing to interpret a
// proficiency, the Sheet already reports derived values as unavailable, and
// offering a choice whose effect nothing can compute would be offering a
// control that does nothing.
//
// DATA OUT: PUT /api/worlds/:id/characters/:characterId/choices, which
// re-derives the character's declared questions server-side and validates
// every answer against them.
//
// The picker itself is the SAME component the Builder's proficiency step
// renders. This page owns only load/save and the surrounding chrome; count
// enforcement and validity live in app/lib/characters/rules-choices.ts.

import CharacterChoiceSetPicker from '~/components/characters/builder/CharacterChoiceSetPicker.vue'
import {
  validateChoiceSelection,
  type ResolvableChoice
} from '~/lib/characters/rules-choices'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const characterId = computed(() => String(route.params.characterId || ''))

type PresentableChoice = ResolvableChoice & {
  prompt: string
  selected: string[]
  optionLabels: Record<string, string>
}

type DerivedResponse =
  | {
      available: true
      derived: { characterTitle: string; choices: PresentableChoice[] }
    }
  | { available: false; reason: string; message?: string }

const { data: derivedResponse, pending, error } = await useFetch<DerivedResponse>(
  () => `/api/worlds/${worldId.value}/characters/${characterId.value}/derived`
)

const derived = computed(() => (derivedResponse.value?.available ? derivedResponse.value.derived : null))
const choices = computed(() => derived.value?.choices ?? [])

// Draft selections, seeded from what is already stored. Keyed exactly as the
// server stores them, so submitting is a copy rather than a translation.
const draft = reactive<Record<string, string[]>>({})

watch(
  choices,
  (value) => {
    for (const choice of value) {
      if (!draft[choice.key]) draft[choice.key] = [...choice.selected]
    }
  },
  { immediate: true }
)

function selectionsFor(key: string): string[] {
  return draft[key] ?? []
}

function chooseSelections(key: string, selected: string[]) {
  draft[key] = [...selected]
}

// Every declared choice must be validly answered before saving. Mirrors --
// never replaces -- the server's own validation: the PUT route remains the
// sole authority, and this only explains a disabled button.
const complete = computed(() =>
  choices.value.every((choice) => validateChoiceSelection(choice, selectionsFor(choice.key)).ok)
)

const saving = ref(false)
const saveErrorMessage = ref('')

async function save() {
  if (!complete.value || saving.value) return

  saving.value = true
  saveErrorMessage.value = ''

  try {
    const selections: Record<string, string[]> = {}
    for (const choice of choices.value) {
      selections[choice.key] = selectionsFor(choice.key)
    }

    await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/choices`, {
      method: 'PUT',
      body: { selections }
    })
    await navigateTo(`/worlds/${worldId.value}/characters/${characterId.value}/sheet-v2`)
  } catch (saveError: any) {
    saveErrorMessage.value =
      saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save proficiency choices'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <!-- pb-32 leaves room for the sticky action bar on phones. -->
    <div class="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-6">
      <div class="eldra-kicker text-xs">
        Character Builder
      </div>
      <h1 class="eldra-title mt-2 text-2xl font-semibold sm:text-3xl">
        Proficiencies
      </h1>
      <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
        <template v-if="derived?.characterTitle">
          Choose the proficiencies <strong class="font-semibold text-[#fff7df]">{{ derived.characterTitle }}</strong>'s
          Species, Class, and Background offer.
        </template>
        <template v-else>
          Choose the proficiencies this character's content offers.
        </template>
      </p>

      <NuxtLink
        :to="`/worlds/${worldId}/characters/${characterId}/sheet-v2`"
        class="mt-4 inline-block text-sm text-[#9f9278] hover:text-[#d8ceb8]"
      >
        &larr; Back to Character Sheet
      </NuxtLink>

      <div
        v-if="pending"
        class="mt-8 text-sm text-[#9f9278]"
      >
        Loading this character…
      </div>

      <div
        v-else-if="error"
        class="mt-8 rounded-none border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
      >
        Could not load this character. Try again shortly.
      </div>

      <div
        v-else-if="derivedResponse && !derivedResponse.available"
        class="mt-8 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-4 text-sm text-[#d8ceb8]"
      >
        {{ derivedResponse.message || 'This character has no proficiency choices to make yet.' }}
      </div>

      <div
        v-else-if="!choices.length"
        class="mt-8 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-4 text-sm text-[#d8ceb8]"
      >
        This character's Species, Class, and Background ask no proficiency questions.
      </div>

      <template v-else>
        <div class="mt-6 grid gap-6">
          <div
            v-for="choice in choices"
            :key="choice.key"
            class="eldra-ornate-panel eldra-frame-corners min-w-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-4 backdrop-blur"
          >
            <CharacterChoiceSetPicker
              :choice="choice"
              :selected="selectionsFor(choice.key)"
              :prompt="choice.prompt"
              :option-labels="choice.optionLabels"
              :slot-label="choice.slot"
              @update:selected="(value: string[]) => chooseSelections(choice.key, value)"
            />
          </div>
        </div>

        <p
          v-if="saveErrorMessage"
          class="mt-4 rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
        >
          {{ saveErrorMessage }}
        </p>

        <!-- Sticky save: within thumb reach on a phone, harmless on desktop. -->
        <div class="fixed inset-x-0 bottom-0 z-20 border-t border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.96)] px-4 py-3 backdrop-blur">
          <div class="mx-auto flex max-w-3xl items-center gap-2">
            <NuxtLink
              :to="`/worlds/${worldId}/characters/${characterId}/sheet-v2`"
              class="flex min-h-12 shrink-0 items-center rounded-none border border-[rgba(201,164,90,0.24)] px-4 text-sm font-semibold text-[#d8ceb8] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
            >
              Cancel
            </NuxtLink>
            <button
              type="button"
              class="eldra-button min-h-12 flex-1 rounded-none px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
              :disabled="!complete || saving"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save Proficiencies' }}
            </button>
          </div>
          <p
            v-if="!complete"
            class="mx-auto mt-2 max-w-3xl text-xs text-[#9f9278]"
          >
            Finish every choice above to save.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
