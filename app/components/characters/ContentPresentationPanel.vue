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

withDefaults(defineProps<{
  entry?: PresentationEntry | null
  // Shown when there is no entry at all, or the pack published nothing
  // readable for it.
  emptyMessage?: string
  // 'preview' is the Builder's before-selection framing; 'detail' is the
  // Sheet's after-creation framing. Heading emphasis only.
  context?: 'preview' | 'detail'
}>(), {
  entry: null,
  emptyMessage: 'This Content Pack publishes no further details for this entry.',
  context: 'detail'
})
</script>

<template>
  <div class="min-w-0">
    <p
      v-if="!entry"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-4 text-sm text-[#9f9278]"
    >
      {{ emptyMessage }}
    </p>

    <template v-else>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3
          class="min-w-0 break-words font-semibold text-[#fff7df]"
          :class="context === 'preview' ? 'text-lg' : 'text-xl'"
        >
          {{ entry.name }}
        </h3>
        <p
          v-if="entry.sourceBook"
          class="text-xs uppercase tracking-[0.16em] text-[#9f9278]"
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
          class="break-words text-sm leading-6 text-[#d8ceb8]"
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
          <dt class="text-xs uppercase tracking-[0.16em] text-[#9f9278]">
            {{ item.label }}
          </dt>
          <dd class="mt-0.5 break-words text-sm leading-6 text-[#fff7df]">
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
          :open="index === 0"
          class="group min-w-0 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)]"
        >
          <summary
            class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-[#f5e7bd] marker:hidden focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
          >
            <span class="min-w-0 break-words">{{ section.title }}</span>
            <!-- Shape, not colour alone: the marker rotates with the open
                 state, so the disclosure is legible without relying on tint. -->
            <span
              aria-hidden="true"
              class="shrink-0 text-[#9f9278] transition-transform group-open:rotate-90"
            >&#9656;</span>
          </summary>
          <div class="space-y-2 border-t border-[rgba(201,164,90,0.14)] px-4 py-3">
            <p
              v-for="(paragraph, paragraphIndex) in section.paragraphs"
              :key="paragraphIndex"
              class="break-words text-sm leading-6 text-[#d8ceb8]"
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
          class="break-words text-xs leading-5 text-[#6f6754]"
        >
          {{ note }}
        </li>
      </ul>
    </template>
  </div>
</template>
