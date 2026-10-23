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
import type { PresentationEntry } from '~/lib/content-presentation'
import {
  nextSelectionAfterToggle,
  type OfferedOption
} from '~/lib/characters/creation-choice-eligibility'
import {
  applySlotChange,
  draftFromAnswer,
  draftToAnswer,
  isNonDistinctMultiSelect,
  isSlotOptionAtCap,
  shouldShowInspectedDetail
} from '~/components/characters/characterProgressionChoicePresentation'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import CreationDetailPanel from '~/components/characters/builder/CreationDetailPanel.vue'

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
  // CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- SPELL DISCOVERY. When given, every option
  // gains its own "Details" trigger, opening the SAME ContentPresentationPanel the Species/
  // Class/Background preview already uses, fed by this option's real resolved presentation
  // (level/school/casting time/range/duration/components/effect text). Absent (every caller
  // before this phase -- proficiencies, feat-granted content) means no trigger renders at all,
  // byte-identical old behavior. Inspecting NEVER selects -- the trigger is a separate control,
  // outside the selection <label>, and never disabled by the option's own selected/at-cap state
  // (this task's own "selecting must not prevent inspecting or replacing" requirement).
  optionDetails?: Record<string, PresentationEntry | null | undefined>
  // CHARACTER CREATOR V3 -- 'inspector' (requires optionDetails) lays the SAME choice out as a
  // selectable roster beside a persistent detail inspector, so reading a spell and picking it
  // are two separate, simultaneous interactions: "Details" only changes what the inspector
  // shows, the checkbox only changes the selection. 'grid' (default) is the original layout.
  layout?: 'grid' | 'inspector'
}>()

const emit = defineEmits<{ 'update:selected': [string[]] }>()

const inspectedValue = ref<string | null>(null)
function toggleInspect(option: string) {
  inspectedValue.value = inspectedValue.value === option ? null : option
}

