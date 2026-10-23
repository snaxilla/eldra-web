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
  creationUnavailableReason,
  filterOptions,
  findOptionByKey,
  hasAmbiguousTitles,
  isSelectionHidden,
  optionKey,
  type BuilderCatalogueEntry
} from './characterBuilderSelection'
import CreationEntityEmblem from './CreationEntityEmblem.vue'

const props = withDefaults(defineProps<{
  label: string
  options: readonly BuilderCatalogueEntry[]
  modelValue: string
  name: string
  emptyMessage?: string
  compact?: boolean
  // CHARACTER CREATOR V3 -- presentation of the SAME native radio group:
  //   cards (default, original) -- roomy cards with an emblem
  //   list  -- a slim vertical roster of portrait rows (Species, Background)
  //   strip -- a horizontal row of portrait medallions (Class)
  // Selection, search, disabled/unavailable handling, keyboard behaviour and
  // accessibility are identical in every variant.
  variant?: 'cards' | 'list' | 'strip'
}>(), {
  emptyMessage: 'No options are available from this World\'s bound Content Packs.',
  compact: false,
  variant: 'cards'
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

// A visible-but-unavailable option (creationUnavailableReason) is disabled with its
// reason and never emits a selection. create-v2 POST enforces the same rule.
function select(entry: BuilderCatalogueEntry) {
  if (creationUnavailableReason(entry)) return
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
        class="eldra-input min-h-11 w-full rounded-none px-4 py-2.5 text-base sm:text-sm"
      >
    </div>

    <!-- The current choice stays stated even when the search hides its row,
         so filtering never reads as "my selection was cleared". -->
    <p
      v-if="selectionHidden && selectedEntry"
      class="mb-3 rounded-none border border-eldra-accent/42 bg-eldra-accent/12 px-3 py-2 text-xs text-eldra-text-strong"
    >
      Selected: <strong class="font-semibold">{{ selectedEntry.title }}</strong>
      <template v-if="selectedEntry.sourceBook"> · {{ selectedEntry.sourceBook }}</template>
      <span class="text-eldra-accent-text"> — not shown by this search</span>
    </p>

    <p
      v-if="!options.length"
      class="rounded-none border border-dashed border-eldra-accent/24 p-4 text-sm text-eldra-text-faint"
    >
      {{ emptyMessage }}
    </p>

    <p
      v-else-if="!visibleOptions.length"
      class="rounded-none border border-dashed border-eldra-accent/24 p-4 text-sm text-eldra-text-faint"
    >
      No {{ label.toLowerCase() }} matches “{{ query }}”.
    </p>

    <!-- Visual option cards (this task's own reusable-component requirement):
         bigger than a plain list row, an emblem so each option reads as a
         "someone"/"something" rather than a line of text, but still a
         native radio + label underneath -- see this file's own header on
         why that accessibility shape is never replaced by a styled div. -->
    <div
      v-else
      :class="variant === 'strip'
        ? 'creator-strip flex snap-x gap-2 overflow-x-auto pb-2'
        : variant === 'list'
          ? 'grid gap-1.5'
          : ['grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2']"
    >
      <label
        v-for="entry in visibleOptions"
        :key="optionKey(entry)"
        :class="[
          creationUnavailableReason(entry) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          variant === 'cards' && 'eldra-card-glyph group relative flex min-h-20 items-center gap-4 rounded-none border px-4 py-3 transition',
          variant === 'list' && 'group relative flex min-h-14 items-center gap-3 rounded-none border py-1.5 pl-1.5 pr-3 backdrop-blur-sm transition',
          variant === 'strip' && 'group relative flex w-[4.75rem] shrink-0 snap-start flex-col items-center gap-1 rounded-none border px-1 pb-1.5 pt-1.5 backdrop-blur-sm transition',
          modelValue === optionKey(entry)
            ? (variant === 'cards' ? 'eldra-ornate-card border-eldra-accent/62' : 'border-eldra-accent-bright/80 bg-eldra-accent/22 shadow-[0_0_22px_rgb(var(--eldra-accent-rgb)/0.35)]')
            : (variant === 'cards' ? 'border-eldra-accent/26 bg-eldra-panel/68 hover:border-eldra-accent/42 hover:bg-eldra-accent/8' : 'border-eldra-accent/20 bg-eldra-ink/62 hover:border-eldra-accent/45 hover:bg-eldra-ink/80')
        ]"
      >
        <input
          :name="name"
          type="radio"
          class="peer sr-only"
          :value="optionKey(entry)"
          :checked="modelValue === optionKey(entry)"
          :disabled="!!creationUnavailableReason(entry)"
          @change="select(entry)"
        >

        <CreationEntityEmblem
          :title="entry.title"
          :image-url="entry.presentation?.image?.url"
          :size="variant === 'strip' ? 'md' : variant === 'list' ? 'md' : 'sm'"
        />

        <span
          v-if="variant === 'strip'"
          class="w-full min-w-0 text-center"
        >
          <span class="block truncate text-[0.7rem] font-semibold text-eldra-text-strong">{{ entry.title }}</span>
          <span
            v-if="ambiguous && entry.sourceBook"
            class="block truncate text-[0.6rem] text-eldra-text-faint"
          >{{ entry.sourceBook }}</span>
          <span
            v-if="creationUnavailableReason(entry)"
            class="sr-only"
          >Not available yet. {{ creationUnavailableReason(entry) }}</span>
        </span>

        <span
          v-else
          class="min-w-0 flex-1"
        >
          <span
            class="block truncate font-serif font-semibold text-eldra-text-strong"
            :class="variant === 'list' ? 'text-base' : 'text-lg'"
          >
            {{ entry.title }}
          </span>
          <span
            v-if="variant === 'cards' || (ambiguous && entry.sourceBook)"
            class="mt-0.5 block truncate text-xs"
            :class="ambiguous ? 'text-eldra-text-soft' : 'text-eldra-text-faint'"
          >
            <template v-if="entry.sourceBook">{{ entry.sourceBook }}</template><template v-if="variant === 'cards'"> · {{ entry.packageId }}</template>
          </span>
          <span
            v-if="creationUnavailableReason(entry)"
            class="mt-1 block text-xs text-eldra-caution"
          >
            Not available yet. {{ creationUnavailableReason(entry) }}
          </span>
        </span>

        <!-- Selection indicator: shape + fill, never colour alone. The strip
             shows selection as a ring + check badge instead of a radio dot. -->
        <span
          v-if="variant === 'strip' && modelValue === optionKey(entry)"
          aria-hidden="true"
          class="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-eldra-accent-bright text-eldra-ink"
        >
          <UIcon
            name="i-lucide-check"
            class="size-3"
          />
        </span>
        <span
          v-if="variant !== 'strip'"
          aria-hidden="true"
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition"
          :class="modelValue === optionKey(entry)
            ? 'border-eldra-accent-bright bg-eldra-accent-bright'
            : 'border-eldra-accent/35'"
        >
          <span
            v-if="modelValue === optionKey(entry)"
            class="h-2 w-2 rounded-full bg-eldra-ink"
          />
        </span>

        <!-- Keyboard focus ring, matched to what hover shows a mouse user. -->
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 ring-2 ring-transparent peer-focus-visible:ring-eldra-accent/65"
        />
      </label>
    </div>

    <p
      v-if="options.length && (variant === 'cards' || query)"
      class="mt-2 text-xs text-eldra-text-faint"
    >
      {{ visibleOptions.length }} of {{ options.length }} shown
    </p>
  </fieldset>
</template>
