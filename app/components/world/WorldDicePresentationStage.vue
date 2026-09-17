<script setup lang="ts">
// WorldDicePresentationStage -- Roll System Phase 4C.2 (Dice Stage
// Position Normalization). THE ONE PLACE SCREEN POSITION LIVES for the
// entire Dice Presentation Layer. See app/lib/dice-presentation/
// placement.ts's own header for the full traced root cause (four
// independently-hand-tuned `fixed` positions across four renderer files)
// this component replaces.
//
// WorldDiceOverlay.vue mounts this ONCE and renders every renderer
// (the Phase 3A placeholder, the physics comparison renderer, the frozen
// authored d20, and the general authored polyhedral renderer) as ITS
// children -- each renderer's OWN template now only owns its inner
// content and its own `visible`-driven opacity/scale transition
// (`absolute inset-0`, filling whatever box this component provides),
// never where that box sits on the page. Die TYPE therefore cannot
// select a different screen placement -- there is only one placement to
// select.
//
// DEFAULT ANCHOR: 'tray-left' (app/lib/dice-presentation/placement.ts).
// Desktop: docked to the SAME bottom shelf WorldRollTray.vue's own
// desktop panel uses (`sm:bottom-6`), positioned immediately to its
// LEFT with a modest gap -- computed from WorldRollTray.vue's own real,
// documented dimensions (`sm:right-6` = 1.5rem, panel `sm:w-96` = 24rem)
// rather than an arbitrary screen-center guess: this stage's own
// `right` offset is `1.5rem (tray's own right offset) + 24rem (tray's
// own panel width) + 1rem (gap) = 26.5rem`. This is a STABLE CSS
// relationship (computed once, here, as a literal value), never a
// per-frame DOM measurement -- if WorldRollTray.vue's own dimensions
// ever change, this literal needs a matching update, exactly as any
// other cross-component CSS coupling in this codebase already works.
// Mobile: no room for a side-by-side layout -- the stage docks ABOVE
// where WorldRollTray.vue's own collapsed/expanded mobile sheet sits,
// horizontally centered, matching the vertical clearance
// (`bottom-40`) three of the four PREVIOUSLY-divergent renderer
// positions already independently converged on.
//
// SIZE: `h-56 w-56` (224px) mobile / `sm:h-72 sm:w-72` (288px) desktop --
// the frozen d20 renderer's own already-accepted framing shell,
// unchanged in value, now the ONE shared shell every renderer's inner
// content (whatever its own native size) centers within.
//
// Z-INDEX: `z-40` -- deliberately LOWER than the frozen d20/physics
// renderers' own previous `z-[175]` (a value high enough to sit above
// virtually anything, including modal-level UI, which this task's own
// Z-INDEX/POINTER EVENTS section explicitly warns against) and higher
// than WorldRollTray.vue's own `z-30`, so the dice stage reads as
// associated with, and above, the Tray it sits beside, without ever
// competing with an actual modal/dialog surface.
//
// POINTER EVENTS: the stage itself is `pointer-events-none` (visual
// ceremony only); WorldDiceOverlay.vue re-enables `pointer-events-auto`
// on the ONE piece that has ever needed real interaction (the Phase 3A
// placeholder's own clickable/hoverable card) -- unchanged behavior,
// just relocated.
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-40 z-40 flex justify-center sm:inset-x-auto sm:bottom-6 sm:right-[calc(1.5rem+24rem+1rem)] sm:justify-end"
  >
    <div class="pointer-events-none relative h-56 w-56 sm:h-72 sm:w-72">
      <slot />
    </div>
  </div>
</template>
