<script setup lang="ts">
// CharacterSheetShell -- the V2 Character Sheet's presentation boundary.
// Owns no data.
//
// Phase 4C: the sheet has two first-class presentations over the same
// components and data (see useCharacterSheetPresentation.ts):
//
//   desktop    CharacterSheetDesktopLayout.vue -- dense workspace,
//              reference columns, tabbed main workspace, the workspace's
//              contextual right rail
//   companion  CharacterSheetCompanionLayout.vue -- touch-first, section
//              navigation, one section at a time, bottom-sheet details
//
// The page chooses the presentation from the measured workspace width and
// passes it here; this shell renders the matching layout and forwards the
// page's slots (header, condensed, rail, skills, main, inspector) to it,
// so the page declares its content exactly once.
//
// What both presentations share lives here: inspector accessibility.
// Escape closes it; opening moves focus to its close button; closing
// returns focus to the control that opened it.
import CharacterSheetDesktopLayout from '~/components/characters/CharacterSheetDesktopLayout.vue'
import CharacterSheetCompanionLayout from '~/components/characters/CharacterSheetCompanionLayout.vue'
import type { CharacterSheetSection, CharacterSheetSectionKey } from '~/composables/useCharacterSheetLayout'
import type { CharacterSheetPresentation } from '~/composables/useCharacterSheetPresentation'

const props = withDefaults(defineProps<{
  presentation: CharacterSheetPresentation
  sections: readonly CharacterSheetSection[]
  activeSection: CharacterSheetSectionKey
  mainSection: CharacterSheetSectionKey
  inspectorOpen?: boolean
  inspectorLabel?: string
  // Desktop only: right rail (full density) or bottom sheet (compact).
  desktopInspector?: 'rail' | 'sheet'
}>(), {
  desktopInspector: 'rail',
  inspectorOpen: false,
  inspectorLabel: 'Details'
})

const emit = defineEmits<{
  'select-section': [CharacterSheetSectionKey]
  'close-inspector': []
}>()

const slots = useSlots()

// --- Inspector: focus and Escape ---------------------------------------------
let returnFocus: HTMLElement | null = null

function inspectorHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-sheet-inspector-host]')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || !props.inspectorOpen) return
  // A popover/menu/modal open inside the sheet handles its own Escape first.
  if (document.querySelector('[data-reka-popper-content-wrapper], [role="dialog"][data-state="open"]')) return
  emit('close-inspector')
}

watch(() => props.inspectorOpen, async (open) => {
  if (!import.meta.client) return
  if (open) {
    const active = document.activeElement as HTMLElement | null
    if (active && !inspectorHost()?.contains(active)) returnFocus = active
    await nextTick()
    inspectorHost()?.querySelector<HTMLElement>('[data-context-close]')?.focus({ preventScroll: true })
  } else {
    const target = returnFocus
    returnFocus = null
    if (target && document.contains(target)) target.focus({ preventScroll: true })
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <CharacterSheetDesktopLayout
    v-if="presentation === 'desktop'"
    :sections="sections"
    :main-section="mainSection"
    :inspector-mode="desktopInspector"
    :inspector-open="inspectorOpen"
    :inspector-label="inspectorLabel"
    @select-section="emit('select-section', $event)"
    @close-inspector="emit('close-inspector')"
  >
    <template #header>
      <slot name="header" />
    </template>
    <template
      v-if="slots.rail"
      #rail
    >
      <slot name="rail" />
    </template>
    <template
      v-if="slots.skills"
      #skills
    >
      <slot name="skills" />
    </template>
    <template #main>
      <slot name="main" />
    </template>
    <template #inspector>
      <slot name="inspector" />
    </template>
  </CharacterSheetDesktopLayout>

  <CharacterSheetCompanionLayout
    v-else
    :sections="sections"
    :active-section="activeSection"
    :main-section="mainSection"
    :inspector-open="inspectorOpen"
    :inspector-label="inspectorLabel"
    @select-section="emit('select-section', $event)"
    @close-inspector="emit('close-inspector')"
  >
    <template
      v-if="slots.condensed"
      #condensed
    >
      <slot name="condensed" />
    </template>
    <template #header>
      <slot name="header" />
    </template>
    <template
      v-if="slots.rail"
      #rail
    >
      <slot name="rail" />
    </template>
    <template
      v-if="slots.skills"
      #skills
    >
      <slot name="skills" />
    </template>
    <template #main>
      <slot name="main" />
    </template>
    <template #inspector>
      <slot name="inspector" />
    </template>
  </CharacterSheetCompanionLayout>
</template>
