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

const props = defineProps<{
  choice: ResolvableChoice
  selected: readonly string[]
  prompt?: string
  optionLabels?: Record<string, string>
  // What this question belongs to ("Class", "Species") -- rendered so a
  // player with two skill choices open at once can tell them apart.
  slotLabel?: string
}>()

const emit = defineEmits<{ 'update:selected': [string[]] }>()

const remaining = computed(() => props.choice.count - props.selected.length)
const atLimit = computed(() => remaining.value <= 0)
const complete = computed(() => props.selected.length === props.choice.count)

function isSelected(option: string): boolean {
  return props.selected.includes(option)
}

// Disabled only when the limit is reached AND this option is not already
// one of the picks -- see the header.
function isDisabled(option: string): boolean {
  return atLimit.value && !isSelected(option)
}

function labelFor(option: string): string {
  // Falls back to the raw id rather than inventing a label: an option the
  // package declares no label for should look unfinished, not plausible.
  return props.optionLabels?.[option] ?? option
}

function toggle(option: string) {
  if (isSelected(option)) {
    emit('update:selected', props.selected.filter((item) => item !== option))
    return
  }

  if (atLimit.value) return

  emit('update:selected', [...props.selected, option])
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
      v-if="!choice.options.length"
      class="mt-3 text-xs text-[#9f9278]"
    >
      This choice offers no options, so there is nothing to pick.
    </p>

    <div
      v-else
      class="mt-3 grid gap-2 sm:grid-cols-2"
    >
      <label
        v-for="option in choice.options"
        :key="option"
        class="flex min-h-14 cursor-pointer items-center gap-3 rounded-none border px-3 py-2 transition-colors"
        :class="[
          isSelected(option)
            ? 'border-[rgba(201,164,90,0.65)] bg-[rgba(201,164,90,0.12)]'
            : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.55)]',
          isDisabled(option)
            ? 'cursor-not-allowed opacity-45'
            : 'hover:border-[rgba(201,164,90,0.45)]'
        ]"
      >
        <input
          type="checkbox"
          class="size-5 shrink-0 accent-[#c9a45a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,164,90,0.65)]"
          :checked="isSelected(option)"
          :disabled="isDisabled(option)"
          @change="toggle(option)"
        >
        <span class="min-w-0 text-sm text-[#e8dcc0]">
          {{ labelFor(option) }}
        </span>
      </label>
    </div>
  </fieldset>
</template>
