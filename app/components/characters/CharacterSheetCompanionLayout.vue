<script setup lang="ts">
// CharacterSheetCompanionLayout -- the COMPANION presentation of the V2
// Character Sheet (Phase 4C). A touch-first sheet in its own right, and the
// intended foundation of a future Eldra Companion app -- not the desktop
// layout with columns hidden. It renders the same components over the
// same data; only the arrangement and interaction model differ:
//
//   - compact identity, HP and essential stats (the header in its
//     `companion` variant), resources behind one labelled toggle
//   - a condensed sticky bar once that header scrolls away
//   - dedicated section navigation: Stats / Actions / Spells / Gear,
//     everything else under a labelled More
//   - ONE section at a time. Stats is abilities, saves, reference values
//     (senses, passives), proficiencies and skills together.
//   - details in a bottom sheet (CharacterSheetBottomSheet.vue: scrim,
//     swipe the grip down to close, page scroll position untouched)
//
// Nothing here assumes a desktop browser: no hover-only affordances, 44px
// touch targets, safe-area padding, no horizontal scrolling.
import CharacterSheetBottomSheet from '~/components/characters/CharacterSheetBottomSheet.vue'
import type { CharacterSheetSection, CharacterSheetSectionKey } from '~/composables/useCharacterSheetLayout'

const props = withDefaults(defineProps<{
  sections: readonly CharacterSheetSection[]
  activeSection: CharacterSheetSectionKey
  mainSection: CharacterSheetSectionKey
  inspectorOpen?: boolean
  inspectorLabel?: string
}>(), {
  inspectorOpen: false,
  inspectorLabel: 'Details'
})

const emit = defineEmits<{
  'select-section': [CharacterSheetSectionKey]
  'close-inspector': []
}>()

const slots = useSlots()

// Skills live inside Stats here, so they are not a separate destination.
// A `?tab=skills` link lands on Stats.
const navSections = computed(() => props.sections.filter((section) => section.key !== 'skills'))
const currentSection = computed<CharacterSheetSectionKey>(() =>
  props.activeSection === 'skills' ? 'stats' : props.activeSection
)
const showsStats = computed(() => currentSection.value === 'stats')

// Stats, Actions, Spells, Gear directly (whichever of them this character
// has); everything else under More.
const DIRECT_COUNT = 4
const directSections = computed(() => navSections.value.slice(0, DIRECT_COUNT))
const overflowSections = computed(() => navSections.value.slice(DIRECT_COUNT))
const activeOverflow = computed(() => overflowSections.value.find((section) => section.key === currentSection.value) ?? null)

const moreItems = computed(() => [overflowSections.value.map((section) => ({
  label: section.label,
  icon: section.icon,
  onSelect: () => selectSection(section.key)
}))])

const rootEl = ref<HTMLElement | null>(null)

function selectSection(key: CharacterSheetSectionKey) {
  emit('select-section', key)
  // A section change starts at the section's top, not wherever the
  // previous section was scrolled to.
  nextTick(() => {
    const nav = rootEl.value?.querySelector<HTMLElement>('[data-sheet-section-nav]')
    if (nav && nav.getBoundingClientRect().top <= 64) nav.scrollIntoView({ block: 'start' })
  })
}

// --- Condensed header ------------------------------------------------------
const headerEl = ref<HTMLElement | null>(null)
const condensed = ref(false)
let headerObserver: IntersectionObserver | null = null

onMounted(() => {
  if (!headerEl.value || typeof IntersectionObserver === 'undefined') return
  headerObserver = new IntersectionObserver(([entry]) => {
    condensed.value = !entry!.isIntersecting
  }, { threshold: 0 })
  headerObserver.observe(headerEl.value)
})

onBeforeUnmount(() => headerObserver?.disconnect())

</script>

