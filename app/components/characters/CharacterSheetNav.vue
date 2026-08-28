<script setup lang="ts">
// CharacterSheetNav -- Character Sheet Beautification Pass, Phase 4 (see
// .github/docs/architecture/character-sheet-beauty-pass.md §6.1, §7.7,
// §8.1, §11 Phase 4). Pure presentation, no state of its own: given the
// five tabs, which is active, and a `variant`, it renders one of two
// shapes and emits `select`. CharacterSheetShell.vue decides which
// variant is visible at a given breakpoint (`tabs` inside the center
// column on desktop/tablet, `bottom` fixed to the viewport on phone) --
// both are safe to mount simultaneously (CSS-toggled) since this
// component holds no per-instance state, unlike the rail content
// CharacterSheetShell.vue's own header explains it does NOT duplicate.
//
// `tabs` variant: §7.7's Ghost button style -- text + underline on
// active, no background fill.
// `bottom` variant: §6.1 -- "Active tab is indicated by icon fill + label
// weight + a top edge rule -- never color alone."

import type { CharacterSheetTab, CharacterSheetTabKey } from '~/composables/useCharacterSheetLayout'

defineProps<{
  tabs: readonly CharacterSheetTab[]
  activeTab: CharacterSheetTabKey
  variant: 'tabs' | 'bottom'
}>()

const emit = defineEmits<{
  (e: 'select', tab: CharacterSheetTabKey): void
}>()
</script>

<template>
  <nav
    v-if="variant === 'tabs'"
    class="flex flex-wrap items-center gap-1 border-b border-[rgba(201,164,90,0.16)]"
    aria-label="Character Sheet sections"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="relative flex min-h-11 items-center gap-1.5 px-3 text-sm text-[#9f9278] transition hover:text-[#d8ceb8]"
      :class="activeTab === tab.key ? 'font-semibold text-[#fff7df]' : ''"
      :aria-current="activeTab === tab.key ? 'page' : undefined"
      @click="emit('select', tab.key)"
    >
      <UIcon
        :name="tab.icon"
        class="h-4 w-4"
      />
      {{ tab.label }}
      <span
        v-if="activeTab === tab.key"
        class="absolute inset-x-2 -bottom-px h-0.5 bg-[#c9a45a]"
      />
    </button>
  </nav>

  <nav
    v-else
    class="flex items-stretch justify-around"
    aria-label="Character Sheet sections"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 py-1.5 text-[0.65rem] text-[#9f9278] transition"
      :class="activeTab === tab.key ? 'border-t-[#c9a45a] font-semibold text-[#fff7df]' : 'border-t-transparent'"
      :aria-current="activeTab === tab.key ? 'page' : undefined"
      @click="emit('select', tab.key)"
    >
      <UIcon
        :name="tab.icon"
        class="h-5 w-5"
        :class="activeTab === tab.key ? 'text-[#c9a45a]' : ''"
      />
      {{ tab.label }}
    </button>
  </nav>
</template>
