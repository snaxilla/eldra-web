<script setup lang="ts">
// One ChoiceSet, presented for answering -- "choose two skills from your
// class list."
//
// Rendered by BOTH the Character Builder (during creation) and the
// standalone proficiencies page (for an existing character), against the
// same props, so a choice looks and behaves identically before and after a
// character exists. Neither caller passes anything platform-specific: this
// component behaves the same on every viewport, and the PAGE decides layout.
//
// ---------------------------------------------------------------------------
// IT INTERPRETS NOTHING
// ---------------------------------------------------------------------------
// Options arrive as Definition ids with labels already resolved by the
// Rules Package (`optionLabels`). This file contains no skill name, no game
// vocabulary, and no rule: it renders a list, enforces a count, and emits
// the ids that were ticked. What a ticked id MEANS is the Rules Engine's
// answer, computed after this component is long gone.
//
// ---------------------------------------------------------------------------
// ACCESSIBILITY / INPUT
// ---------------------------------------------------------------------------
// Native `<input type="checkbox">` + `<label>`, not styled divs with click
// handlers -- the same reasoning CharacterBuilderOptionPicker.vue records
// for its radios, and a checkbox rather than a radio because a ChoiceSet
// takes N answers, not one. That buys real keyboard support (Tab to reach,
// Space to toggle) and correct screen-reader checked state with no ARIA
// re-implementation.
//
// The whole row is the label, so the touch target is min-h-14 (56px, past
// the 44px iOS guidance) rather than a 20px box -- "comfortable with
// thumbs" is a hit-area property before it is a styling one.
//
// AT THE LIMIT, unpicked options are DISABLED rather than hidden or
// silently ignored. A player who has picked two of two can still see what
// they did not pick, and can still untick one to change their mind -- which
// is why the disable is per-option (only the unpicked ones) rather than a
// disabled fieldset. Hiding them would make the list appear to shrink as
// you use it.

import type { ResolvableChoice } from '~/lib/characters/rules-choices'
import {
  nextSelectionAfterToggle,
  type OfferedOption
} from '~/lib/characters/creation-choice-eligibility'
import {
  applySlotChange,
  draftFromAnswer,
  draftToAnswer,
  isNonDistinctMultiSelect,
  isSlotOptionAtCap
} from '~/components/characters/characterProgressionChoicePresentation'

// `offered` -- when given, every option the content offers, each annotated
// eligible/unavailable with a reason. An unavailable option stays visible,
// disabled, and explained, never silently removed. `choice.options` alone
// (the proficiencies page, for an existing character) is treated as all
// eligible, which is what the bridge already filtered it to.
const props = defineProps<{
  choice: ResolvableChoice
  selected: readonly string[]
  offered?: readonly OfferedOption[]
  prompt?: string
  optionLabels?: Record<string, string>
  // What this question belongs to ("Class", "Species") -- rendered so a
  // player with two skill choices open at once can tell them apart.
  slotLabel?: string
}>()

const emit = defineEmits<{ 'update:selected': [string[]] }>()

const displayed = computed<readonly OfferedOption[]>(() =>
  props.offered ?? props.choice.options.map((value) => ({ value, eligible: true }))
)

const remaining = computed(() => props.choice.count - props.selected.length)
const complete = computed(() => props.selected.length === props.choice.count)

function isSelected(option: string): boolean {
  return props.selected.includes(option)
}

function optionFor(option: string): OfferedOption | undefined {
  return displayed.value.find((candidate) => candidate.value === option)
}

// Disabled when unavailable (already acquired), or when the limit is reached
// and this option is not already one of the picks -- see the header.
function isDisabled(option: string): boolean {
  const offered = optionFor(option)
  if (offered && !offered.eligible) return true
  return remaining.value <= 0 && !isSelected(option)
}

function reasonFor(option: string): string | undefined {
  const offered = optionFor(option)
  return offered && !offered.eligible ? offered.reason : undefined
}

function labelFor(option: string): string {
  // Falls back to the raw id rather than inventing a label: an option the
  // package declares no label for should look unfinished, not plausible.
  return props.optionLabels?.[option] ?? option
}

function toggle(option: string) {
  emit('update:selected', nextSelectionAfterToggle({
    selected: props.selected,
    count: props.choice.count,
    offered: displayed.value
  }, option))
}

