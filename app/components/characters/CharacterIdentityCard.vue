<script setup lang="ts">
// CharacterIdentityCard -- Visual Language Phase 2, Portrait & Identity
// Anchor (see .github/docs/architecture/eldra-character-sheet-visual-
// language.md §1.4/§4, eldra-design-language.md §11 "Identity Block").
// Replaces the bare kicker+h1+<dl> markup sheet-v2.vue previously inlined
// twice (once for the desktop left rail, once for the mobile/tablet
// Character-tab fold) with one component both call sites share -- the
// same "re-parent into a component instead of copy-pasting markup" move
// this Sheet's own Phase 1 (CharacterSheetSection) already made.
//
// PRESENTATION ONLY. This component computes nothing and edits nothing:
// `characterTitle`, `imageUrl`, `level`, and `identityRows` all arrive as
// props already resolved by useCharacterSheet.ts (`identity` and
// `characterLevel`) -- the same values the Vitals Bar and the Species/
// Class/Background sections already read, not a second source of truth.
//
// PORTRAIT -- WHY `eldra-image-frame`, NOT A NEW ORNATE PANEL
// ---------------------------------------------------------------------------
// The task's own brief is explicit: the Identity block should feel like a
// field codex's cover page, "not another panel" -- and the Vitals Bar
// already spends this screen's one Feature surface (Design Language §8
// Rule 1: exactly one Feature surface per screen). So the portrait, not a
// box around the whole card, carries the visual weight: `eldra-image-frame`
// (eldra-fieldguide.css, already used by V1's own portrait treatment) is a
// hairline double gold border -- Gold Structure -- with no glow, no
// corners, no blur. Everything below it (name, level, identity rows) sits
// directly on the surrounding rail/tab background, exactly as the markup
// it replaces did, so this reads as a title page rather than a tenth
// identical card.
//
// TYPOGRAPHY -- READY FOR A DISPLAY SERIF, NOT WAITING ON ONE
// ---------------------------------------------------------------------------
// The character name uses the existing `eldra-title` class (already the
// codebase's "this is a title" hook -- eldra-fieldguide.css currently gives
// it only color/text-shadow, no font-family). Introducing a display serif
// later (eldra-design-language.md §4/§13) is then a single rule added to
// that one class, not a hunt through every consumer -- this component
// invents no separate "identity name" style to migrate later.
//
// `compact` distinguishes the two call sites' existing density (the
// desktop rail's narrower `grid`/`text-sm` rows vs. the wider Character-tab
// fold's `flex-wrap`/`text-base` rows) -- it is NOT a second layout: both
// modes stack portrait -> name/level -> identity rows identically, per
// this task's own "do not redesign layout" scope.

import CharacterStatChip from '~/components/characters/CharacterStatChip.vue'

withDefaults(defineProps<{
  characterTitle: string
  imageUrl?: string | null
  level: number
  identityRows: readonly { key: string; label: string; value: string; missing: boolean }[]
  compact?: boolean
}>(), {
  imageUrl: null,
  compact: false
})
</script>

<template>
  <div class="grid gap-4">
    <div class="eldra-image-frame max-w-xs overflow-hidden rounded-none border bg-black/25">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="characterTitle || 'Character portrait'"
        class="aspect-[4/5] w-full object-cover object-top"
        loading="lazy"
      >
      <div
        v-else
        class="flex aspect-[4/5] w-full items-center justify-center border border-dashed border-[rgba(201,164,90,0.28)] text-center text-sm text-[#9f9278]"
      >
        No portrait set
      </div>
    </div>

    <div>
      <div class="eldra-kicker text-xs">
        Character Sheet
      </div>

      <h1
        class="eldra-title mt-1 break-words font-semibold leading-tight"
        :class="compact ? 'text-2xl' : 'text-3xl'"
      >
        {{ characterTitle || 'Character Sheet' }}
      </h1>

      <div class="mt-2">
        <CharacterStatChip
          label="Level"
          :value="level"
        />
      </div>
    </div>

    <dl :class="compact ? 'grid gap-2' : 'flex flex-wrap gap-x-6 gap-y-2'">
      <div
        v-for="row in identityRows"
        :key="row.key"
        class="min-w-0"
      >
        <dt class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
          {{ row.label }}
        </dt>
        <dd
          class="break-words font-semibold"
          :class="[compact ? 'text-sm' : 'text-base', row.missing ? 'text-red-300' : 'text-[#fff7df]']"
        >
          {{ row.value }}
        </dd>
      </div>
    </dl>

    <div class="eldra-gold-rule" />
  </div>
</template>
