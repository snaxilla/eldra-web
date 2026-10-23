<script setup lang="ts">
// Character Creator V3 -- the emotional centrepiece of a stage: a kicker, the
// selected content's name set large, an ornamental rule, a short "what is
// this" paragraph, and a row of highlight medallions ("what does it give me").
// "View Full Details" opens the complete ContentPresentationPanel on demand --
// progressive disclosure: a newcomer reads the hero, a veteran skips it, and
// nothing is removed.
//
// It owns no content and no rules: it renders `heroHighlights(entry)`, a pure
// rearrangement of the already-resolved presentation model.
//
// The slot (default) hosts stage-specific controls under the hero text (the
// name field on Identity).

import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import { heroHighlights } from '~/lib/characters/creator-hero'
import type { PresentationEntry } from '~/lib/content-presentation'

const props = defineProps<{
  kicker: string
  entry?: PresentationEntry | null
  // Shown when nothing is selected yet, so the hero is never an empty hole.
  emptyTitle: string
  emptyHint: string
  // Whether this entry's artwork is already the full-bleed backdrop. When it
  // is not (the backdrop came from config/stage/default), the hero shows the
  // art as a framed figure so the chosen content is never imageless.
  figureUrl?: string | null
}>()

const detailsOpen = ref(false)
const figureFailed = ref<string | null>(null)

// Selecting different content collapses the previous one's details.
watch(() => props.entry?.name, () => { detailsOpen.value = false })

const highlights = computed(() => heroHighlights(props.entry))

// A small, purely visual label -> glyph table. It carries no rule: an
// unrecognised label just gets the generic sparkle.
const FACT_ICONS: Array<[RegExp, string]> = [
  [/hit die/i, 'i-lucide-heart-pulse'],
  [/ability/i, 'i-lucide-gauge'],
  [/saving/i, 'i-lucide-shield-check'],
  [/armor/i, 'i-lucide-shield'],
  [/weapon/i, 'i-lucide-sword'],
  [/tool/i, 'i-lucide-hammer'],
  [/skill/i, 'i-lucide-graduation-cap'],
  [/speed/i, 'i-lucide-footprints'],
  [/size/i, 'i-lucide-ruler'],
  [/senses|vision/i, 'i-lucide-eye'],
  [/language/i, 'i-lucide-languages'],
  [/creature/i, 'i-lucide-user'],
  [/resist/i, 'i-lucide-shield-half'],
  [/feat/i, 'i-lucide-award'],
  [/spell/i, 'i-lucide-wand-sparkles']
]
function iconFor(label: string): string {
  return FACT_ICONS.find(([pattern]) => pattern.test(label))?.[1] ?? 'i-lucide-sparkles'
}

// See CreationEntityEmblem.vue: an SSR-parsed image can fail before hydration attaches `@error`.
const figureRef = ref<HTMLImageElement | null>(null)
onMounted(() => {
  const el = figureRef.value
  if (el && el.complete && el.naturalWidth === 0) figureFailed.value = props.figureUrl ?? null
})

const showFigure = computed(() => !!props.figureUrl && figureFailed.value !== props.figureUrl)
</script>

