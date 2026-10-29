<script setup lang="ts">
// WorldRollTray -- Eldra Roll System Phase 2C
// (.github/docs/architecture/eldra-roll-system.md §9, inserted between
// Phase 2B/2B.1 and Phase 3 per this task's own scope). The permanent,
// canonical presentation for roll results, replacing Phase 2B's temporary
// inline "latest roll" strip on the Character Sheet AND
// AdminRollSandbox.vue's own hand-built Result/History blocks -- ONE
// history UI, not two (this task's own instruction).
//
// WORLD-SCOPED, NOT SHEET-SCOPED (§9's own naming rationale: "table rolls,
// once Phase 6 exists, are a World-wide concern... not just the sheet that
// happened to trigger one"), which is why this lives in components/world/
// rather than components/characters/, even though its only mounting
// surfaces today are the Character Sheet and the Developer Sandbox. This
// component itself holds NO roll state -- every prop here comes straight
// off a `useWorldRolls()` instance the PARENT owns (sheet-v2.vue's own, or
// AdminRollSandbox.vue's own); a shared, cross-page World-level feed
// (realtime/table broadcast) is explicitly Phase 6+ and NOT built here --
// see this task's own DO NOT list.
//
// NOT A MODAL, NOT A TOAST, NOT A PERMANENT GIANT PANEL (this task's own
// DESIGN GOAL). It feels like a tabletop notebook / combat log / Discord
// chat: docked, persistent once opened, never auto-dismissing -- the
// player decides when to collapse it, exactly like a chat window they
// choose to minimize, never a transient notification that vanishes on its
// own.
//
// ---------------------------------------------------------------------------
// LOCATION
// ---------------------------------------------------------------------------
// Desktop/tablet (`sm:` and up): docked bottom-right, `fixed`, escaping
// this component's own containing page the same way
// MapSelectedPinCard.vue's identical `fixed bottom-6 right-6` floating
// panel already does. Bottom-right never reaches the world workspace's
// LEFT sidebar (world-workspace.vue), and never overlaps a Character
// Sheet's command center (CharacterSheetCommandCenter.vue is `sticky`
// within the page's own scroll container, not `fixed` -- the two occupy
// different positioning contexts entirely, so there is no z-index race to
// resolve, only geometry that never intersects at this corner).
//
// Mobile (below `sm`): a full-width sheet pinned to the bottom edge
// (`inset-x-0 bottom-0`), with the same safe-area padding
// MobileBottomNav.vue already uses
// (`pb-[max(env(safe-area-inset-bottom),1rem)]`) -- world-workspace.vue's
// own pages mount no bottom navigation bar today (that only exists under
// layouts/default.vue), so there is nothing to cover yet, but this keeps
// the tray forward-safe if one is ever added to this layout.
//
// A KNOWN, DELIBERATELY UNSOLVED EDGE CASE: when the Character Sheet's own
// context drawer (WorldEntityContextDrawer, opened from a Skill's info
// icon, an Action, a Spell, ...) is ALSO open at `xl:` widths, both it and
// this tray want the right edge of the screen. This phase does not teach
// either surface about the other -- z-30 here matches
// MapSelectedPinCard.vue's own established "floating panel" z-index, which
// keeps the tray behind the drawer rather than over it if they ever
// visually collide, but no explicit compensation is implemented. Flagged
// for a future phase to resolve for real (most likely: the tray shifts
// left by the drawer's width, mirroring how sheet-v2.vue already
// compresses its own main column for the drawer) rather than guessed at
// here.
//
// ---------------------------------------------------------------------------
// BEHAVIOR / ANIMATION
// ---------------------------------------------------------------------------
// New rolls PREPEND (`rolls` is already newest-first, straight off
// `useWorldRolls().history`) and slide/fade in at the top via
// `<TransitionGroup>`; existing rows animate to their new position with
// the same `move-class`, which is what makes "previous rolls move
// downward" a real animation rather than an instant reflow. Never
// auto-dismisses -- there is no timer anywhere in this file. Collapsing is
// entirely the player's own action (`collapsed`, local to this component --
// purely a display preference, not something any caller needs to persist
// or coordinate with the roll data itself).
//
// Kept tasteful on purpose (this task's own ANIMATION section): a slide, a
// fade, a subtle elevation change on the newest entry
// (WorldRollTrayEntry.vue's own `isLatest` prop) -- no bouncing numbers, no
// particles. Spectacle is reserved for 3D dice, not built here.
//
// ---------------------------------------------------------------------------
// RESERVED FOR 3D DICE (later phase, not built here)
// ---------------------------------------------------------------------------
// The `dice-stage` slot below, between the header and the scrolling feed,
// is the documented, reserved location a future phase's 3D dice
// presentation animates into before settling/collapsing into the top of
// the history list below it. Nothing is rendered here today (an empty
// slot renders nothing) -- no dice component exists, no
// `@3d-dice/dice-box` import happens anywhere in this file, matching this
// task's own "do not render dice yet, do not install dice libraries."

