<script setup lang="ts">
// CharacterSheetShell -- the Character Sheet's breakpoint orchestration.
// Owns no data.
//
// Desktop IA pass (D&D Beyond reference layout). Corrective Phase 2R had
// collapsed this to a single folio column at every width, after Beauty Pass
// Phase 4's three-column dashboard was rejected for nesting a second
// three-pane app inside the workspace's own. This restores a body with
// REGIONS -- but two of them, not three: the sheet keeps a reference region
// and a working region, and the third pane is the workspace's existing
// context drawer, which the page mounts and this file knows nothing about.
// See CharacterSheetDesktopLayout.vue's header for the full reasoning.
//
// WHAT DID NOT CHANGE, DELIBERATELY:
//   - The command center slot, and the fact that whoever fills it makes it
//     sticky (no measurement here).
//   - The bottom nav: phone-only, `eldra-leather`, persistent shell chrome
//     that never becomes a Feature surface. Untouched by this pass, per the
//     approved "mobile direction stays as-is".
//   - The top `tabs` nav at `md`+, which now sits inside the center region
//     rather than spanning the whole body -- the reference sheet's tab bar
//     sits above its working column only, and a tab bar spanning a
//     reference rail would imply the rail changes with the tab, which it
//     never does.
//   - No JS breakpoint. Region placement is CSS only, which is why there is
//     still no `isDesktop` prop here.
//
// THE ONE PIECE OF MEASUREMENT, AND WHY IT IS BACK. Both sticky regions
// must begin exactly where the sticky command center ends, and that height
// genuinely varies -- conditions, temp HP, and caster-only fields all change
// it, so any constant would drift wrong. Phase 4 measured it for the same
// reason; Corrective Phase 2R removed the measurement because it had
// removed the rails. The rails are back, so the ResizeObserver is too, and
// it publishes ONE CSS variable (`--sheet-command-h`) that the layout reads
// -- no prop threading, no layout decision made in JS.

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

const commandRef = ref<HTMLElement | null>(null)
const commandHeight = ref(0)
let observer: ResizeObserver | null = null

function measureCommandCenter() {
  commandHeight.value = commandRef.value?.offsetHeight ?? 0
}

onMounted(() => {
  if (!import.meta.client || !commandRef.value) return
  measureCommandCenter()
  observer = new ResizeObserver(measureCommandCenter)
  observer.observe(commandRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

// Unset until measured, so the layout's own fallback applies during SSR and
// the first paint rather than a zero offset.
const shellStyle = computed(() =>
  commandHeight.value > 0 ? { '--sheet-command-h': `${commandHeight.value}px` } : {}
)
</script>

<template>
  <div :style="shellStyle">
    <!-- pb-4 lives on the wrapper being measured, so the sticky regions
         begin where the command center visually ends rather than where its
         border-box does. -->
    <div
      ref="commandRef"
      class="pb-4"
    >
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