// Inspector layout: always has something to show (the player's last inspection, else their
// first pick, else the first option), so the detail region is never an empty hole. Inspecting
// only ever moves this pointer; it never touches the selection.
const inspectorValue = computed<string | null>(() =>
  inspectedValue.value
  ?? props.selected[0]
  ?? displayed.value[0]?.value
  ?? null
)
function inspect(option: string) {
  inspectedValue.value = option
}
// "Cantrip · Divination" from the spell's own resolved Level/School facts, for the roster
// subtitle. Display only: absent facts simply yield no subtitle.
function subtitleFor(option: string): string {
  const facts = props.optionDetails?.[option]?.facts ?? []
  return ['Level', 'School']
    .map((label) => facts.find((fact) => fact.label === label)?.value)
    .filter(Boolean)
    .join(' · ')
}

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
      <p class="font-serif text-sm font-semibold text-eldra-text-strong">
        <span
          v-if="slotLabel"
          class="font-sans text-eldra-text-faint"
        >{{ slotLabel }}:</span>
        {{ prompt || 'Choose your options' }}
      </p>

      <!-- Progress is stated in words, never by colour alone. -->
      <p
        class="text-xs"
        :class="complete ? 'text-eldra-positive' : 'text-eldra-text-faint'"
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
      class="mt-3 text-xs text-eldra-text-faint"
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
        class="flex min-h-14 flex-col justify-center gap-1 rounded-none border border-eldra-accent/24 bg-eldra-panel/68 px-3 py-2"
      >
        <span class="text-xs text-eldra-text-faint">Selection {{ slotIndex + 1 }}</span>
        <select
          class="min-h-11 bg-transparent text-sm text-eldra-text-soft"
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

    <!-- CHARACTER CREATOR V3 -- inspector layout. -->
    <div
      v-else-if="layout === 'inspector' && optionDetails"
      class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-start"
    >
      <ul class="grid min-w-0 gap-1.5">
        <li
          v-for="item in displayed"
          :key="item.value"
          class="flex min-h-14 items-stretch rounded-none border backdrop-blur-sm transition-colors"
          :class="isSelected(item.value)
            ? 'border-eldra-accent-bright/80 bg-eldra-accent/20 shadow-[0_0_18px_rgb(var(--eldra-accent-rgb)/0.25)]'
            : inspectorValue === item.value ? 'border-eldra-accent/55 bg-eldra-ink/72' : 'border-eldra-accent/20 bg-eldra-ink/62'"
        >
          <label
            class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
            :class="isDisabled(item.value) ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-eldra-accent/8'"
          >
            <input
              type="checkbox"
              class="size-5 shrink-0 accent-eldra-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eldra-accent/65"
              :checked="isSelected(item.value)"
              :disabled="isDisabled(item.value)"
              @change="toggle(item.value)"
            >
            <span class="min-w-0">
              <span class="block truncate font-serif text-base font-semibold text-eldra-text-strong">{{ labelFor(item.value) }}</span>
              <span
                v-if="subtitleFor(item.value)"
                class="block truncate text-xs text-eldra-text-faint"
              >{{ subtitleFor(item.value) }}</span>
              <span
                v-if="reasonFor(item.value)"
                class="block text-xs text-eldra-caution"
              >{{ reasonFor(item.value) }}</span>
            </span>
          </label>
          <button
            type="button"
            class="min-h-11 shrink-0 border-l border-eldra-accent/20 px-3 text-xs font-semibold uppercase tracking-[0.1em] text-eldra-accent-text hover:bg-eldra-accent/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-eldra-accent/65"
            :aria-pressed="inspectorValue === item.value"
            :aria-label="`Details for ${labelFor(item.value)}`"
            @click="inspect(item.value)"
          >
            Details
          </button>
        </li>
      </ul>

      <aside
        v-if="inspectorValue"
        class="min-w-0 border border-eldra-accent/30 bg-eldra-ink/80 p-4 backdrop-blur-md md:sticky md:top-20"
        aria-live="polite"
      >
        <p class="eldra-kicker text-[0.65rem]">
          {{ subtitleFor(inspectorValue) || 'Details' }}
        </p>
        <h4 class="mt-1 font-serif text-2xl font-semibold text-eldra-text-strong">
          {{ labelFor(inspectorValue) }}
        </h4>
        <div class="mt-3">
          <ContentPresentationPanel
            :entry="optionDetails[inspectorValue] ?? null"
            empty-message="This Content Pack publishes no further details for this option."
            context="preview"
          />
        </div>
      </aside>
    </div>

    <div
      v-else-if="!isSlotMode"
      class="mt-3 grid gap-2 sm:grid-cols-2"
    >
      <div
        v-for="offered in displayed"
        :key="offered.value"
        class="flex min-h-14 items-stretch gap-1 rounded-none border transition-colors"
        :class="isSelected(offered.value)
          ? 'border-eldra-accent/65 bg-eldra-accent/12'
          : 'border-eldra-accent/26 bg-eldra-panel/68'"
      >
        <label
          class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
          :class="isDisabled(offered.value) ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-eldra-accent/8'"
        >
          <input
            type="checkbox"
            class="size-5 shrink-0 accent-eldra-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eldra-accent/65"
            :checked="isSelected(offered.value)"
            :disabled="isDisabled(offered.value)"
            @change="toggle(offered.value)"
          >
          <span class="min-w-0 text-sm text-eldra-text-soft">
            {{ labelFor(offered.value) }}
            <span
              v-if="reasonFor(offered.value)"
              class="block text-xs text-eldra-text-faint"
            >{{ reasonFor(offered.value) }}</span>
          </span>
        </label>

        <!-- CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- SPELL DISCOVERY. A separate
             control, outside the selection <label>, so inspecting never toggles the checkbox --
             and never disabled by isDisabled(), so a fully-picked or ineligible option can
             still be inspected (this task's own explicit requirement). -->
        <button
          v-if="optionDetails && offered.value in optionDetails"
          type="button"
          class="shrink-0 px-2 text-xs font-semibold uppercase tracking-[0.08em] text-eldra-accent-text underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
          :aria-expanded="inspectedValue === offered.value"
          @click="toggleInspect(offered.value)"
        >
          {{ inspectedValue === offered.value ? 'Hide' : 'Details' }}
        </button>
      </div>

      <!-- CONTENT PRESENTATION REPAIR (B1) -- the panel renders even when this
           option's own resolved presentation is null, rather than the
           wrapper disappearing while the button still reads "Hide". A spell
           with genuinely no readable metadata must degrade to an honest
           "no details published" message (ContentPresentationPanel's own
           built-in empty state), never to a toggle that visibly does
           nothing. -->
      <div
        v-if="inspectedValue && shouldShowInspectedDetail(optionDetails, inspectedValue)"
        class="sm:col-span-2"
      >
        <CreationDetailPanel :title="labelFor(inspectedValue)">
          <ContentPresentationPanel
            :entry="optionDetails?.[inspectedValue] ?? null"
            empty-message="This Content Pack publishes no further details for this option."
            context="preview"
          />
        </CreationDetailPanel>
      </div>
    </div>
  </fieldset>
</template>
