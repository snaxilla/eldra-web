<script setup lang="ts">
// CharacterSheetShell -- the V2 Character Sheet's layout. Owns no data.
//
// Phase 4B rewrite (supersedes the Desktop IA / H3 shell; the old
// CharacterSheetDesktopLayout.vue is left on disk, unused). Regions:
//
//   header     compact identity/HP/summary header (the page's slot)
//   rail       reference: abilities, saves, passives, proficiencies
//   skills     the skills table
//   main       the tabbed workspace (Actions, Spells, Inventory, ...)
//   inspector  Eldra's ONE context drawer (WorldEntityContextDrawer,
//              `placement="inline"`), mounted by the page into this slot
//
// Layout responds to the sheet CONTAINER (`@container/sheet`, set by the
// page), never the viewport -- the workspace rail's width is already
// subtracted. Widths are the sheet container's:
//
//   >= 1750px  rail | skills | main | inspector lane (always reserved)
//   >= 1240px  rail | skills | main; the inspector takes the Skills column
//   >=  880px  rail (with skills beneath) | main; the inspector takes the rail
//    <  880px  one section at a time; the inspector is a bottom sheet
//
// THE MAIN WORKSPACE NEVER MOVES. In every mode the inspector occupies a
// track that already exists at the same width -- the reserved lane, the
// Skills column, or the rail -- so opening it changes neither the main
// column's width nor its position. The column it replaces is hidden with
// `visibility`, not `display`, so the page height (and the player's
// scroll position in a long list) is unchanged too.
//
// Phones: a condensed sticky bar (the page's `condensed` slot) appears
// once the full header scrolls away -- one IntersectionObserver boolean,
// everything else CSS, transitions off under reduced motion. The section
// nav shows the first four sections directly and the rest under a
// labelled "More" control. Stats also shows Skills beneath it, so skills
// stay one tap away; Skills is directly selectable from More too.
//
// Inspector a11y: Escape closes it; opening moves focus to its close
// button; closing returns focus to the control that opened it. On phones
// it is a modal bottom sheet (scrim, swipe the grip down to close) laid
// over the page -- the page's own scroll position is never touched.
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

const mainSections = computed(() => props.sections.filter((section) => section.placement === 'main'))

// Phone nav: four direct sections, the rest under More.
const DIRECT_COUNT = 4
const directSections = computed(() => props.sections.slice(0, DIRECT_COUNT))
const overflowSections = computed(() => props.sections.slice(DIRECT_COUNT))
const overflowActive = computed(() => overflowSections.value.some((section) => section.key === props.activeSection))

const moreItems = computed(() => [overflowSections.value.map((section) => ({
  label: section.label,
  icon: section.icon,
  onSelect: () => selectSection(section.key)
}))])

const rootEl = ref<HTMLElement | null>(null)

function selectSection(key: CharacterSheetSectionKey) {
  emit('select-section', key)
  // A phone section change starts at the section's top, not wherever the
  // previous section was scrolled to.
  nextTick(() => {
    const nav = rootEl.value?.querySelector<HTMLElement>('[data-sheet-section-nav]')
    if (nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().top <= 64) {
      nav.scrollIntoView({ block: 'start' })
    }
  })
}

// --- Condensed header (phones) ---------------------------------------------
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

// --- Inspector: focus, Escape, swipe ---------------------------------------
const inspectorEl = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

function closeInspector() {
  emit('close-inspector')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || !props.inspectorOpen) return
  // A popover/menu open inside the sheet handles its own Escape first.
  if (document.querySelector('[data-reka-popper-content-wrapper]')) return
  closeInspector()
}

watch(() => props.inspectorOpen, async (open) => {
  if (!import.meta.client) return
  if (open) {
    const active = document.activeElement as HTMLElement | null
    if (active && !inspectorEl.value?.contains(active)) returnFocus = active
    await nextTick()
    inspectorEl.value?.querySelector<HTMLElement>('[data-context-close]')?.focus({ preventScroll: true })
  } else {
    const target = returnFocus
    returnFocus = null
    if (target && document.contains(target)) target.focus({ preventScroll: true })
  }
})

