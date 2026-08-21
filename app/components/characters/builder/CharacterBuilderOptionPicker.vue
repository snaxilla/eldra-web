<script setup lang="ts">
// One catalogue-backed choice (Species / Class / Background) for Character
// Builder V2. Rendered three times by
// app/pages/worlds/[id]/characters/create-v2.vue, identically on every
// viewport -- the page decides LAYOUT (stepper vs columns); this component
// decides nothing about platform and behaves the same everywhere.
//
// ---------------------------------------------------------------------------
// ACCESSIBILITY / INPUT
// ---------------------------------------------------------------------------
// Native `<input type="radio">` + `<label>`, not styled `<div>`s with click
// handlers. That single choice buys, with no JavaScript:
//   - real keyboard support (Tab into the group, Arrow keys move AND select,
//     Space confirms) -- this task's own UX section names keyboard support
//   - correct screen-reader semantics (an actual radiogroup with checked
//     state), rather than ARIA re-implemented by hand
//   - the whole card is the label, so the touch target is the full row
//     (min-h-14 = 56px, comfortably past the 44px iOS guidance) rather than
//     a small control
// The radio itself is visually hidden but never `display:none`/`hidden` --
// it must stay focusable and reachable for the above to hold.
//
// NO HOVER-DEPENDENT INFORMATION (this task's own UX section): hover only
// changes border/background tint. Everything a user needs to tell two
// options apart -- title, source book, package -- is always rendered.
// `focus-visible` gets its own ring so keyboard users see what mouse users
// see on hover.
//
// PROVENANCE IS NOT DECORATION: a World with both SRD 5.1 and XPHB bound has
// two "Human" species and two "Fighter" classes. When `options` contains
// duplicate titles the source book is the ONLY thing distinguishing two
// rows, so `hasAmbiguousTitles` forces it to render prominently rather than
// as muted secondary text. See characterBuilderSelection.ts design decision 1.

import {
  filterOptions,
  findOptionByKey,
  hasAmbiguousTitles,
  isSelectionHidden,
  optionKey,
  type BuilderCatalogueEntry
} from './characterBuilderSelection'

const props = withDefaults(defineProps<{
  label: string
  options: readonly BuilderCatalogueEntry[]
  modelValue: string
  name: string
  emptyMessage?: string
  compact?: boolean
}>(), {
  emptyMessage: 'No options are available from this World\'s bound Content Packs.',
  compact: false
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const query = ref('')

const visibleOptions = computed(() => filterOptions(props.options, query.value))
const ambiguous = computed(() => hasAmbiguousTitles(props.options))
const selectedEntry = computed(() => findOptionByKey(props.options, props.modelValue))
// A search that hides the current choice must not look like it cleared it.
const selectionHidden = computed(() => isSelectionHidden(visibleOptions.value, props.modelValue))
// Search only earns its screen space once a list is long enough to need it;
// XPHB alone has 10 species, so this stays hidden for small categories.
const showSearch = computed(() => props.options.length > 8)

function select(entry: BuilderCatalogueEntry) {
  emit('update:modelValue', optionKey(entry))
}
</script>

<template>
  <fieldset class="min-w-0 border-0 p-0">
    <legend class="sr-only">{{ label }}</legend>

    <div
      v-if="showSearch"
      class="mb-3"
    >
      <label
        :for="`${name}-search`"
        class="sr-only"
      >Search {{ label }}</label>
      <input
        :id="`${name}-search`"
        v-model="query"
        type="search"
        autocomplete="off"
        :placeholder="`Search ${label.toLowerCase()}…`"
        class="min-h-11 w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-4 py-2.5 text-base text-[#fff7df] outline-none focus-visible:border-[rgba(201,164,90,0.58)] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.35)] sm:text-sm"
      >
    </div>

    <!-- The current choice stays stated even when the search hides its row,
         so filtering never reads as "my selection was cleared". -->
    <p
      v-if="selectionHidden && selectedEntry"
      class="mb-3 rounded-none border border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.12)] px-3 py-2 text-xs text-[#f5e7bd]"
    >
      Selected: <strong class="font-semibold">{{ selectedEntry.title }}</strong>
      <template v-if="selectedEntry.sourceBook"> · {{ selectedEntry.sourceBook }}</template>
      <span class="text-[#c9b98d]"> — not shown by this search</span>
    </p>

    <p
      v-if="!options.length"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-4 text-sm text-[#9f9278]"
    >
      {{ emptyMessage }}
    </p>

    <p
      v-else-if="!visibleOptions.length"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-4 text-sm text-[#9f9278]"
    >
      No {{ label.toLowerCase() }} matches “{{ query }}”.
    </p>

    <div
      v-else
      class="grid gap-2"
      :class="compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'"
    >
      <label
        v-for="entry in visibleOptions"
        :key="optionKey(entry)"
        class="group relative flex min-h-14 cursor-pointer items-center gap-3 rounded-none border px-4 py-3 transition"
        :class="modelValue === optionKey(entry)
          ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)]'
          : 'border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.08)]'"
      >
        <input
          :name="name"
          type="radio"
          class="peer sr-only"
          :value="optionKey(entry)"
          :checked="modelValue === optionKey(entry)"
          @change="select(entry)"
        >

        <!-- Selection indicator: shape + fill, never colour alone. -->
        <span
          aria-hidden="true"
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition"
          :class="modelValue === optionKey(entry)
            ? 'border-[rgba(201,164,90,0.85)] bg-[rgba(201,164,90,0.85)]'
            : 'border-[rgba(201,164,90,0.35)]'"
        >
          <span
            v-if="modelValue === optionKey(entry)"
            class="h-2 w-2 rounded-full bg-[#12100b]"
          />
        </span>

        <span class="min-w-0 flex-1">
          <span class="block truncate text-base font-semibold text-[#fff7df]">
            {{ entry.title }}
          </span>
          <span
            class="mt-0.5 block truncate text-xs"
            :class="ambiguous ? 'text-[#d8ceb8]' : 'text-[#9f9278]'"
          >
            <template v-if="entry.sourceBook">{{ entry.sourceBook }} · </template>{{ entry.packageId }}
          </span>
        </span>

        <!-- Keyboard focus ring, matched to what hover shows a mouse user. -->
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 ring-2 ring-transparent peer-focus-visible:ring-[rgba(201,164,90,0.65)]"
        />
      </label>
    </div>

    <p
      v-if="options.length"
      class="mt-2 text-xs text-[#6f6754]"
    >
      {{ visibleOptions.length }} of {{ options.length }} shown
    </p>
  </fieldset>
</template>
