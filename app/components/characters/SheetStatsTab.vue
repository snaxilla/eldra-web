<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: string
  math?: any
  sheet?: any
  shownStats?: Record<string, any>
  pendingChoices?: any[]
  choiceSaving?: boolean
  choiceSaveError?: string
  choiceSaveSuccess?: string
  choiceDrafts?: Record<string, any[]>
  mathSaves?: any[]
  mathSkills?: any[]
  armorClassCandidates?: any[]
  spellRestrictionLabel?: (choice: any) => string
  choiceSlots?: (choice: any) => any[]
  choiceOptions?: (choice: any) => any[]
  isChoiceOptionDisabled?: (choice: any, slot: any, option: any) => boolean
  choiceOptionLabel?: (choice: any, slot: any, option: any) => string
  prettyChoiceValue?: (value: any) => string
}>(), {
  mode: 'play',
  shownStats: () => ({}),
  pendingChoices: () => [],
  choiceDrafts: () => ({}),
  mathSaves: () => [],
  mathSkills: () => [],
  armorClassCandidates: () => []
})

const emit = defineEmits<{
  (event: 'save-choices'): void
  (event: 'update-choice-draft', payload: { sourceKey: string; slot: any; value: string }): void
  (event: 'roll-saving-throw', save: any): void
  (event: 'roll-skill-check', skill: any): void
}>()

function shown(key: string) {
  return props.shownStats?.[key] || '—'
}

function spellRestriction(choice: any) {
  return props.spellRestrictionLabel?.(choice) || ''
}

function choiceSlotsFor(choice: any) {
  return props.choiceSlots?.(choice) || []
}

function choiceOptionsFor(choice: any) {
  return props.choiceOptions?.(choice) || []
}

function choiceOptionDisabled(choice: any, slot: any, option: any) {
  return props.isChoiceOptionDisabled?.(choice, slot, option) || false
}

function choiceOptionText(choice: any, slot: any, option: any) {
  return props.choiceOptionLabel?.(choice, slot, option) || String(option || '')
}

function prettyChoice(value: any) {
  return props.prettyChoiceValue?.(value) || String(value || '')
}

function choiceDraftValue(choice: any, slot: any) {
  const sourceKey = String(choice?.sourceKey || '')
  return props.choiceDrafts?.[sourceKey]?.[slot] || ''
}

function updateChoiceDraft(choice: any, slot: any, event: Event) {
  const sourceKey = String(choice?.sourceKey || '')
  if (!sourceKey) return

  const target = event.target as HTMLInputElement | HTMLSelectElement | null

  emit('update-choice-draft', {
    sourceKey,
    slot,
    value: target?.value || ''
  })
}
</script>

