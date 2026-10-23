<script setup lang="ts">
// The ONE renderer for a resolved Content Pack entry -- Character Builder /
// Character Sheet Phase 2.
//
// Rendered by BOTH character surfaces, deliberately:
//   Builder (app/pages/worlds/[id]/characters/create-v2.vue)
//     preview, BEFORE selection -- "what am I about to choose?"
//   Sheet   (app/pages/worlds/[id]/characters/[characterId]/sheet-v2.vue)
//     display, AFTER creation -- "what did I choose?"
//
// Same component, same models, different context. That is the point: a
// player who learned to read a Species in the Builder reads it identically
// on their Sheet, and a change to how a trait is presented lands on both at
// once. `context` changes only the heading treatment -- never which
// information is available.
//
// KNOWS NO GAME SYSTEM AND NO 5ETOOLS FIELD NAME. It receives a
// PresentationEntry (app/lib/content-presentation/types.ts) -- a
// description, labelled facts, named prose sections, and notes -- and
// renders those four things generically. It cannot tell a Species from a
// Background, and must not be able to.
//
// ---------------------------------------------------------------------------
// MOBILE IS NOT A REDUCED MODE
// ---------------------------------------------------------------------------
// Every piece of information is present at every width; only ARRANGEMENT
// changes, and it changes through CSS rather than a JS breakpoint, so there
// is no viewport measurement, no hydration mismatch, and nothing that can be
// gated behind a layout:
//   - facts stack one per row on phones and pair into two columns from `sm`
//   - sections are native <details>, so a phone gets collapsible cards and a
//     desktop the same cards, already legible, with the first one open
//   - <summary> is min-h-11 (44px, the iOS target guidance) and full-width,
//     so the whole header is the tap target
//   - every long value gets `break-words` and every container `min-w-0`, so
//     a 60-item skill list wraps instead of scrolling the page sideways
//
// Native <details>/<summary> rather than a custom disclosure: it brings
// keyboard operation, screen-reader state, and find-in-page (browsers expand
// a collapsed <details> to reveal a match) with no script at all.
//
// `list-none` and `marker:hidden` together are not redundant: the first
// removes the default triangle in Chrome and Firefox, the second covers
// WebKit's ::-webkit-details-marker, which ignores list-style. Tailwind's
// `marker:` variant emits both pseudo-elements; the arbitrary-variant
// spelling of the same rule was verified NOT to survive the class scan in
// this project's build, so it must not be used here.

import type { PresentationEntry } from '~/lib/content-presentation'
import CreationEntityEmblem from './builder/CreationEntityEmblem.vue'

const props = withDefaults(defineProps<{
  entry?: PresentationEntry | null
  // Shown when there is no entry at all, or the pack published nothing
  // readable for it.
  emptyMessage?: string
  // 'preview' is the Builder's before-selection framing; 'detail' is the
  // Sheet's after-creation framing. Heading emphasis only.
  context?: 'preview' | 'detail'
  // CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- READABILITY. The real reported problem:
  // Class Features (and a Background's own printed Equipment paragraph) are always the FIRST
  // section, so they rendered OPEN by default, reading as a wall of prose the instant a choice
  // was made. Defaults to `false` (preserving every existing caller's behaviour byte-for-byte,
  // Sheet included) -- the Builder passes `true` explicitly, since ITS OWN complaint is "too much
  // open text before a real decision is even made." Every section is still ONE CLICK away either
  // way; nothing here removes information, only its default visibility.
  collapseFirstSection?: boolean
  // CHARACTER CREATOR V3 -- the cinematic hero already shows this entry's artwork as the stage
  // itself, so its details drawer omits the framed artwork block. Default false: every other
  // caller (Sheet, spell inspection) is unchanged.
  hideArtwork?: boolean
}>(), {
  entry: null,
  emptyMessage: 'This Content Pack publishes no further details for this entry.',
  context: 'detail',
  collapseFirstSection: false,
  hideArtwork: false
})

// CONTENT PRESENTATION REPAIR (B1) -- artwork. Species/Class/Background are
// the only kinds a Content Pack's fluff join ever carries an `images` array
// for (see readImage, app/lib/content-presentation/dnd5e.ts) -- Spells never
// set `entry.image`, so this framed block is scoped to the other three kinds
// on purpose: a Spell's detail panel must render exactly as it did before
// this task, never gain an empty artwork frame no fluff join could ever fill.
const showsArtworkFrame = computed(() => !!props.entry && props.entry.kind !== 'spell' && !props.hideArtwork)

// A `url` that 404s (a pack's fluff join pointed at a path the running
// deployment's /api/5etools-img route can't read) must fall back to the
// existing monogram rather than a broken <img>. Reset per entry so swapping
// the inspected option doesn't carry a stale failure forward.
const imageFailed = ref(false)
watch(() => props.entry, () => { imageFailed.value = false })
</script>