import WorldRollTrayEntry from '~/components/world/WorldRollTrayEntry.vue'
import WorldManualDiceRack from '~/components/world/WorldManualDiceRack.vue'
import type { ManualDieOption } from '~/lib/rolls/requests'
import type { RollEventRecord } from '~/lib/rolls/types'

const props = withDefaults(defineProps<{
  // Newest-first, exactly `useWorldRolls().history`'s own order -- this
  // component never re-sorts.
  rolls?: readonly RollEventRecord[]
  // A roll request is in flight (`useWorldRolls().pending`) -- shows a
  // pending placeholder at the top of the feed, in the same slot the
  // finished roll will occupy once the server answers.
  pending?: boolean
  // The most recent roll REQUEST's own rejection (`useWorldRolls().error`)
  // -- the server's message, verbatim, never replaced with generic text.
  error?: string
  // A history fetch (initial load or Load More) is in flight
  // (`useWorldRolls().historyPending`) -- distinct from `pending` above,
  // which is about REQUESTING a new roll, not reading old ones.
  historyPending?: boolean
  historyError?: string
  // Whether a further page exists (`Boolean(useWorldRolls().nextCursor)`)
  // -- the caller owns cursor state; this component only renders the
  // button and emits `load-more`.
  hasMore?: boolean
  defaultCollapsed?: boolean
  emptyMessage?: string
}>(), {
  rolls: () => [],
  pending: false,
  error: '',
  historyPending: false,
  historyError: '',
  hasMore: false,
  defaultCollapsed: false,
  emptyMessage: 'No rolls yet. Click an ability, save, or skill to roll one.'
})

const emit = defineEmits<{
  'load-more': []
  // Phase 4B.7 -- the player picked one die off the manual dice rack.
  // This component has no opinion on visibility or the actual request
  // shape (see WorldManualDiceRack.vue's own header) -- the page that
  // mounts this Tray, which already owns a `useWorldRolls()` instance and
  // its own Private/Table selection, turns this into an actual roll.
  'roll-manual-die': [ManualDieOption]
}>()

// Local UI state, not persisted or shared -- exactly the collapse pattern
// CharacterSheetSection.vue's own `collapsible`/`isOpen` already
// establishes for this codebase.
const collapsed = ref(props.defaultCollapsed)

