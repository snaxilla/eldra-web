<script setup lang="ts">
// Shared "Customize Page" entry point for World Page Presentation
// (background/mode) settings. Replaces the old "Build mode, nothing
// selected" auto-opening aside duplicated across several collection
// pages (WorldEntityInteractivePage.vue, enemies.vue,
// characters/index.vue, timelines/index.vue, timelines/[timelineId].vue)
// -- Play/Build (`mode`) is Map-pin-only now (see
// worldEntityDirectEditEligibility.ts's own header for the sibling
// correction this follows); this button's visibility is capability-only,
// via the caller-supplied `canEdit` (world-settings-eligibility.ts's
// canEditWorldSettings), never `mode`.
//
// Reuses WorldPagePresentationPanel UNCHANGED inside Nuxt UI's existing
// UModal, rather than inventing a bespoke drawer -- the same shared
// dialog primitive CharacterInventoryPanel.vue/
// CharacterSpellcastingPanel.vue already use elsewhere in this app.
// UModal already provides focus management, Escape/outside-click
// dismissal, and a responsive mobile layout for free.
//
// No dirty-draft guard here: every WorldPagePresentationPanel action
// (mode buttons, background select, Clear) is an immediate network save
// with no separate draft/Save step -- there is nothing to protect on
// close.
//
// PAGE BACKGROUND PICKER UX CORRECTION -- the panel's background
// control now opens WorldMediaPicker, a hand-rolled Teleport overlay,
// not a Reka-UI layer. Reka-UI's own dismissable-layer stack (what lets
// nested Reka-UI dialogs/popovers avoid closing each other) has no way
// to know WorldMediaPicker is covering this UModal, so without this,
// clicking the picker's own backdrop to cancel it -- or pressing Escape
// while it's open -- would read as "outside this modal" and close
// Customize Page too. `pickerOpen` (relayed up via the panel's own
// `picker-open-change` emit) turns `dismissible` off for exactly as
// long as the picker is open, so both are blocked instead; Escape then
// does nothing while the picker is open rather than closing the wrong
// surface. (WorldMediaPicker itself has no Escape handling of its own
// either -- a pre-existing gap in that shared component, not
// introduced here, and out of this task's scope to fix broadly.)
defineProps<{
  worldId: string
  pageKey: string
  title: string
  canEdit: boolean
  // Plain-language statement of what this affects -- e.g. "this page" vs
  // "the whole Timelines page" -- so the caller can be precise about
  // scope rather than this component guessing it from pageKey.
  scopeNote: string
}>()

const open = ref(false)
const pickerOpen = ref(false)
</script>

<template>
  <button
    v-if="canEdit"
    type="button"
    class="rounded-none border border-eldra-accent/22 bg-eldra-panel/72 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/[0.08]"
    @click="open = true"
  >
    Customize Page
  </button>

  <UModal
    v-model:open="open"
    title="Customize Page"
    :description="scopeNote"
    :dismissible="!pickerOpen"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <WorldPagePresentationPanel
        embedded
        :world-id="worldId"
        :page-key="pageKey"
        :title="title"
        :description="scopeNote"
        @picker-open-change="pickerOpen = $event"
      />
    </template>
  </UModal>
</template>
