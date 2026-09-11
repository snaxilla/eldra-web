<script setup lang="ts">
// CharacterSheetShell -- the Character Sheet's breakpoint orchestration.
// Owns no data.
//
// Desktop IA pass (D&D Beyond reference layout), corrected by Phase H3.
// Corrective Phase 2R had collapsed this to a single folio column at every
// width, after Beauty Pass Phase 4's three-column dashboard was rejected
// for nesting a second three-pane app inside the workspace's own. The
// Desktop IA pass restored a body with REGIONS -- but two of them, not
// three: the sheet keeps a reference region and a working region, and the
// third pane is the workspace's existing context drawer, which the page
// mounts and this file knows nothing about. See
// CharacterSheetDesktopLayout.vue's header for the full reasoning.
//
// WHAT DID NOT CHANGE, DELIBERATELY:
//   - The command center slot, and the fact that whoever fills it makes it
//     sticky (no measurement here).
//   - The bottom nav: phone-only, `eldra-leather`, persistent shell chrome
//     that never becomes a Feature surface.
//   - The top `tabs` nav at `md`+, which sits inside the center region
//     rather than spanning the whole body -- the reference sheet's tab bar
//     sits above its working column only, and a tab bar spanning a
//     reference rail would imply the rail changes with the tab, which it
//     never does.
//   - No JS breakpoint. Region placement is CSS only, which is why there is
//     still no `isDesktop` prop here.
//
// H3: THE MEASUREMENT IS GONE, BECAUSE WHAT IT FED IS GONE. The Desktop IA
// pass added a ResizeObserver here that published `--sheet-command-h`, so
// the left region and the skills column could sit `sticky` beginning
// exactly where the command center ended. Phase H3 rejects that split
// scrolling outright ("the entire sheet scrolls together... sticky
// behavior should only exist where it genuinely improves usability") --
// see CharacterSheetDesktopLayout.vue's own header for the other half of
// this fix. With neither region sticky anymore, nothing reads
// `--sheet-command-h`, so measuring it here would be dead code kept
// "just in case." The command center's own stickiness (applied by
// whoever fills the `vitals` slot) needs no measurement at all -- it is
// simply `position: sticky` against the page's own scroll, exactly like
// Corrective Phase 2R originally built it.

import CharacterSheetNav from '~/components/characters/CharacterSheetNav.vue'
import CharacterSheetDesktopLayout from '~/components/characters/CharacterSheetDesktopLayout.vue'
import type { CharacterSheetTab, CharacterSheetTabKey } from '~/composables/useCharacterSheetLayout'

defineProps<{
  tabs: readonly CharacterSheetTab[]
  activeTab: CharacterSheetTabKey
  // Relayed to the layout so the skills column stacks rather than splitting
  // while the shared context drawer is compressing the sheet -- see
  // CharacterSheetDesktopLayout.vue. This shell makes no layout decision of
  // its own with it.
  drawerOpen?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-tab', tab: CharacterSheetTabKey): void
}>()

const slots = useSlots()
</script>

<template>
  <div>
    <div class="pb-4">
      <slot name="vitals" />
    </div>

    <CharacterSheetDesktopLayout
      :has-left="Boolean(slots.left)"
      :has-skills="Boolean(slots.skills)"
      :drawer-open="drawerOpen"
    >
      <template
        v-if="slots.left"
        #left
      >
        <slot name="left" />
      </template>

      <template
        v-if="slots.skills"
        #skills
      >
        <slot name="skills" />
      </template>

      <template #center>
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
      </template>
    </CharacterSheetDesktopLayout>

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
