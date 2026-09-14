<script setup lang="ts">
// WorldDiceStage -- reads the shared, world-scoped animation queue and
// renders whatever is currently playing. Eldra Roll System Phase 3A
// (.github/docs/architecture/eldra-roll-system.md §11).
//
// THE REUSABLE STAGE. This is the piece "every future gameplay system
// should use the same overlay" (this task's own WORLD SCOPE section)
// actually refers to reusing: WorldDiceOverlay.vue mounts this once, at
// the World layout level, but nothing about this component is
// sheet-specific, tray-specific, or admin-specific -- it reads
// useDiceAnimationQueue() (a plain singleton, not a prop), so any future
// surface (an Encounter Screen, a DM Screen) could mount a SECOND
// WorldDiceStage of its own and it would show the exact same live
// animation, because there is only ever one queue.
//
// OWNS: which request is showing, the enter/leave transition, and the
// "+N queued" indicator (this task's own QUEUE section: "design for
// future multiplayer... if multiple Roll Events arrive quickly, queue
// them"). Does NOT own: the animation's own visual content
// (WorldDiceAnimation.vue), or ANY gameplay data (history, pagination,
// visibility -- WorldRollTray.vue's domain, kept deliberately separate
// per this task's own COMPONENT RESPONSIBILITIES section).
//
// Renders NOTHING when the queue is idle -- no permanent panel, no empty
// chrome sitting on screen (this task's own NO RENDERER YET section: "the
// important part is lifecycle, not spectacle").

import WorldDiceAnimation from '~/components/world/WorldDiceAnimation.vue'
import { useDiceAnimationQueue } from '~/composables/useDiceAnimationQueue'

const { state, current, queueLength } = useDiceAnimationQueue()
</script>

<template>
  <Transition
    enter-from-class="opacity-0 scale-95 translate-y-2"
    enter-active-class="transition duration-200 ease-out"
    leave-to-class="opacity-0 scale-95 translate-y-2"
    leave-active-class="transition duration-200 ease-in"
  >
    <div
      v-if="current"
      class="eldra-ornate-panel eldra-frame-corners relative rounded-none border px-5 py-4 backdrop-blur"
    >
      <WorldDiceAnimation
        :request="current"
        :state="state"
      />

      <span
        v-if="queueLength > 0"
        class="eldra-gold-chip absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-none border px-1 text-[0.6rem] font-semibold"
        :title="`${queueLength} more roll${queueLength === 1 ? '' : 's'} queued`"
      >
        +{{ queueLength }}
      </span>
    </div>
  </Transition>
</template>
