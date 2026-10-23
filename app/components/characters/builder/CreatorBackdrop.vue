<script setup lang="ts">
// Character Creator V3 -- the cinematic backdrop. Purely presentational: it
// paints whatever `ResolvedCreatorBackdrop` it is handed (the decision of WHICH
// image lives in app/lib/characters/creator-presentation.ts) and reports an
// image that fails to load so the resolver can fall to the next tier.
//
// Legibility is built in, not left to callers: whatever the artwork, a layered
// set of gradients keeps the left column (choices) and the lower band (hero
// text) dark and calm while the right of the frame stays open, so the art
// breathes without competing with controls.
//
// MOTION: a plain opacity crossfade plus a very slow transform settle, both
// CSS-only. `prefers-reduced-motion` and a config `transition: none` remove
// both. No animation library, no per-frame JavaScript.

import {
  focalObjectPosition,
  type ResolvedCreatorBackdrop
} from '~/lib/characters/creator-presentation'
import type { BuilderStepKey } from './characterBuilderSelection'

const props = withDefaults(defineProps<{
  backdrop: ResolvedCreatorBackdrop
  stage: BuilderStepKey
  transitionMs?: number
}>(), {
  transitionMs: 700
})

const emit = defineEmits<{ failed: [url: string] }>()

// Stage-level atmosphere for when there is no artwork at all: each stage gets
// its own restrained colour wash over the theme ground, so a stage still feels
// like a distinct place. Tokens, not literals, for the base; the wash hues are
// intentionally fixed accents layered at low alpha.
const STAGE_WASH: Record<BuilderStepKey, string> = {
  identity: 'radial-gradient(70% 60% at 72% 30%, rgb(255 226 150 / 0.38), transparent 72%)',
  species: 'radial-gradient(70% 60% at 72% 30%, rgb(255 226 150 / 0.38), transparent 72%)',
  class: 'radial-gradient(70% 60% at 70% 35%, rgb(214 98 62 / 0.34), transparent 72%)',
  background: 'radial-gradient(70% 60% at 70% 35%, rgb(214 150 70 / 0.38), transparent 72%)',
  proficiencies: 'radial-gradient(70% 60% at 70% 35%, rgb(110 170 150 / 0.3), transparent 72%)',
  spells: 'radial-gradient(70% 60% at 70% 35%, rgb(96 130 230 / 0.4), transparent 72%)',
  equipment: 'radial-gradient(70% 60% at 70% 35%, rgb(170 110 60 / 0.38), transparent 72%)',
  abilities: 'radial-gradient(70% 60% at 70% 35%, rgb(150 110 210 / 0.34), transparent 72%)',
  review: 'radial-gradient(70% 60% at 70% 35%, rgb(255 226 150 / 0.3), transparent 72%)'
}

// A backdrop that failed during server-render parsing never reaches the `error` handler (it
// fires before hydration), so re-check once on mount and report it like any other failure.
const imgRef = ref<HTMLImageElement | null>(null)
onMounted(() => {
  const el = imgRef.value
  if (el && el.complete && el.naturalWidth === 0 && props.backdrop.image) emit('failed', props.backdrop.image)
})

const wash = computed(() => STAGE_WASH[props.stage] ?? STAGE_WASH.identity)
const duration = computed(() => `${Math.max(0, props.transitionMs)}ms`)
</script>

<template>
  <div
    aria-hidden="true"
    class="creator-backdrop pointer-events-none absolute inset-0 overflow-hidden bg-eldra-ink"
    :style="{ '--creator-fade': duration }"
  >
    <!-- Ground: theme tokens only, so every theme (and the accessibility
         theme) gets a coherent base even with no artwork. -->
    <div class="absolute inset-0 bg-[linear-gradient(180deg,rgb(var(--eldra-ground-top-rgb)),rgb(var(--eldra-ground-bottom-rgb)))]" />
    <div
      class="absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none"
      :style="{ backgroundImage: wash }"
    />

    <Transition name="creator-fade">
      <img
        v-if="backdrop.image"
        ref="imgRef"
        :key="backdrop.key"
        :src="backdrop.image"
        alt=""
        decoding="async"
        class="creator-backdrop-image absolute inset-0 h-full w-full object-cover"
        :style="{ objectPosition: focalObjectPosition(backdrop) }"
        @error="emit('failed', backdrop.image!)"
      >
    </Transition>

    <!-- Legibility, layered: configured darkness, then a left-weighted veil
         (choices live there), a lower band (hero text lives there), a top
         band (navigation), and a soft vignette. -->
    <div
      class="absolute inset-0 bg-eldra-ink"
      :style="{ opacity: backdrop.overlay }"
    />
    <div class="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--eldra-ink-rgb)/0.86)_0%,rgb(var(--eldra-ink-rgb)/0.5)_32%,rgb(var(--eldra-ink-rgb)/0.08)_62%,transparent_100%)] max-lg:bg-[linear-gradient(180deg,rgb(var(--eldra-ink-rgb)/0.55)_0%,rgb(var(--eldra-ink-rgb)/0.35)_35%,rgb(var(--eldra-ink-rgb)/0.9)_75%)]" />
    <div class="absolute inset-x-0 bottom-0 h-2/5 bg-[linear-gradient(0deg,rgb(var(--eldra-ink-rgb)/0.82),transparent)]" />
    <div class="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgb(var(--eldra-ink-rgb)/0.78),transparent)]" />
    <div class="absolute inset-0 bg-[radial-gradient(120%_90%_at_60%_40%,transparent_55%,rgb(var(--eldra-ink-rgb)/0.55))]" />
  </div>
</template>

<style scoped>
.creator-fade-enter-active,
.creator-fade-leave-active {
  transition: opacity var(--creator-fade, 700ms) ease, transform calc(var(--creator-fade, 700ms) * 4) ease-out;
}
.creator-fade-enter-from {
  opacity: 0;
  transform: scale(1.035);
}
.creator-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .creator-fade-enter-active,
  .creator-fade-leave-active {
    transition: none;
  }
  .creator-fade-enter-from {
    transform: none;
  }
}
</style>