// P7 -- a REPEATABLE choice (`distinct: false`, more than one pick) answers one select per slot,
// because a checkbox cannot say "the same option twice". The draft keeps each slot's position
// (see characterProgressionChoicePresentation.ts); only the filled slots are emitted.
const isSlotMode = computed(() => isNonDistinctMultiSelect(props.choice))
const slotDraft = ref<string[]>(draftFromAnswer(props.selected, props.choice.count))

watch(() => props.selected, (next) => {
  if (JSON.stringify(draftToAnswer(slotDraft.value)) !== JSON.stringify(next)) {
    slotDraft.value = draftFromAnswer(next, props.choice.count)
  }
})

const slotIndexes = computed(() => Array.from({ length: props.choice.count }, (_, index) => index))

// Every offered option for one slot. An ineligible option is disabled with its reason; an option
// that already fills its ceiling in the OTHER slots is disabled. Both stay visible, never hidden.
function slotOptions(slotIndex: number) {
  return displayed.value.map((offered) => {
    const atCap = isSlotOptionAtCap(slotDraft.value, slotIndex, offered.value, props.choice.maxPerOption)
    return {
      value: offered.value,
      label: labelFor(offered.value),
      disabled: !offered.eligible || atCap,
      note: !offered.eligible ? offered.reason : atCap ? 'Maximum reached' : undefined
    }
  })
}

function onSlotSelect(slotIndex: number, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  slotDraft.value = applySlotChange(slotDraft.value, slotIndex, value)
  emit('update:selected', draftToAnswer(slotDraft.value))
}
</script>

<template>
  <fieldset class="min-w-0 border-0 p-0">
    <legend class="sr-only">
      {{ prompt || 'Choose your options' }}
    </legend>

    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p class="text-sm font-semibold text-[#fff7df]">
        <span
          v-if="slotLabel"
          class="text-[#9f9278]"
        >{{ slotLabel }}:</span>
        {{ prompt || 'Choose your options' }}
      </p>

      <!-- Progress is stated in words, never by colour alone. -->
      <p
        class="text-xs"
        :class="complete ? 'text-[#9ec37d]' : 'text-[#9f9278]'"
        aria-live="polite"
      >
        <template v-if="complete">
          {{ choice.count }} of {{ choice.count }} chosen
        </template>
        <template v-else>
          {{ selected.length }} of {{ choice.count }} chosen &mdash;
          choose {{ remaining }} more
        </template>
      </p>
    </div>

    <p
      v-if="!displayed.length"
      class="mt-3 text-xs text-[#9f9278]"
    >
      This choice offers no options, so there is nothing to pick.
    </p>

    <div
      v-else-if="isSlotMode"
      class="mt-3 grid gap-2 sm:grid-cols-2"
    >
      <label
        v-for="slotIndex in slotIndexes"
        :key="slotIndex"
        class="flex min-h-14 flex-col justify-center gap-1 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.55)] px-3 py-2"
      >
        <span class="text-xs text-[#9f9278]">Selection {{ slotIndex + 1 }}</span>
        <select
          class="min-h-11 bg-transparent text-sm text-[#e8dcc0]"
          :value="slotDraft[slotIndex]"
          @change="onSlotSelect(slotIndex, $event)"
        >
          <option value="">
            Choose&hellip;
          </option>
          <option
            v-for="option in slotOptions(slotIndex)"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled"
          >
            {{ option.label }}{{ option.note ? ` (${option.note})` : '' }}
          </option>
        </select>
      </label>
    </div>

    <div
      v-else-if="!isSlotMode"
      class="mt-3 grid gap-2 sm:grid-cols-2"
    >
      <label
        v-for="offered in displayed"
        :key="offered.value"
        class="flex min-h-14 cursor-pointer items-center gap-3 rounded-none border px-3 py-2 transition-colors"
        :class="[
          isSelected(offered.value)
            ? 'border-[rgba(201,164,90,0.65)] bg-[rgba(201,164,90,0.12)]'
            : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.55)]',
          isDisabled(offered.value)
            ? 'cursor-not-allowed opacity-45'
            : 'hover:border-[rgba(201,164,90,0.45)]'
        ]"
      >
        <input
          type="checkbox"
          class="size-5 shrink-0 accent-[#c9a45a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,164,90,0.65)]"
          :checked="isSelected(offered.value)"
          :disabled="isDisabled(offered.value)"
          @change="toggle(offered.value)"
        >
        <span class="min-w-0 text-sm text-[#e8dcc0]">
          {{ labelFor(offered.value) }}
          <span
            v-if="reasonFor(offered.value)"
            class="block text-xs text-[#9f9278]"
          >{{ reasonFor(offered.value) }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