const dragOffset = ref(0)
let dragStartY: number | null = null

function onGripStart(event: TouchEvent) {
  dragStartY = event.touches[0]?.clientY ?? null
}

function onGripMove(event: TouchEvent) {
  if (dragStartY === null) return
  dragOffset.value = Math.max(0, (event.touches[0]?.clientY ?? dragStartY) - dragStartY)
}

function onGripEnd() {
  if (dragOffset.value > 80) closeInspector()
  dragOffset.value = 0
  dragStartY = null
}

onMounted(() => window.addEventListener('keydown', onKeydown))

onBeforeUnmount(() => {
  headerObserver?.disconnect()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="rootEl"
    class="eldra-sheet"
    :data-section="activeSection"
    :data-inspector="inspectorOpen ? 'open' : 'closed'"
    :data-condensed="condensed ? 'true' : 'false'"
  >
    <div
      v-if="slots.condensed"
      class="eldra-sheet__condensed"
      :aria-hidden="condensed ? undefined : 'true'"
      :inert="condensed ? undefined : true"
    >
      <slot name="condensed" />
    </div>

    <div
      ref="headerEl"
      class="eldra-sheet__header"
    >
      <slot name="header" />
    </div>

    <!-- Phone section nav. -->
    <nav
      class="eldra-sheet__sectionnav"
      aria-label="Character sections"
      data-sheet-section-nav
    >
      <button
        v-for="section in directSections"
        :key="section.key"
        type="button"
        class="eldra-sheet__navbtn"
        :aria-current="section.key === activeSection ? 'page' : undefined"
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
          class="eldra-sheet__navbtn"
          :aria-current="overflowActive ? 'page' : undefined"
          aria-label="More sections"
        >
          <UIcon
            name="i-lucide-ellipsis"
            class="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span class="truncate">{{ overflowActive ? sections.find((section) => section.key === activeSection)?.shortLabel || sections.find((section) => section.key === activeSection)?.label : 'More' }}</span>
        </button>
      </UDropdownMenu>
    </nav>

    <div class="eldra-sheet__body">
      <aside
        v-if="slots.rail"
        class="eldra-sheet__rail eldra-sheet__panel"
        aria-label="Character reference"
        data-sheet-region="rail"
      >
        <slot name="rail" />
      </aside>

      <section
        v-if="slots.skills"
        class="eldra-sheet__skills eldra-sheet__panel"
        aria-label="Skills"
        data-sheet-region="skills"
      >
        <slot name="skills" />
      </section>

      <main
        class="eldra-sheet__main eldra-sheet__panel"
        data-sheet-region="main"
      >
        <nav
          class="eldra-sheet__tabs"
          aria-label="Character sheet sections"
        >
          <button
            v-for="section in mainSections"
            :key="section.key"
            type="button"
            class="eldra-sheet__tab"
            :aria-current="section.key === mainSection ? 'page' : undefined"
            @click="selectSection(section.key)"
          >
            {{ section.label }}
          </button>
        </nav>

        <div class="eldra-sheet__mainbody @container">
          <slot name="main" />
        </div>
      </main>

      <!-- Reserved inspector lane at large widths, while nothing is open. -->
      <aside
        v-if="slots['inspector-idle'] && !inspectorOpen"
        class="eldra-sheet__idle"
        aria-label="Details"
      >
        <slot name="inspector-idle" />
      </aside>

      <div
        v-if="inspectorOpen"
        class="eldra-sheet__scrim"
        aria-hidden="true"
        @click="closeInspector"
      />

      <aside
        ref="inspectorEl"
        class="eldra-sheet__inspector"
        :aria-label="inspectorLabel"
        :style="dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined"
        data-sheet-region="inspector"
      >
        <div
          class="eldra-sheet__grip"
          aria-hidden="true"
          @touchstart.passive="onGripStart"
          @touchmove.passive="onGripMove"
          @touchend="onGripEnd"
          @touchcancel="onGripEnd"
        >
          <span />
        </div>
        <slot name="inspector" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* All sizes are the sheet CONTAINER's (see the page's @container/sheet). */
.eldra-sheet {
  --sheet-gap: 1rem;
  --sheet-condensed-h: 3.25rem;
  --sheet-rail-w: 17rem;
  --sheet-side-w: 20rem;
  --sheet-lane-w: 23.75rem;
}

.eldra-sheet__panel {
  min-width: 0;
  border: 1px solid var(--eldra-border);
  background: rgb(var(--eldra-panel-rgb) / var(--eldra-panel-alpha));
  -webkit-backdrop-filter: blur(var(--eldra-panel-blur));
  backdrop-filter: blur(var(--eldra-panel-blur));
  padding: 1rem;
}

.eldra-sheet__header {
  margin-bottom: 0.75rem;
}

/* --- Phone (default): one section at a time --------------------------- */

.eldra-sheet__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sheet-gap);
}

