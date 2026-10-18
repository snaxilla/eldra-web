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

const anyEnabled = computed(() => Object.values(preferences.value).some(Boolean))

function reset() {
  preferences.value = { reducedMotion: false, highContrast: false, reduceTransparency: false }
}
</script>

<template>
  <UPopover :content="{ side: fill ? 'right' : compact ? 'bottom' : 'top', align: compact && !fill ? 'end' : 'start' }">
    <button
      type="button"
      class="flex items-center justify-center gap-2 rounded-none border border-eldra-accent/24 bg-eldra-panel/72 text-sm text-eldra-text-soft transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong"
      :class="compact ? ['h-10', fill ? 'w-full' : 'w-10'] : 'w-full px-3 py-2'"
      aria-label="Display and accessibility settings"
    >
      <UIcon name="i-lucide-accessibility" class="h-4 w-4" />
      <span v-if="!compact">Display &amp; Accessibility</span>
    </button>

    <template #content>
      <div class="w-80 p-4 text-eldra-text" role="group" aria-labelledby="eldra-a11y-heading">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-accessibility" class="h-4 w-4 text-eldra-accent" />
          <h2 id="eldra-a11y-heading" class="eldra-display text-sm text-eldra-text-strong">
            Display &amp; Accessibility
          </h2>
        </div>
        <span class="eldra-ornament-divider mt-2" aria-hidden="true" />

        <div class="mt-3 grid gap-1">
          <div
            v-for="option in options"
            :key="option.key"
            class="flex items-start justify-between gap-3 px-1 py-2"
          >
            <label :for="`eldra-a11y-${option.key}`" class="cursor-pointer">
              <span class="block text-sm text-eldra-text-strong">{{ option.label }}</span>
              <span class="block text-xs leading-5 text-eldra-text-faint">{{ option.hint }}</span>
            </label>
            <USwitch
              :id="`eldra-a11y-${option.key}`"
              :model-value="preferences[option.key]"
              class="mt-0.5"
              @update:model-value="toggle(option.key, Boolean($event))"
            />
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-eldra-accent/14 pt-3">
          <p class="text-xs leading-5 text-eldra-text-faint">
            Saved on this device. Always overrides a World's theme.
          </p>
          <UButton
            v-if="anyEnabled"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="reset"
          >
            Reset
          </UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>
