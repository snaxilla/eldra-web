<script setup lang="ts">
// CharacterSheetShell -- Corrective Phase 2R: V1-style Character Folio
// Shell (see eldra-character-sheet-visual-language.md,
// eldra-design-language.md). Superseded from the Beauty Pass Phase 4
// shell, which built a desktop-only three-column app-within-app dashboard
// (CharacterSheetDesktopLayout) nested inside Eldra's own three-pane
// workspace shell (world navigation / main workspace / context rail). That
// nesting is rejected outright -- see this task's own OBJECTIVE -- not
// merely restyled: this file no longer imports or renders
// CharacterSheetDesktopLayout.vue at all (left unused on disk, not
// deleted, per this task's own REMOVE OR BYPASS guidance).
//
// The replacement is the same single folio body at every breakpoint: one
// command center slot, then one tabbed content column. What used to be
// two different template branches (a 3-column desktop grid vs. a single-
// column tablet/phone stack) collapses into ONE markup path with pure CSS
// breakpoints (`md:` for the top tabs vs. bottom nav) -- there is no more
// JS `isDesktop` prop here at all, because there is no more layout
// decision left for JS to make. `useCharacterSheetLayout.ts`'s own
// `isDesktop` export is untouched and simply unused by this file now
// (Corrective Phase 2R keeps composables it doesn't need to change).
//
// The ResizeObserver/`vitalsHeight` machinery the old Shell used to offset
// two independently-sticky rails beneath the command center is gone for
// the same reason: there are no rails left to offset. The command center
// itself may still be made sticky by whoever renders it into the `vitals`
// slot (sheet-v2.vue keeps the same `sticky top-0 z-20` class it already
// applied to CharacterVitalsBar), which needs no measurement at all.
//
// `left`/`right` slots are removed along with the rails they fed --
// Ability Scores/Derived and Recovery/Encounter/Conditions now render
// exactly once, inside their tab's `center` content, at every breakpoint
// (previously true only below 1280px; see sheet-v2.vue's own header for
// why that makes the page's template smaller, not larger).

import CharacterSheetNav from '~/components/characters/CharacterSheetNav.vue'
import type { CharacterSheetTab, CharacterSheetTabKey } from '~/composables/useCharacterSheetLayout'

defineProps<{
  tabs: readonly CharacterSheetTab[]
  activeTab: CharacterSheetTabKey
}>()

const emit = defineEmits<{
  (e: 'select-tab', tab: CharacterSheetTabKey): void
}>()
</script>

<template>
  <div>
    <div class="pb-4">
      <slot name="vitals" />
    </div>

    <CharacterSheetNav
      variant="tabs"
      :tabs="tabs"
      :active-tab="activeTab"
      class="mb-4 hidden md:flex"
      @select="emit('select-tab', $event)"
    />

    <div class="grid gap-4 pb-24 md:pb-4">
      <slot name="center" />
    </div>

    <!-- Bottom nav bar is persistent shell chrome, not content -- it never
         changes with the tab and never becomes a Feature surface, so it
         carries the `eldra-leather` material (Material Phase 1, see
         eldra-design-language.md §2/§8 Rule 5) rather than an inline
         one-off background color. Phone only (`md:hidden`) -- the top
         `tabs` nav above already covers tablet and desktop. -->
    <div
      class="eldra-leather fixed inset-x-0 bottom-0 z-30 border-t border-[rgba(201,164,90,0.24)] backdrop-blur md:hidden"
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