.eldra-sheet__rail,
.eldra-sheet__skills,
.eldra-sheet__main,
.eldra-sheet__idle {
  display: none;
}

.eldra-sheet[data-section="stats"] .eldra-sheet__rail,
.eldra-sheet[data-section="stats"] .eldra-sheet__skills,
.eldra-sheet[data-section="skills"] .eldra-sheet__skills {
  display: block;
}

.eldra-sheet:not([data-section="stats"]):not([data-section="skills"]) .eldra-sheet__main {
  display: block;
}

.eldra-sheet__tabs {
  display: none;
}

.eldra-sheet__condensed {
  position: sticky;
  top: 0;
  z-index: 26;
  height: var(--sheet-condensed-h);
  margin-bottom: calc(var(--sheet-condensed-h) * -1);
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
  transition:
    opacity var(--eldra-motion-duration) ease,
    transform var(--eldra-motion-duration) ease;
}

.eldra-sheet[data-condensed="true"] .eldra-sheet__condensed {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

.eldra-sheet__sectionnav {
  position: sticky;
  top: var(--sheet-condensed-h);
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

/* Icon over label on a phone, so five labels fit at 360px; side by side
   once the container has room. */
.eldra-sheet__navbtn {
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

.eldra-sheet__navbtn:hover {
  color: var(--eldra-text-strong);
}

.eldra-sheet__navbtn:focus-visible {
  outline: 2px solid rgb(var(--eldra-accent-bright-rgb) / 0.85);
  outline-offset: -2px;
}

.eldra-sheet__navbtn[aria-current="page"] {
  color: var(--eldra-text-strong);
  border-color: rgb(var(--eldra-accent-rgb) / 0.5);
  background: rgb(var(--eldra-accent-rgb) / 0.12);
}

@container sheet (min-width: 600px) {
  .eldra-sheet__navbtn {
    flex-direction: row;
    gap: 0.375rem;
    padding: 0 0.5rem;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
  }
}

/* Bottom sheet. */
.eldra-sheet__scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgb(0 0 0 / 0.5);
}

.eldra-sheet__inspector {
  display: none;
  position: fixed;
  inset: auto 0 0;
  z-index: 61;
  height: min(85dvh, 44rem);
  padding-bottom: env(safe-area-inset-bottom);
}

.eldra-sheet[data-inspector="open"] .eldra-sheet__inspector {
  display: flex;
  flex-direction: column;
}

.eldra-sheet__inspector > :deep(:last-child) {
  flex: 1;
  min-height: 0;
}

.eldra-sheet__grip {
  display: flex;
  justify-content: center;
  padding: 0.5rem 0 0.25rem;
  margin-bottom: -0.25rem;
  position: relative;
  z-index: 1;
  touch-action: none;
  background: rgb(var(--eldra-panel-rgb) / max(var(--eldra-panel-alpha), 0.94));
  border-top: 1px solid var(--eldra-border);
}

.eldra-sheet__grip span {
  display: block;
  width: 2.5rem;
  height: 0.25rem;
  border-radius: 999px;
  background: rgb(var(--eldra-accent-rgb) / 0.45);
}

/* --- Tablet / small desktop: rail (+ skills) | main ------------------- */

@container sheet (min-width: 880px) {
  .eldra-sheet__condensed,
  .eldra-sheet__sectionnav,
  .eldra-sheet__scrim,
  .eldra-sheet__grip {
    display: none;
  }

  .eldra-sheet__body {
    grid-template-columns: var(--sheet-side-w) minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas:
      "rail main"
      "skills main";
    align-items: start;
  }

  .eldra-sheet .eldra-sheet__rail,
  .eldra-sheet .eldra-sheet__skills,
  .eldra-sheet .eldra-sheet__main {
    display: block;
  }

  .eldra-sheet__rail { grid-area: rail; }
  .eldra-sheet__skills { grid-area: skills; }
  .eldra-sheet__main { grid-area: main; }

  .eldra-sheet__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.125rem 1.25rem;
    margin: -0.25rem 0 1rem;
    border-bottom: 1px solid rgb(var(--eldra-accent-rgb) / 0.16);
  }

  .eldra-sheet__tab {
    position: relative;
    padding: 0.5rem 0 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--eldra-text-muted);
    transition: color var(--eldra-motion-duration) ease;
  }

  .eldra-sheet__tab:hover {
    color: var(--eldra-text-strong);
  }

  .eldra-sheet__tab:focus-visible {
    outline: 2px solid rgb(var(--eldra-accent-bright-rgb) / 0.85);
    outline-offset: 2px;
  }

  .eldra-sheet__tab[aria-current="page"] {
    color: var(--eldra-text-strong);
  }

  .eldra-sheet__tab[aria-current="page"]::after {
    content: "";
    position: absolute;
    inset: auto 0 -1px;
    height: 2px;
    background: var(--eldra-accent);
  }

  /* The inspector takes the rail's place (both rows of column 1). */
  .eldra-sheet__inspector {
    position: sticky;
    inset: auto;
    top: 1rem;
    z-index: 1;
    grid-area: 1 / 1 / 3 / 2;
    align-self: start;
    height: calc(100dvh - 6rem);
    max-height: 52rem;
    padding: 0;
  }

  .eldra-sheet[data-inspector="open"] .eldra-sheet__rail,
  .eldra-sheet[data-inspector="open"] .eldra-sheet__skills {
    visibility: hidden;
  }
}

