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

// CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- CHARACTER SUMMARY. `compact` renders the
// outstanding list as a native <details> (collapsed by default, the count always stated in its
// own <summary> so the fact "something is missing" is never hidden, only the full list) --
// Region B's own persistent preview needed this to stay a small, SIDE panel rather than growing
// to match however many answers are still outstanding. The non-compact (Review stage) rendering
// is completely unchanged.
withDefaults(defineProps<{
  messages?: readonly string[]
  errorMessage?: string
  compact?: boolean
}>(), {
  messages: () => [],
  errorMessage: '',
  compact: false
})
</script>

<template>
  <div
    v-if="messages.length || errorMessage"
    class="space-y-2"
  >
    <details
      v-if="messages.length && compact"
      class="group rounded-none border border-eldra-caution/40 bg-eldra-caution/10"
    >
      <summary class="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-eldra-caution marker:hidden focus-visible:ring-2 focus-visible:ring-eldra-accent/65">
        <span>{{ messages.length }} still needed</span>
        <span
          aria-hidden="true"
          class="text-eldra-text-faint transition-transform group-open:rotate-90"
        >&#9656;</span>
      </summary>
      <ul class="list-disc space-y-0.5 border-t border-eldra-caution/20 px-3 py-2 pl-7 text-xs text-eldra-text-soft">
        <li
          v-for="message in messages"
          :key="message"
        >
          {{ message }}
        </li>
      </ul>
    </details>

    <div
      v-else-if="messages.length"
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
