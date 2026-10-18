<script setup lang="ts">
// The viewer's own display preferences (Theming Architecture, Phase 2 --
// see .github/docs/architecture/theming.md). These are personal, apply in
// every World, and always override the GM's World theme.
import type { EldraAccessibilityPreferences } from '~/lib/eldra/themes'

// `compact`: icon-only trigger. `fill`: stretch to the container width
// (the collapsed workspace sidebar's icon column).
withDefaults(defineProps<{
  compact?: boolean
  fill?: boolean
}>(), {
  compact: false,
  fill: false
})

const preferences = useAccessibilityPreferences()

const options: { key: keyof EldraAccessibilityPreferences, label: string, hint: string }[] = [
  { key: 'reducedMotion', label: 'Reduce motion', hint: 'Turns off animations and ambient effects.' },
  { key: 'highContrast', label: 'High contrast', hint: 'Solid panels and stronger text and borders.' },
  { key: 'reduceTransparency', label: 'Reduce transparency', hint: 'Solid panels with no background blur.' }
]

function toggle(key: keyof EldraAccessibilityPreferences, value: boolean) {
  preferences.value = { ...preferences.value, [key]: value }
}
</script>

<template>
  <UPopover :content="{ side: fill ? 'right' : compact ? 'bottom' : 'top', align: compact && !fill ? 'end' : 'start' }">
    <button
      type="button"
      class="flex items-center justify-center gap-2 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-sm text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
      :class="compact ? ['h-10', fill ? 'w-full' : 'w-10'] : 'w-full px-3 py-2'"
      aria-label="Display and accessibility settings"
    >
      <UIcon name="i-lucide-accessibility" class="h-4 w-4" />
      <span v-if="!compact">Display &amp; Accessibility</span>
    </button>

    <template #content>
      <div class="w-72 border border-eldra-accent/24 bg-eldra-panel p-4 text-eldra-text">
        <div class="mb-3 text-[11px] uppercase tracking-[0.3em] text-[#9f9278]">
          Display &amp; Accessibility
        </div>

        <div class="grid gap-2">
          <label
            v-for="option in options"
            :key="option.key"
            class="flex cursor-pointer items-start justify-between gap-3 rounded-none border border-[rgba(201,164,90,0.16)] px-3 py-2"
          >
            <span>
              <span class="block text-sm">{{ option.label }}</span>
              <span class="block text-xs text-[#9f9278]">{{ option.hint }}</span>
            </span>
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 accent-[#c9a45a]"
              :checked="preferences[option.key]"
              @change="toggle(option.key, ($event.target as HTMLInputElement).checked)"
            >
          </label>
        </div>

        <p class="mt-3 text-xs leading-5 text-[#9f9278]">
          Saved on this device. These always override a World's theme.
        </p>
      </div>
    </template>
  </UPopover>
</template>