<template>
  <div
    ref="rootEl"
    class="eldra-sheet-companion"
    data-sheet-presentation="companion"
    :data-condensed="condensed ? 'true' : 'false'"
  >
    <div
      v-if="slots.condensed"
      class="eldra-sheet-companion__condensed"
      :aria-hidden="condensed ? undefined : 'true'"
      :inert="condensed ? undefined : true"
    >
      <slot name="condensed" />
    </div>

    <div
      ref="headerEl"
      class="eldra-sheet-companion__header"
    >
      <slot name="header" />
    </div>

    <nav
      class="eldra-sheet-companion__nav"
      aria-label="Character sections"
      data-sheet-section-nav
    >
      <button
        v-for="section in directSections"
        :key="section.key"
        type="button"
        class="eldra-sheet-companion__navbtn"
        :aria-current="section.key === currentSection ? 'page' : undefined"
        @click="selectSection(section.key)"
      >
        <UIcon
          :name="section.icon"
          class="h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <span class="truncate">{{ section.shortLabel || section.label }}</span>
      </button>

      <UDropdownMenu
        v-if="overflowSections.length"
        :items="moreItems"
        :content="{ align: 'end', side: 'bottom' }"
      >
        <button
          type="button"
          class="eldra-sheet-companion__navbtn"
          :aria-current="activeOverflow ? 'page' : undefined"
          aria-label="More sections"
        >
          <UIcon
            name="i-lucide-ellipsis"
            class="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span class="truncate">{{ activeOverflow ? activeOverflow.shortLabel || activeOverflow.label : 'More' }}</span>
        </button>
      </UDropdownMenu>
    </nav>

    <!-- One section at a time. -->
    <div
      v-if="showsStats"
      class="grid gap-3"
    >
      <section
        v-if="slots.rail"
        class="eldra-sheet-panel"
        aria-label="Character reference"
        data-sheet-region="rail"
      >
        <slot name="rail" />
      </section>
      <section
        v-if="slots.skills"
        class="eldra-sheet-panel"
        aria-label="Skills"
        data-sheet-region="skills"
      >
        <slot name="skills" />
      </section>
    </div>

    <main
      v-else
      class="eldra-sheet-panel @container"
      data-sheet-region="main"
    >
      <slot name="main" />
    </main>

    <!-- Details: a bottom sheet over the page. -->
    <CharacterSheetBottomSheet
      :open="inspectorOpen"
      :label="inspectorLabel"
      @close="emit('close-inspector')"
    >
      <slot name="inspector" />
    </CharacterSheetBottomSheet>
  </div>
</template>

<style scoped>
.eldra-sheet-companion {
  --companion-condensed-h: 3.25rem;
}

.eldra-sheet-companion__header {
  margin-bottom: 0.75rem;
}

.eldra-sheet-companion__condensed {
  position: sticky;
  top: 0;
  z-index: 26;
  height: var(--companion-condensed-h);
  margin-bottom: calc(var(--companion-condensed-h) * -1);
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
  transition:
    opacity var(--eldra-motion-duration) ease,
    transform var(--eldra-motion-duration) ease;
}

.eldra-sheet-companion[data-condensed="true"] .eldra-sheet-companion__condensed {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

.eldra-sheet-companion__nav {
  position: sticky;
  top: var(--companion-condensed-h);
  z-index: 25;
  display: flex;
  gap: 0.25rem;
  margin: 0 0 0.75rem;
  padding: 0.375rem;
  border: 1px solid var(--eldra-border);
  background: rgb(var(--eldra-panel-rgb) / max(var(--eldra-panel-alpha), 0.92));
  -webkit-backdrop-filter: blur(var(--eldra-panel-blur));
  backdrop-filter: blur(var(--eldra-panel-blur));
}

/* Icon over label, so five labels fit at 360px; side by side once the
   companion has room. */
.eldra-sheet-companion__navbtn {
  display: inline-flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.25rem;
  border: 1px solid transparent;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--eldra-text-muted);
  transition: color var(--eldra-motion-duration) ease, background-color var(--eldra-motion-duration) ease;
}

.eldra-sheet-companion__navbtn:hover {
  color: var(--eldra-text-strong);
}

.eldra-sheet-companion__navbtn:focus-visible {
  outline: 2px solid rgb(var(--eldra-accent-bright-rgb) / 0.85);
  outline-offset: -2px;
}

.eldra-sheet-companion__navbtn[aria-current="page"] {
  color: var(--eldra-text-strong);
  border-color: rgb(var(--eldra-accent-rgb) / 0.5);
  background: rgb(var(--eldra-accent-rgb) / 0.12);
}

@container sheet (min-width: 600px) {
  .eldra-sheet-companion__navbtn {
    flex-direction: row;
    gap: 0.375rem;
    padding: 0 0.5rem;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
  }
}

@media (prefers-reduced-motion: reduce) {
  .eldra-sheet-companion__condensed {
    transition: none;
  }
}
</style>
