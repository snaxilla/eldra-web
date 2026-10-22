<script setup lang="ts">
// Character Builder V2, CINEMATIC REDESIGN (Milestone B1) -- the outstanding-
// requirements list and the create/save error message, as one reusable,
// actionable block. Neither fabricates a message of its own: `messages`
// is always `missingRequirements(draft, creationContext)`'s own real
// output (characterBuilderSelection.ts), and `errorMessage` is always the
// server's own response -- this component only decides how they LOOK.
//
// `aria-live="polite"` on the outstanding list: a player who just answered
// the last missing choice should hear/see it disappear without needing to
// refocus anything, matching this task's own "actionable validation
// messages" requirement.

withDefaults(defineProps<{
  messages?: readonly string[]
  errorMessage?: string
}>(), {
  messages: () => [],
  errorMessage: ''
})
</script>

<template>
  <div
    v-if="messages.length || errorMessage"
    class="space-y-2"
  >
    <div
      v-if="messages.length"
      class="rounded-none border border-eldra-caution/40 bg-eldra-caution/10 p-3"
      aria-live="polite"
    >
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-eldra-caution">
        Still needed
      </p>
      <ul class="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-eldra-text-soft">
        <li
          v-for="message in messages"
          :key="message"
        >
          {{ message }}
        </li>
      </ul>
    </div>

    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>