<template>
  <div class="min-w-0">
    <p
      v-if="!entry"
      class="rounded-none border border-dashed border-eldra-accent/24 p-4 text-sm text-eldra-text-faint"
    >
      {{ emptyMessage }}
    </p>

    <template v-else>
      <!-- Artwork ----------------------------------------------------------
           A prominent framed panel when the pack's fluff join published a
           usable image; the existing monogram emblem otherwise -- never a
           broken image, never fabricated art. Scoped away from Spells; see
           showsArtworkFrame above. -->
      <div
        v-if="showsArtworkFrame"
        class="eldra-frame-corners mb-4 overflow-hidden rounded-none border border-eldra-accent/30 bg-eldra-ink/35"
      >
        <img
          v-if="entry!.image && !imageFailed"
          :src="entry!.image.url"
          :alt="`Artwork for ${entry!.name}`"
          loading="lazy"
          class="block max-h-72 w-full object-cover sm:max-h-80"
          @error="imageFailed = true"
        >
        <div
          v-else
          class="flex items-center justify-center bg-gradient-to-b from-eldra-accent/10 to-transparent py-10"
        >
          <CreationEntityEmblem
            :title="entry!.name"
            size="lg"
          />
        </div>
        <p
          v-if="entry!.image && !imageFailed && entry!.image.credit"
          class="border-t border-eldra-accent/14 bg-eldra-panel/70 px-3 py-1 text-right text-[0.65rem] text-eldra-text-faint"
        >
          Art: {{ entry!.image.credit }}
        </p>
      </div>

      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3
          class="min-w-0 break-words font-semibold text-eldra-text-strong"
          :class="context === 'preview' ? 'text-lg' : 'text-xl'"
        >
          {{ entry.name }}
        </h3>
        <p
          v-if="entry.sourceBook"
          class="text-xs uppercase tracking-[0.16em] text-eldra-text-faint"
        >
          {{ entry.sourceBook }}<template v-if="entry.sourcePage"> · p.{{ entry.sourcePage }}</template>
        </p>
      </div>

      <!-- Description ---------------------------------------------------- -->
      <div
        v-if="entry.description.length"
        class="mt-3 space-y-2"
      >
        <p
          v-for="(paragraph, index) in entry.description"
          :key="`description-${index}`"
          class="break-words text-sm leading-6 text-eldra-text-soft"
        >
          {{ paragraph }}
        </p>
      </div>

      <!-- Facts ----------------------------------------------------------
           One per row on phones; two columns from `sm`. A <dl> because that
           is what a labelled-value list is -- screen readers announce the
           pairing without any ARIA. -->
      <dl
        v-if="entry.facts.length"
        class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2"
      >
        <div
          v-for="item in entry.facts"
          :key="item.label"
          class="min-w-0"
        >
          <dt class="text-xs uppercase tracking-[0.16em] text-eldra-text-faint">
            {{ item.label }}
          </dt>
          <dd class="mt-0.5 break-words text-sm leading-6 text-eldra-text-strong">
            {{ item.value }}
          </dd>
        </div>
      </dl>

      <!-- Sections ------------------------------------------------------- -->
      <div
        v-if="entry.sections.length"
        class="mt-4 grid gap-1.5"
      >
        <details
          v-for="(section, index) in entry.sections"
          :key="section.title"
          :open="index === 0 && !collapseFirstSection"
          class="group min-w-0 rounded-none border border-eldra-accent/20 bg-eldra-panel/68"
        >
          <summary
            class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-eldra-accent-text marker:hidden focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
          >
            <span class="min-w-0 break-words">{{ section.title }}</span>
            <!-- Shape, not colour alone: the marker rotates with the open
                 state, so the disclosure is legible without relying on tint. -->
            <span
              aria-hidden="true"
              class="shrink-0 text-eldra-text-faint transition-transform group-open:rotate-90"
            >&#9656;</span>
          </summary>
          <div class="space-y-2 border-t border-eldra-accent/14 px-4 py-3">
            <p
              v-for="(paragraph, paragraphIndex) in section.paragraphs"
              :key="paragraphIndex"
              class="break-words text-sm leading-6 text-eldra-text-soft"
            >
              {{ paragraph }}
            </p>
          </div>
        </details>
      </div>

      <!-- Notes -----------------------------------------------------------
           What the pack does NOT contain. Rendered plainly rather than as a
           warning: a missing description is a fact about the published
           content, not an error the player caused or can fix. -->
      <ul
        v-if="entry.notes.length"
        class="mt-3 space-y-1"
      >
        <li
          v-for="note in entry.notes"
          :key="note"
          class="break-words text-xs leading-5 text-eldra-text-faint"
        >
          {{ note }}
        </li>
      </ul>
    </template>
  </div>
</template>
