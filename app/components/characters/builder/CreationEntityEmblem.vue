<script setup lang="ts">
// A small ornamental monogram -- the "character coming to life" fallback for
// any Builder entity (Species / Class / Background) that has no portrait at
// all. Character Builder V2's own catalogue carries no image field
// (BuilderCatalogueEntry, characterBuilderSelection.ts) -- there is no real
// artwork to fall back FROM, so this is not a loading placeholder, it is the
// actual, permanent presentation for every entity in this World. Reused by
// CreationOptionCard (one per offered option) and CharacterPreviewPanel (the
// larger, central glyph for whichever entity is currently selected in each
// slot) -- one small component, two sizes, never two implementations.
//
// Deliberately just the first letter of the title in an ornate frame, never
// a fabricated icon library lookup keyed by name (that would silently
// imply a maintained icon-per-species/class mapping this codebase does not
// have, and would need updating by hand for every future Content Pack).

const props = withDefaults(defineProps<{
  title: string
  size?: 'sm' | 'lg'
}>(), {
  size: 'sm'
})

const initial = computed(() => props.title.trim().charAt(0).toUpperCase() || '?')
</script>

<template>
  <span
    aria-hidden="true"
    class="eldra-filigree relative flex shrink-0 items-center justify-center rounded-full border border-eldra-accent/45 bg-gradient-to-b from-eldra-accent/18 to-transparent font-serif text-eldra-text-strong shadow-[0_0_24px_rgb(var(--eldra-accent-rgb)/0.14)]"
    :class="size === 'lg' ? 'h-24 w-24 text-4xl sm:h-32 sm:w-32 sm:text-5xl' : 'h-11 w-11 text-lg'"
  >
    {{ initial }}
  </span>
</template>
