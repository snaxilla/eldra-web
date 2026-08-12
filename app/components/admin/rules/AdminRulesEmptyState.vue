<script setup lang="ts">
// Unconfigured state: a legal, ordinary condition, never an error.
// world-configuration.md §3.3: "A World with no world_rules_config row is
// unconfigured, and unconfigured is not an error." No default is
// fabricated here -- this is a pure empty state, no data to show.
</script>

<template>
  <div class="rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-8 text-center">
    <UIcon name="i-lucide-dices" class="mx-auto h-8 w-8 text-[#9f9278]" />

    <h3 class="mt-3 text-lg font-semibold text-white">
      No Rules Package Activated
    </h3>

    <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[#d8ceb8]">
      This World has no active Rules Package. It plays exactly as it does today
      -- the legacy Character Sheet is completely unaffected. Activating a
      package is a Game Admin action that isn't available yet.
    </p>
  </div>
</template>