<template>
  <section
    class="creator-hero relative min-w-0"
    aria-live="polite"
  >
    <div class="flex items-start gap-5">
      <div class="relative min-w-0 max-w-2xl flex-1">
        <!-- Soft dark scrim behind the text block: keeps copy readable over the brightest art
             without boxing it in an opaque panel. -->
        <div
          aria-hidden="true"
          class="pointer-events-none absolute -inset-x-8 -inset-y-6 -z-10 bg-[radial-gradient(closest-side,rgb(var(--eldra-ink-rgb)/0.6),transparent)]"
        />
        <p class="eldra-kicker text-xs tracking-[0.34em] [text-shadow:0_1px_10px_rgb(0_0_0/0.95)]">
          {{ kicker }}
        </p>
        <h2
          class="mt-1 break-words font-serif text-4xl font-semibold leading-[1.05] text-eldra-text-strong [text-shadow:0_2px_24px_rgb(0_0_0/0.85)] sm:text-5xl xl:text-6xl"
        >
          {{ entry?.name ?? emptyTitle }}
        </h2>

        <!-- Ornamental rule: restrained, decorative only. -->
        <div
          aria-hidden="true"
          class="my-3 flex max-w-xs items-center gap-2 text-eldra-accent/70"
        >
          <span class="h-px flex-1 bg-gradient-to-r from-eldra-accent/70 to-transparent" />
          <span class="size-1.5 rotate-45 bg-eldra-accent-bright/80" />
          <span class="h-px w-6 bg-eldra-accent/40" />
        </div>

        <p
          v-if="entry && highlights.summary"
          class="max-w-xl text-sm leading-6 text-eldra-text-soft [text-shadow:0_1px_12px_rgb(0_0_0/0.9)] sm:text-base sm:leading-7"
          :class="detailsOpen ? '' : 'line-clamp-5'"
        >
          {{ highlights.summary }}
        </p>
        <p
          v-else-if="entry"
          class="max-w-xl text-sm leading-6 text-eldra-text-soft"
        >
          This Content Pack publishes no description for {{ entry.name }}.
        </p>
        <p
          v-else
          class="max-w-xl text-sm leading-6 text-eldra-text-soft"
        >
          {{ emptyHint }}
        </p>

        <!-- Highlights: named gifts first, then the mechanical facts. -->
        <ul
          v-if="highlights.traits.length"
          class="mt-4 flex flex-wrap gap-x-5 gap-y-3"
          aria-label="What this gives you"
        >
          <li
            v-for="trait in highlights.traits"
            :key="trait"
            class="flex w-20 flex-col items-center gap-1.5 text-center"
          >
            <span
              aria-hidden="true"
              class="flex size-12 items-center justify-center rounded-full border border-eldra-accent/55 bg-eldra-ink/70 text-eldra-accent-bright shadow-[0_0_18px_rgb(var(--eldra-accent-rgb)/0.25)] backdrop-blur-sm"
            >
              <UIcon
                name="i-lucide-sparkle"
                class="size-5"
              />
            </span>
            <span class="text-[0.7rem] font-semibold leading-tight text-eldra-text-strong [text-shadow:0_1px_8px_rgb(0_0_0/0.9)]">{{ trait }}</span>
          </li>
        </ul>

        <dl
          v-if="highlights.facts.length"
          class="mt-4 grid max-w-xl grid-cols-2 gap-2 xl:grid-cols-4"
        >
          <div
            v-for="fact in highlights.facts"
            :key="fact.label"
            class="min-w-0 border-l-2 border-eldra-accent/55 bg-eldra-ink/55 px-2.5 py-1.5 backdrop-blur-sm"
          >
            <dt class="flex items-start gap-1 text-[0.6rem] uppercase tracking-[0.12em] text-eldra-text-faint">
              <UIcon
                :name="iconFor(fact.label)"
                class="mt-px size-3 shrink-0 text-eldra-accent"
              />
              <span class="leading-tight">{{ fact.label }}</span>
            </dt>
            <dd class="mt-0.5 text-xs font-semibold leading-snug text-eldra-text-strong">
              {{ fact.value }}
            </dd>
          </div>
        </dl>

        <button
          v-if="entry"
          type="button"
          class="mt-4 inline-flex min-h-11 items-center gap-2 border border-eldra-accent/55 bg-eldra-ink/60 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-eldra-accent-text backdrop-blur-sm transition hover:border-eldra-accent-bright/80 hover:bg-eldra-accent/15 focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
          :aria-expanded="detailsOpen"
          @click="detailsOpen = !detailsOpen"
        >
          {{ detailsOpen ? 'Hide Full Details' : 'View Full Details' }}
          <UIcon
            :name="detailsOpen ? 'i-lucide-chevron-up' : 'i-lucide-arrow-right'"
            class="size-4"
          />
        </button>

        <slot />
      </div>

      <!-- Framed figure, only when the art is not already the backdrop. -->
      <figure
        v-if="showFigure"
        class="eldra-frame-corners relative hidden w-48 shrink-0 overflow-hidden border border-eldra-accent/40 bg-eldra-ink/60 shadow-2xl lg:block xl:w-56"
      >
        <img
          ref="figureRef"
          :src="figureUrl!"
          :alt="entry ? `Artwork for ${entry.name}` : ''"
          loading="lazy"
          decoding="async"
          class="block aspect-[3/4] w-full object-cover object-top"
          @error="figureFailed = figureUrl ?? null"
        >
      </figure>
    </div>

    <!-- Full details drawer: dark glass, never an opaque slab. -->
    <div
      v-if="detailsOpen && entry"
      class="mt-5 max-w-3xl border border-eldra-accent/30 bg-eldra-ink/82 p-4 backdrop-blur-md"
    >
      <ContentPresentationPanel
        :entry="entry"
        context="preview"
        collapse-first-section
        :hide-artwork="true"
        empty-message="This Content Pack publishes no further details."
      />
    </div>
  </section>
</template>
