<script setup lang="ts">
// CharacterSheetSection -- the canonical Character Sheet panel wrapper.
// Character Sheet Beautification Pass, Phase 1 (see
// .github/docs/architecture/character-sheet-beauty-pass.md, sections 7.2
// "Panel elevation", 7.4 "Spacing & density", and 8.1). Replaces the nine
// copy-pasted `<section class="eldra-ornate-panel eldra-frame-corners
// ...">` blocks that used to live directly in sheet-v2.vue's template with
// one component every later phase reuses instead of repeating markup.
//
// Elevation is a presentation tier, not a statement of importance -- section
// 7.2 reserves 'feature' for the Vitals Bar (Phase 3, doesn't exist yet,
// max one per screen) and 'quiet' for rail/list rows (don't exist on this
// page yet either). Every section this phase migrates uses 'standard', the
// tier section 7.2 assigns to ordinary tab content -- replacing "one loud
// ornate treatment on all nine sections" with the calmer standard
// treatment is the doc's own "single most important visual fix", applied
// here without moving, reordering, or removing anything.
//
// The content slot never imposes its own margin: every section being
// migrated already carries its own top-margin on its first content node
// (`mt-2`/`mt-3`/`mt-4`, inconsistent by design -- each one matches what
// that content actually needs), and adding a second margin here would
// double up spacing rather than preserve it.

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

function toggleOpen() {
  isOpen.value = !isOpen.value
}

const ELEVATION_CLASSES: Record<'feature' | 'standard' | 'quiet', string> = {
  feature: 'eldra-ornate-panel eldra-frame-corners border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] backdrop-blur',
  standard: 'eldra-codex-soft',
  // "Hairline divider only" per section 7.2 -- deliberately not
  // `.eldra-panel-soft`, whose hardcoded blue tone belongs to a different
  // page family than this sheet's gold/ink palette. Formalized as the
  // reusable `.eldra-quiet` primitive (eldra-fieldguide.css) by
  // Material Phase 1 (eldra-design-language.md §2/§8) instead of an
  // inline string here. Unused by any section yet; included so the tier
  // exists correctly once a later phase has rail/list content to apply
  // it to.
  quiet: 'eldra-quiet'
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

const showHeader = computed(() => Boolean(props.heading) || props.collapsible)
</script>

<template>
  <section :class="sectionClass">
    <div
      v-if="showHeader"
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
