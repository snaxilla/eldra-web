<script setup lang="ts">
// CharacterSheetSection -- the canonical Character Sheet panel wrapper.
// Character Sheet Beautification Pass, Phase 1 (see
// .github/docs/architecture/character-sheet-beauty-pass.md sections 7.2,
// 7.4, 8.1). Replaces the nine copy-pasted
// `<section class="eldra-ornate-panel eldra-frame-corners ...">` blocks
// that used to live directly in sheet-v2.vue's template with one
// component carrying the elevation/density system every later phase
// reuses -- re-parenting sections into a 3-column layout, a Vitals Bar,
// or tabs all build on this primitive instead of repeating markup.
//
// Elevation is a presentation tier, not a measure of importance -- 7.2
// reserves 'feature' for the Vitals Bar (Phase 3, not built yet, max one
// per screen) and 'quiet' for rail/list rows this page doesn't have yet
// either. Every section this phase migrates uses 'standard', the tier
// 7.2 assigns to ordinary tab content: this is the "stop applying one
// loud treatment to everything" fix the doc calls the single most
// important visual change, applied without moving, reordering, or
// removing anything.
//
// The content slot deliberately imposes no margin of its own -- each
// migrated section already carries its own correct spacing (`mt-2`,
// `mt-3`, or `mt-4`, chosen per section before this component existed)
// on its first inner node. Adding a wrapper margin here would double up
// with that and change spacing that Phase 1 is required to leave alone.

const props = withDefaults(defineProps<{
  heading?: string
  elevation?: 'feature' | 'standard' | 'quiet'
  density?: 'compact' | 'comfortable'
  collapsible?: boolean
  defaultOpen?: boolean
}>(), {
  heading: '',
  elevation: 'standard',
  density: 'comfortable',
  collapsible: false,
  defaultOpen: true
})

const isOpen = ref(props.defaultOpen)

const ELEVATION_CLASSES: Record<'feature' | 'standard' | 'quiet', string> = {
  // Matches the exact classes every section wrapper used before this
  // component existed -- the only tier in use until the Vitals Bar ships.
  feature: 'eldra-ornate-panel eldra-frame-corners border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] backdrop-blur',
  // 7.2: "Tab content sections" -- soft border, no corners, no blur.
  standard: 'eldra-codex-soft',
  // 7.2: "Hairline divider only" -- no panel, just a boundary. Not
  // `.eldra-panel-soft` (a pre-existing blue-toned class from a different
  // page family); this page's own gold hairline convention already
  // exists at the Conditions divider (sheet-v2.vue's Encounter section).
  quiet: 'border-b border-[rgba(201,164,90,0.14)]'
}

const DENSITY_PADDING: Record<'compact' | 'comfortable', string> = {
  compact: 'p-3',
  comfortable: 'p-5'
}

const sectionClass = computed(() => [
  'rounded-none',
  ELEVATION_CLASSES[props.elevation],
  DENSITY_PADDING[props.density]
])

function toggleOpen() {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <section :class="sectionClass">
    <div
      v-if="heading || $slots.heading || $slots['heading-end'] || collapsible"
      class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
    >
      <div class="flex items-baseline gap-2">
        <button
          v-if="collapsible"
          type="button"
          class="text-[#9f9278] transition hover:text-[#d8ceb8]"
          :aria-expanded="isOpen"
          @click="toggleOpen"
        >
          <UIcon
            name="i-lucide-chevron-down"
            class="h-3.5 w-3.5 transition-transform"
            :class="isOpen ? '' : '-rotate-90'"
          />
        </button>

        <slot name="heading">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            {{ heading }}
          </div>
        </slot>
      </div>

      <slot name="heading-end" />
    </div>

    <template v-if="collapsible">
      <div v-show="isOpen">
        <slot />
      </div>
    </template>
    <slot v-else />
  </section>
</template>