const latestRoll = computed(() => props.rolls[0] ?? null)
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end sm:px-0 sm:pb-0"
  >
    <div class="pointer-events-auto w-full max-w-md sm:w-96">
      <!-- Collapsed handle -- "a compact Roll Tray handle with the latest
           total" (this task's own BEHAVIOR section). -->
      <Transition
        enter-from-class="opacity-0 translate-y-2"
        enter-active-class="transition duration-150 ease-out"
        leave-to-class="opacity-0 translate-y-2"
        leave-active-class="transition duration-150 ease-in"
      >
        <button
          v-if="collapsed"
          type="button"
          class="eldra-ornate-panel eldra-frame-corners flex w-full items-center gap-3 rounded-none border px-4 py-2.5 text-left backdrop-blur sm:ml-auto sm:w-auto"
          aria-label="Expand Roll Tray"
          @click="collapsed = false"
        >
          <UIcon
            name="i-lucide-dices"
            class="h-4 w-4 shrink-0 text-[#c9a45a]"
          />
          <span class="text-sm text-[#d8ceb8]">Roll Tray</span>
          <span
            v-if="latestRoll"
            class="ml-auto shrink-0 font-mono text-lg font-semibold tabular-nums text-[#fff7df]"
          >{{ latestRoll.total }}</span>
        </button>
      </Transition>

      <!-- Expanded tray -->
      <Transition
        enter-from-class="opacity-0 translate-y-4"
        enter-active-class="transition duration-200 ease-out"
        leave-to-class="opacity-0 translate-y-4"
        leave-active-class="transition duration-150 ease-in"
      >
        <div
          v-if="!collapsed"
          class="eldra-ornate-panel eldra-frame-corners flex max-h-[70vh] w-full flex-col rounded-none border backdrop-blur sm:max-h-[32rem]"
        >
          <header class="flex shrink-0 items-center justify-between gap-2 border-b border-[rgba(201,164,90,0.14)] px-4 py-2.5">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-dices"
                class="h-4 w-4 text-[#c9a45a]"
              />
              <span class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Roll Tray</span>
            </div>

            <div class="flex items-center gap-2">
              <!-- Generic extension point -- e.g. a Private/Table
                   visibility toggle for whatever's ABOUT to be rolled.
                   That is a REQUESTING concern the page/caller owns
                   (`useWorldRolls().requestRoll`'s own `visibility`
                   input), not something this DISPLAY-only component
                   should know exists -- deliberately not hardcoded here so
                   this stays reusable by a future mounting surface with a
                   different (or no) such control. -->
              <slot name="header-actions" />

              <button
                type="button"
                class="text-[#9f9278] transition hover:text-[#d8ceb8]"
                aria-label="Collapse Roll Tray"
                @click="collapsed = true"
              >
                <UIcon
                  name="i-lucide-chevron-down"
                  class="h-4 w-4"
                />
              </button>
            </div>
          </header>

          <!-- RESERVED FOR 3D DICE -- see this file's own header. Empty on
               purpose; a future phase fills this slot from whichever page
               mounts the tray. -->
          <slot name="dice-stage" />

          <!-- Manual dice rack -- Phase 4B.7. Below Private/Table
               (header-actions, above), above history (below). A real,
               built-in feature of the Tray itself -- not a slot -- since
               every page that mounts a Tray should get it "for free," the
               same way Load More already is. -->
          <div class="shrink-0 border-b border-[rgba(201,164,90,0.14)] px-3 py-2">
            <WorldManualDiceRack
              :disabled="pending"
              @roll="emit('roll-manual-die', $event)"
            />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            <p
              v-if="error"
              class="mb-2 rounded-none border border-red-500/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200"
            >
              {{ error }}
            </p>

            <!-- Pending placeholder -- occupies the same top-of-feed
                 position the finished roll will animate into. No count-up,
                 no particles: a plain, dimmed row. -->
            <div
              v-if="pending"
              class="mb-1.5 animate-pulse rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-2.5 text-xs text-[#9f9278]"
            >
              Rolling…
            </div>

            <TransitionGroup
              v-if="rolls.length"
              tag="ul"
              class="grid gap-1.5"
              enter-from-class="opacity-0 -translate-y-2"
              enter-active-class="transition duration-200 ease-out"
              leave-to-class="opacity-0"
              leave-active-class="transition duration-150 ease-in"
              move-class="transition duration-200 ease-out"
            >
              <WorldRollTrayEntry
                v-for="(roll, index) in rolls"
                :key="roll.id"
                :roll="roll"
                :is-latest="index === 0"
              />
            </TransitionGroup>

            <p
              v-else-if="!pending"
              class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-3 text-sm text-[#9f9278]"
            >
              {{ emptyMessage }}
            </p>

            <!-- Load More -- bottom of the feed, oldest end, per this
                 task's own SCROLLING section. Same `nextCursor` pagination
                 GET /rolls already shipped in Phase 1
                 (useWorldRolls.ts's own `loadMoreHistory`). -->
            <div
              v-if="hasMore"
              class="mt-2 flex justify-center"
            >
              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-1.5 text-xs font-semibold text-[#fff7df] transition disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="historyPending"
                @click="emit('load-more')"
              >
                {{ historyPending ? 'Loading…' : 'Load more' }}
              </button>
            </div>

            <p
              v-if="historyError"
              class="mt-2 rounded-none border border-red-500/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200"
            >
              {{ historyError }}
            </p>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
