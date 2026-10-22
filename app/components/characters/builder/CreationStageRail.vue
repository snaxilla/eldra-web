<script setup lang="ts">
// Character Builder V2, CINEMATIC REDESIGN (Milestone B1) -- Region A,
// "Navigation / Progress". A plain list of buttons, never a lock: every
// stage is reachable at any time regardless of completeness, exactly like
// the pre-redesign progress rail this replaces (create-v2.vue's own header
// on why "Next" is a convenience, never a gate -- unchanged by this
// redesign). Generic over `stages` -- a plain {key, label, complete}[] --
// so B2's own Level-Up Wizard can reuse this verbatim for its own stage
// set, which will never be this Builder's `BuilderStepKey` union.
//
// Two orientations, one component, one set of states (current / complete /
// remaining) -- `vertical` is the roomy desktop rail (Region A as its own
// column); the default (horizontal, scrollable) is the compact/mobile rail
// this already was before the redesign.

export type CreationStage = {
  key: string
  label: string
  complete: boolean
}

const props = withDefaults(defineProps<{
  stages: readonly CreationStage[]
  activeKey: string
  vertical?: boolean
}>(), {
  vertical: false
})

defineEmits<{ select: [key: string] }>()
</script>

<template>
  <nav
    aria-label="Character creation stages"
    :class="vertical
      ? 'flex flex-col gap-1'
      : 'flex gap-1.5 overflow-x-auto pb-1'"
  >
    <button
      v-for="stage in stages"
      :key="stage.key"
      type="button"
      class="flex min-h-11 items-center gap-2 rounded-none border px-3 text-xs font-semibold uppercase tracking-[0.12em] transition focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
      :class="[
        vertical ? 'justify-start' : 'shrink-0',
        activeKey === stage.key
          ? 'border-eldra-accent/62 bg-eldra-accent/18 text-eldra-text-strong'
          : 'border-eldra-accent/20 bg-eldra-panel/55 text-eldra-text-faint hover:border-eldra-accent/40 hover:text-eldra-text-soft'
      ]"
      :aria-current="activeKey === stage.key ? 'step' : undefined"
      @click="$emit('select', stage.key)"
    >
      <span
        aria-hidden="true"
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[0.6rem]"
        :class="stage.complete
          ? 'border-eldra-accent/70 bg-eldra-accent/70 text-eldra-ink'
          : 'border-eldra-accent/30 text-transparent'"
      >✓</span>
      <span class="truncate">{{ stage.label }}</span>
      <span class="sr-only">{{ stage.complete ? '(complete)' : '(incomplete)' }}</span>
    </button>
  </nav>
</template>
