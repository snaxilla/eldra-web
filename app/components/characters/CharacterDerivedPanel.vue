<script setup lang="ts">
// Derived values from the Rules Engine -- rules-package-architecture.md
// §11.3/§13.1.
//
// THIS COMPONENT CALCULATES NOTHING. It receives a list of already-evaluated
// entries and renders them. There is no arithmetic in this file, no ability
// name, no skill name, and no Definition ID -- it could render a Call of
// Cthulhu sanity track or a Cyberpunk humanity score with no change,
// because it does not know what it is showing.
//
// That is the point of §13.1: "A sheet may render a value it does not
// understand. It must never invent one it does." Every number here came off
// the engine; the only decisions this file makes are typographic.
//
// ---------------------------------------------------------------------------
// HOW A VALUE IS RENDERED
// ---------------------------------------------------------------------------
// The engine returns `RuleValue`, which is a union. Booleans are the
// interesting case: a proficiency flag reads far better as a filled or empty
// marker than as the word "false", and shape-plus-text (not colour alone)
// keeps it legible without relying on tint. Numbers are signed when the
// package tags them as a modifier-like value, because "+2" and "2" mean
// different things on a character sheet -- and the TAG makes that a
// package-declared fact rather than a guess this component makes about ids.

// `display` used to live here. It is now `formatDerivedValue` in
// characterDerivedValues.ts, unchanged, because the skills/saves/ability
// tables added by the desktop IA pass render numbers by the same rule --
// one copy of "signed only when the package tags it as modifier-like",
// four renderers.
import { formatDerivedValue, type DerivedValue } from './characterDerivedValues'

const props = withDefaults(defineProps<{
  entries?: DerivedValue[]
  emptyMessage?: string
}>(), {
  entries: () => [],
  emptyMessage: 'Nothing derived for this section.'
})

// Booleans render as a marker rather than a word.
function isBoolean(entry: DerivedValue): boolean {
  return typeof entry.value === 'boolean'
}

const display = formatDerivedValue

const rows = computed(() => props.entries)
</script>

<template>
  <div class="@container min-w-0">
    <p
      v-if="!rows.length"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-4 text-sm text-[#9f9278]"
    >
      {{ emptyMessage }}
    </p>

    <dl
      v-else
      class="grid grid-cols-1 gap-x-6 gap-y-2 @sm:grid-cols-2 @2xl:grid-cols-3"
    >
      <div
        v-for="entry in rows"
        :key="entry.id"
        class="flex min-w-0 items-baseline justify-between gap-3 border-b border-[rgba(201,164,90,0.12)] pb-1"
      >
        <dt class="min-w-0 break-words text-sm text-[#d8ceb8]">
          {{ entry.label || entry.id }}
        </dt>

        <dd class="shrink-0 text-right">
          <!-- An evaluation failure is shown, never hidden behind a zero. -->
          <span
            v-if="entry.error"
            :title="entry.error"
            class="text-xs uppercase tracking-[0.1em] text-red-300"
          >Error</span>

          <!-- Shape + text, never colour alone. -->
          <span
            v-else-if="isBoolean(entry)"
            class="text-sm font-semibold"
            :class="entry.value ? 'text-[#fff7df]' : 'text-[#6f6754]'"
          >
            <span aria-hidden="true">{{ entry.value ? '●' : '○' }}</span>
            <span class="sr-only">{{ entry.value ? 'Proficient' : 'Not proficient' }}</span>
          </span>

          <span
            v-else
            class="text-base font-semibold tabular-nums text-[#fff7df]"
          >{{ display(entry) }}</span>
        </dd>
      </div>
    </dl>
  </div>
</template>
