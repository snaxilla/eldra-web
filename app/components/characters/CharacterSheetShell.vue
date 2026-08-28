<script setup lang="ts">
// CharacterSheetShell -- Character Sheet Beautification Pass, Phase 4
// (see .github/docs/architecture/character-sheet-beauty-pass.md §4, §5,
// §6, §8.1, §11 Phase 4). Breakpoint orchestration; owns no Character
// data. Named slots `vitals`/`left`/`center`/`right` -- the page decides
// WHAT goes in each (including, on narrow viewports, folding left/right
// rail content into the `center` slot itself, per useCharacterSheet-
// Layout.ts's own header on why that's a page-level decision driven by
// `isDesktop`, not something this shell tries to do automatically).
//
// Desktop (`isDesktop`, >= 1280px): CharacterSheetDesktopLayout's 3-column
// grid, with a `CharacterSheetNav` (variant="tabs") at the top of the
// center column, matching §4's own mockup.
// Tablet (< 1280px, >= 768px via `md:`): single column; the same `tabs`
// variant nav renders at the top instead (§5.2: "Tabs render as a top
// segmented control").
// Phone (< 768px): single column; a `bottom` variant nav is fixed to the
// viewport bottom instead (§6.1), safe-area aware.
//
// The Vitals Bar is measured (ResizeObserver on its wrapper) so both
// rails can stick immediately below it via a real pixel value rather than
// a guessed constant -- conditions/temp-HP/caster fields all change its
// actual height, so a static guess would drift wrong.

import CharacterSheetNav from '~/components/characters/CharacterSheetNav.vue'
import CharacterSheetDesktopLayout from '~/components/characters/CharacterSheetDesktopLayout.vue'
import type { CharacterSheetTab, CharacterSheetTabKey } from '~/composables/useCharacterSheetLayout'

defineProps<{
  tabs: readonly CharacterSheetTab[]
  activeTab: CharacterSheetTabKey
  isDesktop: boolean
}>()

const emit = defineEmits<{
  (e: 'select-tab', tab: CharacterSheetTabKey): void
}>()

const vitalsRef = ref<HTMLElement | null>(null)
const vitalsHeight = ref(0)
let observer: ResizeObserver | null = null

function measureVitals() {
  vitalsHeight.value = vitalsRef.value?.offsetHeight ?? 0
}

onMounted(() => {
  if (!import.meta.client || !vitalsRef.value) return
  measureVitals()
  observer = new ResizeObserver(measureVitals)
  observer.observe(vitalsRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <div>
    <!-- pb-4 here (not on the Vitals Bar itself) so the measured height
         already includes the gap before the content below it -- the
         rails' sticky `top` needs to match where the bar visually ends,
         not just its own border-box height. -->
    <div
      ref="vitalsRef"
      class="pb-4"
    >
      <slot name="vitals" />
    </div>

    <CharacterSheetDesktopLayout
      v-if="isDesktop"
      :vitals-height="vitalsHeight"
    >
      <template #left>
        <slot name="left" />
      </template>
      <template #center>
        <CharacterSheetNav
          variant="tabs"
          :tabs="tabs"
          :active-tab="activeTab"
          class="mb-4"
          @select="emit('select-tab', $event)"
        />
        <div class="grid gap-4">
          <slot name="center" />
        </div>
      </template>
      <template #right>
        <slot name="right" />
      </template>
    </CharacterSheetDesktopLayout>

    <div
      v-else
      class="pb-24"
    >
      <CharacterSheetNav
        variant="tabs"
        :tabs="tabs"
        :active-tab="activeTab"
        class="mb-4 hidden md:flex"
        @select="emit('select-tab', $event)"
      />
      <div class="grid gap-4">
        <slot name="center" />
      </div>
    </div>

    <div
      v-if="!isDesktop"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,9,0.94)] backdrop-blur md:hidden"
      style="padding-bottom: env(safe-area-inset-bottom);"
    >
      <CharacterSheetNav
        variant="bottom"
        :tabs="tabs"
        :active-tab="activeTab"
        @select="emit('select-tab', $event)"
      />
    </div>
  </div>
</template>