/* --- Standard desktop: rail | skills | main --------------------------- */

@container sheet (min-width: 1240px) {
  .eldra-sheet__body {
    grid-template-columns: var(--sheet-rail-w) var(--sheet-side-w) minmax(0, 1fr);
    grid-template-rows: auto;
    grid-template-areas: "rail skills main";
  }

  /* The inspector takes the Skills column. */
  .eldra-sheet__inspector {
    grid-area: skills;
  }

  .eldra-sheet[data-inspector="open"] .eldra-sheet__rail {
    visibility: visible;
  }
}

/* --- Large desktop: + a reserved inspector lane ----------------------- */

@container sheet (min-width: 1750px) {
  .eldra-sheet__body {
    grid-template-columns: var(--sheet-rail-w) var(--sheet-side-w) minmax(0, 1fr) var(--sheet-lane-w);
    grid-template-areas: "rail skills main lane";
  }

  .eldra-sheet__inspector,
  .eldra-sheet .eldra-sheet__idle {
    grid-area: lane;
  }

  .eldra-sheet .eldra-sheet__idle {
    display: block;
    position: sticky;
    top: 1rem;
    align-self: start;
  }

  .eldra-sheet[data-inspector="open"] .eldra-sheet__skills {
    visibility: visible;
  }
}

@media (prefers-reduced-motion: reduce) {
  .eldra-sheet__condensed {
    transition: none;
  }
}
</style>
