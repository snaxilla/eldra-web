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
  // CHARACTER CREATOR V3 -- the species' published artwork, when it has one;
  // absent means the monogram emblem (see CreationEntityEmblem.vue).
  imageUrl?: string | null
  // CHARACTER CREATOR V3 -- NAME FIELD RELOCATION. A real reported first-time-player bug: the
  // Creator had a SEPARATE "Character Name" input above the Species picker, disconnected from
  // this "who am I building" card -- a player naturally tried to type her name onto this card's
  // own displayed title instead. Default false so this stays a pure, reusable display-only
  // component (this header's own stated B2/Level-Up-Wizard reuse, which previews an EXISTING
  // character and must stay read-only, needs no change): `create-v2.vue` is the only caller
  // today and is the only one that opts in.
  editableName?: boolean
}>(), {
  compact: false,
  imageUrl: null,
  editableName: false
})

const emit = defineEmits<{ 'update:name': [string] }>()

const portraitFailed = ref<string | null>(null)
// See CreationEntityEmblem.vue: an SSR-parsed image can fail before hydration attaches `@error`.
const portraitRef = ref<HTMLImageElement | null>(null)
onMounted(() => {
  const el = portraitRef.value
  if (el && el.complete && el.naturalWidth === 0) portraitFailed.value = props.imageUrl
})

const showPortrait = computed(() => !!props.imageUrl && portraitFailed.value !== props.imageUrl)

const emblemSource = computed(() => props.rows.find((row) => row.title)?.title ?? null)
const displayName = computed(() => props.name.trim() || 'Your Character')
const hasAnyChoice = computed(() => props.rows.some((row) => row.title))
</script>

<template>
  <div
    class="eldra-frame-corners relative overflow-hidden rounded-none border border-eldra-accent/30 bg-eldra-ink/72 backdrop-blur-md"
    :class="compact ? 'flex items-center gap-3 px-3 py-2.5' : 'flex flex-col items-center gap-4 px-5 py-6 text-center'"
  >
    <!-- Atmospheric backdrop glow -- restrained, never a competing animation. -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(var(--eldra-accent-rgb)/0.14),transparent_70%)]"
    />

    <!-- Portrait: the species' real artwork in a tall gilded frame on desktop,
         a small thumbnail on phones; the monogram only when there is none. -->
    <div
      v-if="showPortrait && !compact"
      aria-hidden="true"
      class="relative aspect-[4/5] w-full max-w-[13rem] overflow-hidden border border-eldra-accent/45 shadow-[0_0_30px_rgb(var(--eldra-accent-rgb)/0.2)]"
    >
      <img
        ref="portraitRef"
        :src="imageUrl!"
        alt=""
        decoding="async"
        class="size-full object-cover object-top transition-opacity duration-500 motion-reduce:transition-none"
        @error="portraitFailed = imageUrl"
      >
      <div class="absolute inset-0 bg-[linear-gradient(0deg,rgb(var(--eldra-ink-rgb)/0.55),transparent_45%)]" />
    </div>
    <CreationEntityEmblem
      v-else
      :title="emblemSource ?? displayName"
      :image-url="compact ? imageUrl : null"
      :size="compact ? 'md' : 'lg'"
      class="relative transition-all duration-500 motion-reduce:transition-none"
    />

    <div class="relative min-w-0 flex-1">
      <p class="eldra-kicker text-[0.65rem]">
        {{ hasAnyChoice ? 'In the Making' : 'A Blank Page' }}
      </p>
      <div v-if="editableName">
        <label
          for="character-preview-name"
          class="mt-1 block text-[0.65rem] uppercase tracking-[0.22em] text-eldra-text-ghost"
        >Character Name</label>
        <input
          id="character-preview-name"
          type="text"
          autocomplete="off"
          placeholder="Name your character"
          :value="name"
          class="eldra-title mt-0.5 w-full min-w-0 truncate border-0 border-b border-eldra-accent/35 bg-transparent font-serif outline-none focus-visible:border-eldra-accent-bright"
          :class="compact ? 'text-base' : 'text-2xl sm:text-3xl'"
          @input="emit('update:name', ($event.target as HTMLInputElement).value)"
        >
      </div>
      <h2
        v-else
        class="eldra-title mt-1 truncate font-serif"
        :class="compact ? 'text-base' : 'text-2xl sm:text-3xl'"
      >
        {{ displayName }}
      </h2>

      <!-- CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- CHARACTER SUMMARY. The real reported
           bug: `.eldra-gold-divider` is a decorative, fixed `height: 1px` line (see
           app/assets/css/eldra-fieldguide.css), never a border utility -- applying it to a
           container that also holds real dt/dd TEXT forced that text into a 1px box, which is
           exactly what read as "overlapping text and broken layout". Replaced with a real
           `border-t`, and the compact (phone) row switches from a column-flow grid (which could
           overflow a narrow screen once three rows' worth of titles/source books were long) to a
           wrapping flex row instead. -->
      <dl
        class="mt-3"
        :class="compact ? 'flex flex-wrap gap-x-4 gap-y-1.5' : 'grid grid-cols-1 gap-2.5'"
      >
        <div
          v-for="(row, index) in rows"
          :key="row.key"
          class="min-w-0 transition-opacity duration-300 motion-reduce:transition-none"
          :class="compact ? '' : (index > 0 ? 'border-t border-eldra-accent/14 pt-2.5' : '')"
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
