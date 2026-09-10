<script setup lang="ts">
// Canonical Character Sheet route -- Visual Language Phase 0 (see
// .github/docs/architecture/eldra-character-sheet-visual-language.md §5,
// §8 Phase 0). This is the ONE URL every entry point in the app should
// link to for "open this character's sheet" -- the roster, the World
// entity drawer, admin, and both the legacy and current Builder
// completion flows all point here now, never at `sheet-v2` or
// `entities/:id/sheet` directly.
//
// This page renders nothing itself. `character-sheet-resolve` (see
// app/middleware/character-sheet-resolve.ts) runs first, checks the same
// `assembly.available` signal sheet-v2.vue already branches on, and
// redirects to whichever concrete sheet can actually render this
// character -- V2's `sheet-v2` if it has a `catalogue_selection`, legacy
// V1's `entities/:id/sheet` if it doesn't. Neither concrete sheet is
// touched by this file; it only decides which one a visitor lands on.
//
// The template below is reached only when the middleware could not
// classify the character at all (the assembly fetch failed, or the
// character truly does not exist) -- both concrete sheets already own a
// far more complete loading/error presentation than this route should
// attempt to duplicate, so this stays intentionally minimal.
definePageMeta({
  middleware: ['character-sheet-resolve']
})

const route = useRoute()
const worldId = computed(() => String(route.params.id))
</script>

<template>
  <div class="p-6 text-sm text-[#d8ceb8]">
    <p>This character could not be found.</p>
    <NuxtLink
      :to="`/worlds/${worldId}/characters`"
      class="mt-2 inline-block text-[#9f9278] hover:text-[#d8ceb8]"
    >
      &larr; Back to Characters
    </NuxtLink>
  </div>
</template>
