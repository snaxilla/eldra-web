<script setup lang="ts">
// Character Creator V3 -- starting-equipment packages, presented as a few
// large, readable "kit" cards rather than a radio list: each package shows a
// glyph, its human-readable name, and one line per item with its quantity.
// Still a native radio group per choice (keyboard, screen-reader and touch
// behaviour unchanged); selecting emits the SAME (choiceId, bundleId) pair the
// page already applied through setEquipmentSelection.
//
// Items come pre-resolved from equipmentChoiceSections (titles, quantities,
// cross-reference grants) -- this component never sees an internal id.

import type { EquipmentChoiceSection } from './characterBuilderSelection'

defineProps<{
  sections: readonly EquipmentChoiceSection[]
  slotLabels: Record<string, string>
}>()

const emit = defineEmits<{ select: [choiceId: string, bundleId: string] }>()

// Purely visual: coin packages get a coin glyph, everything else a pack.
const CURRENCY = /\b(gp|sp|cp|ep|pp|gold|silver|copper|platinum|coins?)\b/i
function glyphFor(items: readonly string[]): string {
  return items.length && items.every((item) => CURRENCY.test(item)) ? 'i-lucide-coins' : 'i-lucide-backpack'
}
</script>

<template>
  <div class="grid gap-8">
    <fieldset
      v-for="section in sections"
      :key="section.choiceId"
      class="min-w-0 border-0 p-0"
    >
      <legend class="mb-3 font-serif text-xl font-semibold text-eldra-text-strong">
        Choose a starting equipment option
        <span class="font-sans text-sm font-normal text-eldra-text-faint">({{ slotLabels[section.slot] }})</span>
      </legend>

      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label
          v-for="bundle in section.bundles"
          :key="bundle.id"
          class="group relative flex min-h-36 cursor-pointer flex-col gap-3 border p-4 backdrop-blur-sm transition"
          :class="section.selectedBundleId === bundle.id
            ? 'border-eldra-accent-bright/80 bg-eldra-accent/18 shadow-[0_0_26px_rgb(var(--eldra-accent-rgb)/0.3)]'
            : 'border-eldra-accent/25 bg-eldra-ink/68 hover:border-eldra-accent/50 hover:bg-eldra-ink/80'"
        >
          <input
            :name="`equipment-${section.choiceId}`"
            type="radio"
            class="peer sr-only"
            :value="bundle.id"
            :checked="section.selectedBundleId === bundle.id"
            @change="emit('select', section.choiceId, bundle.id)"
          >

          <span class="flex items-center gap-3">
            <span
              aria-hidden="true"
              class="flex size-12 shrink-0 items-center justify-center rounded-full border border-eldra-accent/50 bg-eldra-ink/70 text-eldra-accent-bright"
            >
              <UIcon
                :name="glyphFor(bundle.items)"
                class="size-6"
              />
            </span>
            <span class="min-w-0 flex-1 font-serif text-lg font-semibold leading-tight text-eldra-text-strong">{{ bundle.label }}</span>
            <span
              v-if="section.selectedBundleId === bundle.id"
              class="flex size-6 shrink-0 items-center justify-center rounded-full bg-eldra-accent-bright text-eldra-ink"
            >
              <UIcon
                name="i-lucide-check"
                class="size-4"
              />
              <span class="sr-only">Selected</span>
            </span>
          </span>

          <ul
            v-if="bundle.items.length"
            class="grid gap-1 text-sm text-eldra-text-soft"
          >
            <li
              v-for="(item, index) in bundle.items"
              :key="index"
              class="flex gap-2"
            >
              <span
                aria-hidden="true"
                class="mt-2 size-1 shrink-0 rotate-45 bg-eldra-accent"
              />
              <span class="min-w-0">{{ item }}</span>
            </li>
          </ul>

          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 ring-2 ring-transparent peer-focus-visible:ring-eldra-accent/65"
          />
        </label>
      </div>
    </fieldset>
  </div>
</template>