<template>
  <section class="mt-6 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
    <div class="eldra-codex-soft rounded-none p-4">
      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Stats Math</div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Level</div>
          <div class="mt-1 text-2xl font-semibold text-white">{{ math?.level || sheet?.level || 1 }}</div>
        </div>

        <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Proficiency</div>
          <div class="mt-1 text-2xl font-semibold text-white">{{ math?.proficiencyBonusText || '+2' }}</div>
        </div>

        <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Initiative</div>
          <div class="mt-1 text-2xl font-semibold text-white">{{ math?.combat?.initiativeText || shown('initiative') }}</div>
        </div>

        <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Speed</div>
          <div class="mt-1 text-2xl font-semibold text-white">{{ math?.combat?.speed || shown('speed') }}</div>
        </div>
      </div>

      <div
        v-if="pendingChoices.length"
        class="mt-4 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Pending Choices</div>

          <button
            v-if="mode === 'build'"
            type="button"
            class="eldra-button rounded-none px-3 py-2 text-xs font-semibold disabled:opacity-50"
            :disabled="choiceSaving"
            @click="emit('save-choices')"
          >
            {{ choiceSaving ? 'Saving...' : 'Save Choices' }}
          </button>
        </div>

        <div
          v-if="choiceSaveError"
          class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
        >
          {{ choiceSaveError }}
        </div>

        <div
          v-if="choiceSaveSuccess"
          class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
        >
          {{ choiceSaveSuccess }}
        </div>

        <div class="mt-3 space-y-3 text-sm text-[#d8ceb8]">
          <div
            v-for="choice in pendingChoices"
            :key="choice.sourceKey"
            class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.42)] p-3"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="font-medium text-white">{{ choice.label }}</div>
                <div
                  v-if="spellRestriction(choice)"
                  class="mt-1 text-xs text-[#9f9278]"
                >
                  {{ spellRestriction(choice) }}
                </div>
                <div
                  v-if="choice.remaining"
                  class="mt-1 text-xs text-[#9f9278]"
                >
                  {{ choice.remaining }} selection{{ choice.remaining === 1 ? '' : 's' }} remaining.
                </div>
                <div
                  v-else
                  class="mt-1 text-xs text-emerald-200"
                >
                  Complete.
                </div>
              </div>

              <div
                v-if="choice.complete"
                class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]"
              >
                Chosen
              </div>
            </div>

            <div
              v-if="mode === 'build'"
              class="mt-3 grid gap-2"
            >
              <label
                v-for="slot in choiceSlotsFor(choice)"
                :key="`${choice.sourceKey}-${slot}`"
                class="block"
              >
                <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">
                  Pick {{ Number(slot) + 1 }}
                </span>

                <select
                  v-if="choiceOptionsFor(choice).length"
                  :value="choiceDraftValue(choice, slot)"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                  @change="updateChoiceDraft(choice, slot, $event)"
                >
                  <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
                  <option
                    v-for="option in choiceOptionsFor(choice)"
                    :key="option"
                    :value="option"
                    :disabled="choiceOptionDisabled(choice, slot, option)"
                    class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
                  >
                    {{ choiceOptionText(choice, slot, option) }}
                  </option>
                </select>

                <input
                  v-else
                  :value="choiceDraftValue(choice, slot)"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                  :placeholder="choice.category ? `Choose from category ${choice.category}` : 'Type choice...'"
                  @input="updateChoiceDraft(choice, slot, $event)"
                >
              </label>
            </div>

            <div
              v-else
              class="mt-3 text-xs text-[#9f9278]"
            >
              Selected:
              <span
                v-if="choice.selected?.length"
                class="text-[#d8ceb8]"
              >
                {{ choice.selected.map(prettyChoice).join(', ') }}
              </span>
              <span v-else>None yet.</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-4">
      <div class="eldra-codex-soft rounded-none p-4">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Saving Throws</div>

        <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="save in mathSaves"
            :key="save.key"
            role="button"
            tabindex="0"
            title="Roll saving throw"
            class="cursor-pointer rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)]"
            @click.stop="emit('roll-saving-throw', save)"
            @keydown.enter.prevent="emit('roll-saving-throw', save)"
            @keydown.space.prevent="emit('roll-saving-throw', save)"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">{{ save.shortLabel }}</div>
              <div v-if="save.proficient" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Prof</div>
            </div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ save.totalText }}</div>
            <div class="mt-1 text-xs text-[#9f9278]">{{ save.label }}</div>
          </div>
        </div>
      </div>

      <div class="eldra-codex-soft rounded-none p-4">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Skills</div>

        <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="skill in mathSkills"
            :key="skill.key"
            role="button"
            tabindex="0"
            title="Roll skill check"
            class="cursor-pointer rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)]"
            @click.stop="emit('roll-skill-check', skill)"
            @keydown.enter.prevent="emit('roll-skill-check', skill)"
            @keydown.space.prevent="emit('roll-skill-check', skill)"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium text-white">{{ skill.label }}</div>
              <div class="text-xs text-[#9f9278]">{{ skill.abilityLabel }}</div>
            </div>
            <div class="mt-2 flex items-center justify-between gap-3">
              <div class="text-xl font-semibold text-white">{{ skill.totalText }}</div>
              <div v-if="skill.proficient" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Prof</div>
            </div>
          </div>
        </div>
      </div>

      <div class="eldra-codex-soft rounded-none p-4">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Armor Class Candidates</div>

        <div class="mt-4 grid gap-2 md:grid-cols-3">
          <div
            v-for="candidate in armorClassCandidates"
            :key="candidate.label"
            class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium text-white">{{ candidate.label }}</div>
              <div v-if="candidate.active" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Active</div>
            </div>
            <div class="mt-2 text-2xl font-semibold text-white">{{ candidate.value }}</div>
            <div class="mt-1 text-xs leading-5 text-[#9f9278]">{{ candidate.note }}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
