<script setup lang="ts">
// Character Builder V2, CINEMATIC REDESIGN (Milestone B1) -- Region B,
// "Character Preview": the one surface that answers "who am I building"
// at a glance, updating reactively as Species/Class/Background/Name change
// on EVERY viewport (full height on desktop, a compact header strip on
// mobile -- see CreationStageRail.vue's own header for the shared
// orientation convention this file mirrors).
//
// Deliberately presentation-only and B2-reusable: it takes a plain `name`
// and a generic `rows` list (label + title + optional source book), never
// a BuilderCatalogueEntry or a creation-specific draft shape. The Level-Up
// Wizard (B2) previews an EXISTING character's own identity, not a fresh
// creation draft -- the same component must work for both, so it knows
// nothing about either one's own state shape.
//
// No portrait exists in this World's catalogue data at all (see
// CreationEntityEmblem.vue's own header) -- the emblem is the entire
// "portrait", not a loading state for one that might arrive later.

import CreationEntityEmblem from './CreationEntityEmblem.vue'

export type CharacterPreviewRow = {
  key: string
  label: string
  title: string | null
  sourceBook?: string
}

const props = withDefaults(defineProps<{
  name: string
  rows: readonly CharacterPreviewRow[]
  // Which row's own title should appear in the large emblem -- the first
  // row with a value, by convention Species, so the preview reads "a
  // specific someone" the moment the very first real choice is made.
  compact?: boolean
}>(), {
  compact: false
})

const emblemSource = computed(() => props.rows.find((row) => row.title)?.title ?? null)
const displayName = computed(() => props.name.trim() || 'Your Character')
const hasAnyChoice = computed(() => props.rows.some((row) => row.title))
</script>

<template>
  <div
    class="eldra-ornate-panel eldra-frame-corners relative overflow-hidden rounded-none border border-eldra-accent/30 backdrop-blur"
    :class="compact ? 'flex items-center gap-3 px-4 py-3' : 'flex flex-col items-center gap-4 px-6 py-8 text-center'"
  >
    <!-- Atmospheric backdrop glow -- restrained, never a competing animation. -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(var(--eldra-accent-rgb)/0.14),transparent_70%)]"
    />

    <CreationEntityEmblem
      :title="emblemSource ?? displayName"
      :size="compact ? 'sm' : 'lg'"
      class="relative transition-all duration-500 motion-reduce:transition-none"
    />

    <div class="relative min-w-0 flex-1">
      <p class="eldra-kicker text-[0.65rem]">
        {{ hasAnyChoice ? 'In the Making' : 'A Blank Page' }}
      </p>
      <h2
        class="eldra-title mt-1 truncate font-serif"
        :class="compact ? 'text-base' : 'text-2xl sm:text-3xl'"
      >
        {{ displayName }}
      </h2>

      <dl
        class="mt-3 grid gap-2"
        :class="compact ? 'grid-flow-col auto-cols-max gap-x-4' : 'grid-cols-1'"
      >
        <div
          v-for="row in rows"
          :key="row.key"
          class="min-w-0 transition-opacity duration-300 motion-reduce:transition-none"
          :class="compact ? 'text-left' : 'eldra-gold-divider border-0 pt-2 first:border-0 first:pt-0'"
        >
          <dt class="text-[0.65rem] uppercase tracking-[0.22em] text-eldra-text-ghost">
            {{ row.label }}
          </dt>
          <dd
            class="truncate text-sm font-semibold"
            :class="row.title ? 'text-eldra-text-strong' : 'text-eldra-text-faint'"
          >
            {{ row.title ?? 'Not yet chosen' }}
            <span
              v-if="row.title && row.sourceBook"
              class="ml-1 text-xs font-normal text-eldra-text-ghost"
            >· {{ row.sourceBook }}</span>
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>
