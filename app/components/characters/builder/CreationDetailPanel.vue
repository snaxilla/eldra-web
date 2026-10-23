<script setup lang="ts">
// Character Builder V2, CINEMATIC REDESIGN (Milestone B1) -- Region C's own
// "contextual detail panel". The exact same ornate box every "About this
// Species/Class/Background" preview already used, extracted so the stage
// content below (and B2's own Level-Up Wizard, previewing a feature/
// subclass/spell the same way) shares one titled-glass-panel shell instead
// of each caller re-typing the same border/backdrop classes.
//
// Presentation only -- it owns no content of its own, just a title and a
// slot. The caller decides what goes inside (a ContentPresentationPanel,
// an empty-state message, anything else).

withDefaults(defineProps<{
  title?: string
}>(), {
  title: undefined
})
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners min-w-0 rounded-none border border-eldra-accent/24 bg-eldra-panel/72 p-4 backdrop-blur">
    <h3
      v-if="title"
      class="text-xs uppercase tracking-[0.2em] text-eldra-text-faint"
    >
      {{ title }}
    </h3>
    <div :class="title ? 'mt-2' : ''">
      <slot />
    </div>
  </div>
</template>
