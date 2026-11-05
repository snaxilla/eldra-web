<script setup lang="ts">
// CharacterSheetDesktopLayout -- the DESKTOP presentation of the V2
// Character Sheet (Phase 4C). Rewritten in place: this file previously held
// the pre-4B two-region layout, unused since Phase 4B.
//
// Dense workspace: the compact header, then a reference column
// (abilities, saves, reference values, proficiencies), the skills table,
// and the tabbed main workspace. Columns respond to the sheet CONTAINER
// (`@container/sheet`), never to whether the inspector is open:
//
//   >= 1240px  rail | skills | main
//    <  1240px  reference column (skills beneath) | main
//
// There is no section-at-a-time mode here at any width -- that is the
// companion presentation's job (CharacterSheetCompanionLayout.vue), chosen
// by the page from the workspace width, not by this layout shrinking.
//
// The inspector is Eldra's ONE context drawer (WorldEntityContextDrawer).
// Full density: its standard right-rail form, the sheet contracting beside
// it (the page pads the workspace). Compact density: the same drawer in
// the bottom sheet, so the columns are never covered. The page decides.
import CharacterSheetBottomSheet from '~/components/characters/CharacterSheetBottomSheet.vue'
import type { CharacterSheetSection, CharacterSheetSectionKey } from '~/composables/useCharacterSheetLayout'

const props = withDefaults(defineProps<{
  sections: readonly CharacterSheetSection[]
  mainSection: CharacterSheetSectionKey
  // Phase 4C: 'rail' -- the workspace right rail (full desktop, the sheet
  // contracts beside it). 'sheet' -- the bottom sheet (compact desktop),
  // so nothing is laid over the gameplay columns.
  inspectorMode?: 'rail' | 'sheet'
  inspectorOpen?: boolean
  inspectorLabel?: string
}>(), {
  inspectorMode: 'rail',
  inspectorOpen: false,
  inspectorLabel: 'Details'
})

const emit = defineEmits<{
  'select-section': [CharacterSheetSectionKey]
  'close-inspector': []
}>()

const slots = useSlots()

const mainSections = computed(() => props.sections.filter((section) => section.placement === 'main'))
</script>

<template>
  <div
    class="eldra-sheet-desktop"
    data-sheet-presentation="desktop"
  >
    <div class="eldra-sheet-desktop__header">
      <slot name="header" />
    </div>

    <div class="eldra-sheet-desktop__body">
      <aside
        v-if="slots.rail"
        class="eldra-sheet-desktop__rail eldra-sheet-panel"
        aria-label="Character reference"
        data-sheet-region="rail"
      >
        <slot name="rail" />
      </aside>

      <section
        v-if="slots.skills"
        class="eldra-sheet-desktop__skills eldra-sheet-panel"
        aria-label="Skills"
        data-sheet-region="skills"
      >
        <slot name="skills" />
      </section>

      <main
        class="eldra-sheet-desktop__main eldra-sheet-panel"
        data-sheet-region="main"
      >
        <nav
          class="eldra-sheet-desktop__tabs"
          aria-label="Character sheet sections"
        >
          <button
            v-for="section in mainSections"
            :key="section.key"
            type="button"
            class="eldra-sheet-desktop__tab"
            :aria-current="section.key === mainSection ? 'page' : undefined"
            @click="emit('select-section', section.key)"
          >
            {{ section.label }}
          </button>
        </nav>

        <div class="@container">
          <slot name="main" />
        </div>
      </main>
    </div>

    <!-- Full desktop: the drawer positions itself as the workspace right
         rail. Compact desktop: the same drawer, inline, in the bottom
         sheet. -->
    <div
      v-if="inspectorMode === 'rail'"
      class="contents"
      data-sheet-inspector-host
    >
      <slot name="inspector" />
    </div>
    <CharacterSheetBottomSheet
      v-else
      :open="inspectorOpen"
      :label="inspectorLabel"
      @close="emit('close-inspector')"
    >
      <slot name="inspector" />
    </CharacterSheetBottomSheet>
  </div>
</template>

<style scoped>
/* Sizes are the sheet CONTAINER's (the page's @container/sheet).
   CHARACTER PURGATORY FOLLOW-UP -- ACTUAL CONFIRMED ROOT CAUSE of the
   Abilities-column truncation: `--sheet-rail-w` used to be its OWN,
   SMALLER constant (17rem) than `--sheet-side-w` (20rem). The two columns
   share one value below, "rail" and "skills" shared the SAME column
   (`--sheet-side-w`, 20rem) -- but crossing >= 1240px (where the layout
   switches to three SEPARATE columns, "rail skills main") narrowed the
   rail specifically, from 20rem down to 17rem, while skills stayed at
   20rem. A WIDER browser window -- the exact "the screen has room"
   complaint -- made the Abilities column SMALLER, not bigger. The prior
   pass's label-wrap fix (CharacterAbilityGrid.vue, still in place below
   as a safety net) could not fully compensate: at 17rem minus the rail's
   own 1rem/side padding (.eldra-sheet-panel), 3 columns leave roughly
   80px per tile, tight enough that "Intelligence"/"Constitution" could
   still clip even across two wrapped lines depending on exact font
   metrics. `--sheet-rail-w` is gone; "rail" now uses the SAME
   `--sheet-side-w` variable "skills" already did, at every breakpoint, so
   widening the viewport can never shrink this column again, and the
   Abilities grid gets roughly 288px of content width (20rem rail minus
   padding) at every supported desktop size -- comfortably one line for
   every real ability name at this component's current font size, with
   the wrap fallback still there if a future label is ever longer. */
.eldra-sheet-desktop {
  --sheet-side-w: 20rem;
}

.eldra-sheet-desktop__header {
  margin-bottom: 0.75rem;
}

.eldra-sheet-desktop__body {
  display: grid;
  gap: 1rem;
  grid-template-columns: var(--sheet-side-w) minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "rail main"
    "skills main";
  align-items: start;
}

.eldra-sheet-desktop__rail { grid-area: rail; }
.eldra-sheet-desktop__skills { grid-area: skills; }
.eldra-sheet-desktop__main { grid-area: main; }

/* A narrow desktop container keeps both columns, with a slimmer reference
   column so the main workspace stays usable. */
@container sheet (max-width: 959px) {
  .eldra-sheet-desktop {
    --sheet-side-w: 16rem;
  }
}

@container sheet (min-width: 1240px) {
  .eldra-sheet-desktop__body {
    grid-template-columns: var(--sheet-side-w) var(--sheet-side-w) minmax(0, 1fr);
    grid-template-rows: auto;
    grid-template-areas: "rail skills main";
  }
}

.eldra-sheet-desktop__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.125rem 1.25rem;
  margin: -0.25rem 0 1rem;
  border-bottom: 1px solid rgb(var(--eldra-accent-rgb) / 0.16);
}

.eldra-sheet-desktop__tab {
  position: relative;
  padding: 0.5rem 0 0.6rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--eldra-text-muted);
  transition: color var(--eldra-motion-duration) ease;
}

.eldra-sheet-desktop__tab:hover {
  color: var(--eldra-text-strong);
}

.eldra-sheet-desktop__tab:focus-visible {
  outline: 2px solid rgb(var(--eldra-accent-bright-rgb) / 0.85);
  outline-offset: 2px;
}

.eldra-sheet-desktop__tab[aria-current="page"] {
  color: var(--eldra-text-strong);
}

.eldra-sheet-desktop__tab[aria-current="page"]::after {
  content: "";
  position: absolute;
  inset: auto 0 -1px;
  height: 2px;
  background: var(--eldra-accent);
}
</style>
