<script setup lang="ts">
// Ability Scores editor for an EXISTING character -- Character Builder /
// Character Sheet Phase 3.
//
// The Builder teaches, the Sheet displays. Editing therefore lives here, in
// a Builder-context page, and NOT on sheet-v2.vue -- which stays a pure
// display surface. The Sheet links here; it never edits.
//
// This page exists because a character can predate its scores. Every
// character created before Phase 3 -- and every character created through
// the API without an `abilities` payload -- has none, and without an editing
// surface could never acquire any. Assigning scores to an already-created
// character is the primary job of this page, not an afterthought.
//
// DATA IN: GET /api/worlds/:id/characters/:characterId/assembly -- the same
// endpoint the Sheet reads, reused rather than adding a second read route
// for the one field this page needs. It already returns the character's
// title (for the heading) and its stored `abilityScores` (to seed the
// editor), so a dedicated GET would be a new endpoint returning a subset of
// an existing one.
//
// DATA OUT: PUT /api/worlds/:id/characters/:characterId/abilities, which
// validates shape and bounds server-side and stores exactly what is sent.
//
// The editor itself is the SAME component create-v2.vue's ability step
// renders. Method switching, point-buy budgeting, and completeness are the
// pure modules' job (app/lib/characters/ability-scores.ts); this page owns
// only load/save and the surrounding chrome.

import CharacterAbilityScoreEditor from '~/components/characters/builder/CharacterAbilityScoreEditor.vue'
import {
  defaultAssignmentForMethod,
  isCompleteForMethod,
  seedAssignmentForMethod,
  toAbilityScores,
  toAssignment,
  type AbilityKey,
  type AbilityScoreAssignment,
  type AbilityScoreMethod,
  type StoredAbilityScores
} from '~/lib/characters/ability-scores'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const characterId = computed(() => String(route.params.characterId || ''))

type AssemblyResponse =
  | { available: true; blueprint: { characterTitle: string; abilityScores: StoredAbilityScores | null } }
  | { available: false; reason: string; message?: string }

const { data: assembly, pending, error } = await useFetch<AssemblyResponse>(
  () => `/api/worlds/${worldId.value}/characters/${characterId.value}/assembly`
)

const blueprint = computed(() => (assembly.value?.available ? assembly.value.blueprint : null))

// ---------------------------------------------------------------------------
// Draft state -- one assignment per method, exactly as the create Builder's
// own draft holds, so switching methods here loses nothing either.
// ---------------------------------------------------------------------------

const method = ref<AbilityScoreMethod>('standard-array')
const byMethod = reactive<Record<AbilityScoreMethod, AbilityScoreAssignment>>({
  'standard-array': defaultAssignmentForMethod('standard-array'),
  'point-buy': defaultAssignmentForMethod('point-buy'),
  manual: defaultAssignmentForMethod('manual'),
  roll: defaultAssignmentForMethod('roll')
})

// Seeds the editor from what is already stored. The stored METHOD is
// honoured when it can still represent the stored scores, so re-opening a
// point-buy character lands back in Point Buy with the same spend --
// otherwise Manual Entry, which can represent any legal record and is the
// honest place to edit a score the original method cannot express.
function seedFromStored(stored: StoredAbilityScores | null) {
  if (!stored) return

  const assignment = toAssignment(stored.scores)

  if (isCompleteForMethod(stored.method, assignment)) {
    byMethod[stored.method] = assignment
    method.value = stored.method
    return
  }

  byMethod.manual = assignment
  method.value = 'manual'
}

watch(blueprint, (value) => seedFromStored(value?.abilityScores ?? null), { immediate: true })

const assignment = computed(() => byMethod[method.value])
const complete = computed(() => isCompleteForMethod(method.value, assignment.value))

function chooseMethod(next: AbilityScoreMethod) {
  const previous = assignment.value
  const target = byMethod[next]
  const pristine = (Object.keys(target) as AbilityKey[]).every(
    (key) => target[key] === defaultAssignmentForMethod(next)[key]
  )

  if (pristine) {
    byMethod[next] = seedAssignmentForMethod(next, previous)
  }

  method.value = next
}

function setAbility(key: AbilityKey, value: number | null) {
  byMethod[method.value][key] = value
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

const saving = ref(false)
const saveErrorMessage = ref('')

async function save() {
  const scores = toAbilityScores(assignment.value)
  if (!scores || !complete.value || saving.value) return

  saving.value = true
  saveErrorMessage.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/abilities`, {
      method: 'PUT',
      body: { method: method.value, scores }
    })
    await navigateTo(`/worlds/${worldId.value}/characters/${characterId.value}/sheet-v2`)
  } catch (saveError: any) {
    saveErrorMessage.value =
      saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save ability scores'
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
        Ability Scores
      </h1>
      <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
        <template v-if="blueprint?.characterTitle">
          Assign ability scores for <strong class="font-semibold text-[#fff7df]">{{ blueprint.characterTitle }}</strong>.
        </template>
        <template v-else>
          Assign this character's ability scores.
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
        v-else-if="assembly && !assembly.available"
        class="mt-8 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-4 text-sm text-[#d8ceb8]"
      >
        {{ assembly.message || 'This character cannot be edited here yet.' }}
      </div>

      <template v-else>
        <div class="mt-6">
          <CharacterAbilityScoreEditor
            :method="method"
            :assignment="assignment"
            @update:method="chooseMethod"
            @update:ability="setAbility"
          />
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
              {{ saving ? 'Saving…' : 'Save Ability Scores' }}
            </button>
          </div>
          <p
            v-if="!complete"
            class="mx-auto mt-2 max-w-3xl text-xs text-[#9f9278]"
          >
            Finish assigning all six ability scores to save.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
