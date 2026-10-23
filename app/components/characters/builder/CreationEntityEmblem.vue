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

//
// CHARACTER CREATOR V3 -- when the entity has real published artwork
// (`imageUrl`, from its resolved presentation) the artwork is shown instead,
// as a framed thumbnail cropped to the top of the illustration (where faces
// live). A missing or failing URL falls back to this monogram, so the monogram
// is only ever the fallback when real art does not exist -- never a
// replacement for art that does.

const props = withDefaults(defineProps<{
  title: string
  size?: 'sm' | 'lg' | 'md'
  imageUrl?: string | null
}>(), {
  size: 'sm',
  imageUrl: null
})

const initial = computed(() => props.title.trim().charAt(0).toUpperCase() || '?')

const failedUrl = ref<string | null>(null)
const showImage = computed(() => !!props.imageUrl && failedUrl.value !== props.imageUrl)

// An image that fails while the server-rendered HTML is still being parsed fires its `error`
// event before Vue has attached a listener. Check once after mount so that case still falls
// back to the monogram instead of leaving a broken-image icon.
const imgRef = ref<HTMLImageElement | null>(null)
onMounted(() => {
  const el = imgRef.value
  if (el && el.complete && el.naturalWidth === 0) failedUrl.value = props.imageUrl
})
</script>

<template>
  <span
    v-if="showImage"
    aria-hidden="true"
    class="relative block shrink-0 overflow-hidden rounded-none border border-eldra-accent/45 bg-eldra-ink/60 shadow-[0_0_18px_rgb(var(--eldra-accent-rgb)/0.14)]"
    :class="size === 'lg' ? 'h-32 w-32' : size === 'md' ? 'h-14 w-14' : 'h-11 w-11'"
  >
    <img
      ref="imgRef"
      :src="imageUrl!"
      alt=""
      loading="lazy"
      decoding="async"
      class="h-full w-full object-cover object-top"
      @error="failedUrl = imageUrl"
    >
  </span>
  <span
    v-else
    aria-hidden="true"
    class="eldra-filigree relative flex shrink-0 items-center justify-center rounded-full border border-eldra-accent/45 bg-gradient-to-b from-eldra-accent/18 to-transparent font-serif text-eldra-text-strong shadow-[0_0_24px_rgb(var(--eldra-accent-rgb)/0.14)]"
    :class="size === 'lg' ? 'h-24 w-24 text-4xl sm:h-32 sm:w-32 sm:text-5xl' : size === 'md' ? 'h-14 w-14 text-xl' : 'h-11 w-11 text-lg'"
  >
    {{ initial }}
  </span>
</template>
