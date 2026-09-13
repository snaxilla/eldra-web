<script setup lang="ts">
// WorldRollVisibilityBadge -- the small "Private"/"Table" badge every Roll
// Tray entry carries (Eldra Roll System Phase 2C, eldra-roll-system.md §9's
// own CONTENT list: "visibility (a small badge)"). Shape + text, never
// colour alone (Design Language §7.6, the same discipline
// CharacterSaveList.vue's proficiency marker already follows) -- an icon
// AND a word, not a colored dot a colorblind player can't read.
//
// Reuses `.eldra-gold-chip` (CharacterStatChip.vue's own material) rather
// than inventing a new badge style -- this task's own "reuse existing
// materials, do not duplicate styling."
//
// Icons are new vocabulary for this app (no existing private/public icon
// convention was found anywhere else) but extend, rather than conflict
// with, what's already used for adjacent ideas: i-lucide-users already
// means "the group" elsewhere (AppSidebar.vue's Players entry); i-lucide-lock
// pairs naturally against it for "hidden from the group."

import type { RollVisibility } from '~/lib/rolls/types'

const props = defineProps<{
  visibility: RollVisibility
}>()

const ICON_BY_VISIBILITY: Record<RollVisibility, string> = {
  private: 'i-lucide-lock',
  table: 'i-lucide-users'
}

const LABEL_BY_VISIBILITY: Record<RollVisibility, string> = {
  private: 'Private',
  table: 'Table'
}
</script>

<template>
  <span class="eldra-gold-chip inline-flex items-center gap-1 rounded-none border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em]">
    <UIcon
      :name="ICON_BY_VISIBILITY[props.visibility]"
      class="h-3 w-3"
    />
    {{ LABEL_BY_VISIBILITY[props.visibility] }}
  </span>
</template>
